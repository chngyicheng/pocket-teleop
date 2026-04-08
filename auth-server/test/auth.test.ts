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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-route-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  correctHash = await bcrypt.hash('correctpass', 10);

  mockServer = http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
  await new Promise<void>((r) => mockServer.listen(0, r));
  mockPort = (mockServer.address() as net.AddressInfo).port;
});

afterAll(() => {
  mockServer.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedCreds(mustChangePassword: boolean) {
  fs.writeFileSync(credPath, JSON.stringify({
    username: 'admin',
    passwordHash: correctHash,
    mustChangePassword,
  }));
}

function getApp(mustChangePassword = false) {
  seedCreds(mustChangePassword);
  return createApp({
    credPath,
    sessionsPath,
    sessionSecret: 'test-secret',
    webClientUrl: `http://localhost:${mockPort}`,
  });
}

describe('GET /health', () => {
  it('returns 200 without auth', async () => {
    const res = await supertest(getApp()).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('GET / unauthenticated', () => {
  it('redirects to /auth/login', async () => {
    const res = await supertest(getApp()).get('/');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/login');
  });
});

describe('POST /auth/login', () => {
  it('correct credentials set session and redirect to /', async () => {
    const agent = supertest.agent(getApp());
    const res = await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/');
  });

  it('correct credentials with mustChangePassword redirect to /auth/change-password', async () => {
    const agent = supertest.agent(getApp(true));
    const res = await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/change-password');
  });

  it('wrong password redirects to /auth/login?error=1', async () => {
    const res = await supertest(getApp())
      .post('/auth/login')
      .send('username=admin&password=wrongpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/auth/login');
    expect(res.headers['location']).toContain('error=1');
  });

  it('wrong username redirects to /auth/login with error param', async () => {
    const res = await supertest(getApp())
      .post('/auth/login')
      .send('username=notadmin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/auth/login');
  });
});

describe('GET / authenticated', () => {
  it('passes through to proxy (not redirected to login)', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent.get('/');
    // Not redirected to login — proxy may return 200 or any non-auth status
    expect(res.status).not.toBe(302);
    expect(res.headers['location']).not.toBe('/auth/login');
  });
});

describe('POST /auth/logout', () => {
  it('destroys session and redirects to /auth/login', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent.post('/auth/logout');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/login');
    // Subsequent request should be unauthenticated
    const check = await agent.get('/');
    expect(check.headers['location']).toBe('/auth/login');
  });
});

describe('GET /auth/change-password', () => {
  it('unauthenticated redirects to /auth/login', async () => {
    const res = await supertest(getApp()).get('/auth/change-password');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/login');
  });
});

describe('POST /auth/change-password', () => {
  it('unauthenticated returns 401', async () => {
    const res = await supertest(getApp())
      .post('/auth/change-password')
      .send('currentPassword=correctpass&newUsername=admin&newPassword=newpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(401);
  });

  it('authenticated clears mustChangePassword and redirects to /', async () => {
    seedCreds(true);
    const agent = supertest.agent(getApp(true));
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent
      .post('/auth/change-password')
      .send('currentPassword=correctpass&newUsername=admin&newPassword=newpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/');
    // Verify file updated
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    expect(creds.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('newpass', creds.passwordHash)).toBe(true);
  });

  it('wrong current password redirects to change-password with error', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent
      .post('/auth/change-password')
      .send('currentPassword=wrongpass&newUsername=admin&newPassword=newpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/change-password?error=1');
  });
});

describe('GET /auth/me', () => {
  it('unauthenticated returns 401', async () => {
    const res = await supertest(getApp()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('authenticated returns current username', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
  });
});

describe('POST /auth/change-username', () => {
  it('unauthenticated returns 401', async () => {
    const res = await supertest(getApp())
      .post('/auth/change-username')
      .send('currentPassword=correctpass&newUsername=newadmin')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(401);
  });

  it('wrong current password returns 401', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent
      .post('/auth/change-username')
      .send('currentPassword=wrongpass&newUsername=newadmin')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(401);
  });

  it('correct password changes username, preserves password hash, destroys session, redirects to /auth/login', async () => {
    seedCreds(false);
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent
      .post('/auth/change-username')
      .send('currentPassword=correctpass&newUsername=newadmin')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/login');
    // File updated: username changed, password hash preserved
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    expect(creds.username).toBe('newadmin');
    expect(await bcrypt.compare('correctpass', creds.passwordHash)).toBe(true);
    // Session destroyed
    const check = await agent.get('/');
    expect(check.headers['location']).toBe('/auth/login');
  });
});
