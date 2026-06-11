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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-rate-limit-test-'));
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

describe('Login rate limiting', () => {
  it('should allow 10 failed login attempts from same IP with different usernames, block the 11th', async () => {
    const agent = supertest(getApp());

    // First 10 failed attempts from same IP with DIFFERENT usernames should return 302
    for (let i = 0; i < 10; i++) {
      const res = await agent
        .post('/auth/login')
        .send(`username=user${i}&password=wrongpass`)
        .set('Content-Type', 'application/x-www-form-urlencoded');
      expect(res.status).toBe(302);
    }

    // 11th attempt from same IP should be rate limited by IP limiter (429)
    const blockedRes = await agent
      .post('/auth/login')
      .send('username=user10&password=wrongpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(blockedRes.status).toBe(429);
  });

  it('should allow 5 failed login attempts per username, block the 6th', async () => {
    const app = getApp();

    // Simulate different IPs by using different agents with X-Forwarded-For headers
    for (let i = 0; i < 5; i++) {
      const agent = supertest(app);
      const res = await agent
        .post('/auth/login')
        .send('username=testuser&password=wrongpass')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('X-Forwarded-For', `192.168.1.${i}`);
      expect(res.status).toBe(302);
    }

    // 6th attempt from different IP should still be rate limited (username limit)
    const blockedRes = await supertest(app)
      .post('/auth/login')
      .send('username=testuser&password=wrongpass')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Forwarded-For', '192.168.1.10');
    expect(blockedRes.status).toBe(429);
  });

  it('should not consume quota for successful login', async () => {
    const app = getApp();
    const agent = supertest(app);

    // Make 11 successful logins — none should be rate limited
    for (let i = 0; i < 11; i++) {
      // Each agent.post() with persistent session
      const res = await agent
        .post('/auth/login')
        .send('username=admin&password=correctpass')
        .set('Content-Type', 'application/x-www-form-urlencoded');
      // First login succeeds (302 to /), others may vary but should NOT be 429
      expect(res.status).not.toBe(429);
    }
  });

  it('should set Retry-After header in 429 response', async () => {
    const agent = supertest(getApp());

    // Fill the bucket
    for (let i = 0; i < 10; i++) {
      await agent
        .post('/auth/login')
        .send('username=admin&password=wrongpass')
        .set('Content-Type', 'application/x-www-form-urlencoded');
    }

    // 11th should be rate limited with Retry-After
    const blockedRes = await agent
      .post('/auth/login')
      .send('username=admin&password=wrongpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    expect(blockedRes.headers['retry-after']).toBe('60');
  });
});
