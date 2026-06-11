import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { buildWsCloseFrame, makeWsUpgradeHandler } from '../src/proxy.js';
import { EventEmitter } from 'events';

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let mockServer: http.Server;
let mockPort: number;
let correctHash: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-idle-timeout-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  // Pre-hash the password once to avoid bcrypt delay in each test
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
    mustChangePassword: false, // Critical: must be false so login doesn't redirect to change-password
  }));
}

function getApp(idleTimeoutMs?: number) {
  seedCreds();
  return createApp({
    credPath,
    sessionsPath,
    sessionSecret: 'test-secret',
    webClientUrl: `http://localhost:${mockPort}`,
    idleTimeoutMs,
  });
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('Session idle timeout', () => {
  it('should successfully login and set session', async () => {
    const app = getApp(200);
    const agent = supertest.agent(app);

    // Login
    const loginRes = await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(loginRes.status).toBe(302);

    // Try /auth/me (agent should preserve cookies)
    const meRes = await agent.get('/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe('admin');
  });

  it('should redirect to login when session exceeds idle timeout', async () => {
    const idleTimeoutMs = 200;
    const app = getApp(idleTimeoutMs);
    const agent = supertest.agent(app);

    // Login
    const loginRes = await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(loginRes.status).toBe(302);

    // Wait longer than timeout
    await sleep(idleTimeoutMs + 50);

    // Next request should redirect to login (session destroyed)
    const res = await agent.get('/');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/auth/login');
  });

  it('should keep session alive when activity occurs before timeout', async () => {
    const idleTimeoutMs = 200;
    const app = getApp(idleTimeoutMs);
    const agent = supertest.agent(app);

    // Login
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Sleep halfway through timeout
    await sleep(idleTimeoutMs / 2);

    // Make a request to refresh activity
    const res1 = await agent.get('/');
    expect(res1.status).toBe(200);

    // Sleep another halfway
    await sleep(idleTimeoutMs / 2);

    // Should still be alive (activity was recent)
    const res2 = await agent.get('/');
    expect(res2.status).toBe(200);
  });

  it('should return session-status with remaining time and not refresh activity', async () => {
    const idleTimeoutMs = 500;
    const app = getApp(idleTimeoutMs);
    const agent = supertest.agent(app);

    // Login
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Check status immediately
    const res1 = await agent.get('/auth/session-status');
    expect(res1.status).toBe(200);
    expect(res1.body).toHaveProperty('remainingMs');
    expect(res1.body.remainingMs).toBeLessThanOrEqual(idleTimeoutMs);
    expect(res1.body.remainingMs).toBeGreaterThan(0);
    const firstRemaining = res1.body.remainingMs;

    // Wait a bit
    await sleep(200);

    // Check status again — should have less time remaining (activity NOT refreshed)
    const res2 = await agent.get('/auth/session-status');
    expect(res2.status).toBe(200);
    expect(res2.body.remainingMs).toBeLessThan(firstRemaining);
  });

  it('should allow heartbeat to refresh activity', async () => {
    const idleTimeoutMs = 300;
    const app = getApp(idleTimeoutMs);
    const agent = supertest.agent(app);

    // Login
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Let the clock run down, then measure what is left
    await sleep(150);
    const res1 = await agent.get('/auth/session-status');
    expect(res1.status).toBe(200);
    const drainedRemaining = res1.body.remainingMs;
    expect(drainedRemaining).toBeLessThan(idleTimeoutMs - 100);

    // Heartbeat should refresh activity
    const beatRes = await agent.post('/auth/heartbeat');
    expect(beatRes.status).toBe(204);

    // Check status — should be back to near full timeout, above the drained value
    const res2 = await agent.get('/auth/session-status');
    expect(res2.status).toBe(200);
    expect(res2.body.remainingMs).toBeGreaterThan(drainedRemaining);
    expect(res2.body.remainingMs).toBeLessThanOrEqual(idleTimeoutMs);
  });

  it('should return 401 for session-status without valid session', async () => {
    const app = getApp(200);
    const agent = supertest.agent(app);

    // No login, just request status
    const res = await agent.get('/auth/session-status');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should build correct WebSocket close frame for session expired', () => {
    const reason = 'session expired';
    const frame = buildWsCloseFrame(4001, reason);

    expect(frame[0]).toBe(0x88); // FIN + close opcode
    expect(frame[1]).toBe(2 + reason.length); // payload length (< 126)
    expect(frame.readUInt16BE(2)).toBe(4001); // close code, big-endian
    expect(frame.subarray(4).toString('ascii')).toBe(reason);
    expect(frame.length).toBe(4 + reason.length);
  });

  it('should reject WS upgrade with 401 when the session is idle-expired', () => {
    const idleTimeoutMs = 200;
    // Stub session middleware injecting an authenticated but idle-expired session.
    const stubMiddleware = ((req: any, _res: any, next: () => void) => {
      req.session = { userId: 'admin', lastActivity: Date.now() - idleTimeoutMs - 100 };
      req.sessionID = 'sid-expired';
      next();
    }) as any;

    const handler = makeWsUpgradeHandler('http://localhost:1', stubMiddleware, undefined, idleTimeoutMs);

    const socket = new EventEmitter() as any;
    const written: Buffer[] = [];
    socket.write = (data: any) => { written.push(Buffer.from(data)); return true; };
    socket.destroyed = false;
    socket.destroy = () => { socket.destroyed = true; };

    handler({ url: '/ws', headers: {} } as any, socket, Buffer.alloc(0));

    expect(Buffer.concat(written).toString()).toContain('401 Unauthorized');
    expect(socket.destroyed).toBe(true);
  });
});
