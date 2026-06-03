import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { makeWsUpgradeHandler } from '../src/proxy.js';

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let correctHash: string;
let authServer: http.Server;
let authPort: number;
let mockWsServer: http.Server;
let mockWsPort: number;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-ws-upgrade-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  correctHash = await bcrypt.hash('correctpass', 10);
  fs.writeFileSync(credPath, JSON.stringify({
    username: 'admin',
    passwordHash: correctHash,
    mustChangePassword: false,
  }));

  // Mock upstream WebSocket server that echoes upgrades
  mockWsServer = http.createServer();
  mockWsServer.on('upgrade', (req, socket, head) => {
    // Echo back the upgrade response if we get here (this is what auth-server would proxy to)
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n' +
      '\r\n'
    );
    socket.end();
  });
  await new Promise<void>((r) => mockWsServer.listen(0, r));
  mockWsPort = (mockWsServer.address() as net.AddressInfo).port;

  // Auth server with upgrade handler pointing to mock
  const app = createApp({
    credPath,
    sessionsPath,
    sessionSecret: 'test-secret',
    webClientUrl: 'http://localhost:9999',
  });

  authServer = app.listen(0);
  authServer.on('upgrade', makeWsUpgradeHandler(`http://localhost:${mockWsPort}`));
  await new Promise<void>((r) => {
    authServer.once('listening', r);
  });
  authPort = (authServer.address() as net.AddressInfo).port;
});

afterAll(() => {
  mockWsServer.close();
  authServer.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WebSocket upgrade — H1 adversarial (requires session auth)', () => {
  it('rejects upgrade without session cookie (no 101 Switching Protocols)', async () => {
    return new Promise<void>((done) => {
      const socket = net.createConnection(authPort, 'localhost');
      let responseReceived = false;
      let statusLine = '';

      socket.on('connect', () => {
        // Send a raw WebSocket upgrade request with NO Cookie header
        socket.write(
          'GET /ws HTTP/1.1\r\n' +
          'Host: localhost\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          '\r\n'
        );
      });

      socket.on('data', (data) => {
        if (!responseReceived) {
          const text = data.toString();
          statusLine = text.split('\r\n')[0];
          responseReceived = true;
        }
      });

      socket.on('close', () => {
        // H1 hypothesis: code currently accepts this (101 Switching Protocols).
        // Test expects rejection (40x or connection close).
        // If the server returned 101, statusLine would be "HTTP/1.1 101 Switching Protocols".
        expect(statusLine).not.toContain('101');
        done();
      });

      socket.on('error', (err) => {
        // Connection error is also acceptable (auth-server refused to upgrade)
        expect(err).toBeDefined();
        done();
      });

      // Timeout safety: if upgrade succeeds (bug), server may not close; force exit after 2s
      setTimeout(() => {
        socket.destroy();
        if (!responseReceived) {
          throw new Error(
            'Timeout: WebSocket upgrade did not respond. ' +
            'Expected auth-server to reject upgrade, but connection hung.'
          );
        }
        done();
      }, 2000);
    });
  });
});
