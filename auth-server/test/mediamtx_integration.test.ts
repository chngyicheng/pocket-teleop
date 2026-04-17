import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';

const MEDIAMTX_API_URL = process.env['MEDIAMTX_API_URL'] ?? 'http://localhost:9997';

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof supertest.agent>;

beforeAll(async () => {
  // Poll until MediaMTX config API is ready (scratch image, no Docker HEALTHCHECK).
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const res = await fetch(`${MEDIAMTX_API_URL}/v3/config/global/get`);
      if (res.ok) break;
    } catch {
      // not ready
    }
    if (attempt === 14) throw new Error(`MediaMTX API not ready at ${MEDIAMTX_API_URL} after 15s`);
    await new Promise<void>(r => setTimeout(r, 1000));
  }

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediamtx-integration-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  const hash = await bcrypt.hash('testpass', 10);
  fs.writeFileSync(credPath, JSON.stringify({
    username: 'admin',
    passwordHash: hash,
    mustChangePassword: false,
  }));

  // No mediaMtxApiUrl passed — createApp reads MEDIAMTX_API_URL from env.
  app = createApp({ credPath, sessionsPath, sessionSecret: 'test-secret' });

  agent = supertest.agent(app);
  const loginRes = await agent
    .post('/auth/login')
    .send('username=admin&password=testpass')
    .set('Content-Type', 'application/x-www-form-urlencoded');
  if (loginRes.status !== 302) throw new Error('login failed in beforeAll');
}, 20_000);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PATCH /mediamtx-api — real MediaMTX roundtrip', () => {
  it('PATCH source then GET confirms value persisted', async () => {
    const testSource = 'rtsp://192.0.2.1/integration-test';

    const patchRes = await agent
      .patch('/mediamtx-api/config/paths/patch/teleop')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ source: testSource }));
    expect(patchRes.status).toBe(200);

    const getRes = await agent.get('/mediamtx-api/config/paths/get/teleop');
    expect(getRes.status).toBe(200);
    expect(getRes.body.source).toBe(testSource);

    // Restore default source so test is idempotent.
    await agent
      .patch('/mediamtx-api/config/paths/patch/teleop')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ source: 'publisher' }));
  });

  it('unauthenticated PATCH redirects to /auth/login', async () => {
    const res = await supertest(app)
      .patch('/mediamtx-api/config/paths/patch/teleop')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ source: 'rtsp://test/cam' }));
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/login');
  });

  it('invalid JSON body is forwarded without server crash', async () => {
    const res = await agent
      .patch('/mediamtx-api/config/paths/patch/teleop')
      .set('Content-Type', 'application/json')
      .send('not valid json {{{');
    // MediaMTX returns 400 for malformed JSON; the proxy must not produce 500.
    expect(res.status).not.toBe(500);
  });
});
