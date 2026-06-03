import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let correctHash: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-change-password-same-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  correctHash = await bcrypt.hash('correctpass', 10);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedCreds(mustChangePassword = false) {
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
    webClientUrl: 'http://localhost:9999',
  });
}

describe('POST /auth/change-password — H3 adversarial (reject new == old)', () => {
  it('rejects newPassword === currentPassword with 400 and error message', async () => {
    const agent = supertest.agent(getApp());
    // Log in first
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Attempt to "change" password to the same value
    const res = await agent
      .post('/auth/change-password')
      .send('currentPassword=correctpass&newUsername=admin&newPassword=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // H3 hypothesis: code currently accepts this and returns 302/200.
    // Test expects 400 to catch the bug.
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/must differ|different|cannot reuse/i);
  });
});
