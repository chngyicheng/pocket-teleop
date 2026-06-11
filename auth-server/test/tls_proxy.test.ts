import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let mockServer: http.Server;
let mockPort: number;
let correctHash: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-tls-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  correctHash = await bcrypt.hash('correctpass', 10);

  mockServer = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  await new Promise<void>((r) => mockServer.listen(0, r));
  mockPort = (mockServer.address() as net.AddressInfo).port;
});

afterAll(() => {
  mockServer.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedCreds() {
  fs.writeFileSync(credPath, JSON.stringify({
    username: 'admin',
    passwordHash: correctHash,
    mustChangePassword: false,
  }));
}

function getApp() {
  seedCreds();
  return createApp({
    credPath,
    sessionsPath,
    sessionSecret: 'test-secret',
    webClientUrl: `http://localhost:${mockPort}`,
  });
}

describe('TLS proxy — X-Forwarded-Proto handling', () => {
  it('login POST with X-Forwarded-Proto: https sets Secure cookie', async () => {
    const agent = supertest.agent(getApp());
    const res = await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(302);
    // Cookie should have Secure flag when X-Forwarded-Proto: https
    const setCookieHeader = res.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(cookieString).toContain('Secure');
  });

  it('login POST without X-Forwarded-Proto (plain HTTP) does NOT set Secure cookie', async () => {
    const agent = supertest.agent(getApp());
    const res = await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(302);
    // Cookie should NOT have Secure flag on plain HTTP
    const setCookieHeader = res.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(cookieString).not.toContain('Secure');
  });
});
