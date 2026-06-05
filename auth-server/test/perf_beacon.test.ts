import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-beacon-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  const hash = await bcrypt.hash('correctpass', 10);
  fs.writeFileSync(credPath, JSON.stringify({
    username: 'admin',
    passwordHash: hash,
    mustChangePassword: false,
  }));

  mockServer = http.createServer((_req, res) => {
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

function getApp() {
  return createApp({
    credPath,
    sessionsPath,
    sessionSecret: 'test-secret',
    webClientUrl: `http://localhost:${mockPort}`,
  });
}

describe('POST /perf (unauthenticated beacon)', () => {
  it('accepts a JSON timing payload and returns 204 without a session', async () => {
    const res = await supertest(getApp())
      .post('/perf')
      .send({ readyMs: 1820, fcpMs: 640, domContentLoadedMs: 810, responseEndMs: 120, ua: 'test-agent' });
    expect(res.status).toBe(204);
  });

  it('logs the payload with a [perf] tag and timestamp', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await supertest(getApp())
      .post('/perf')
      .send({ readyMs: 999, ua: 'probe' });
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('[perf]'));
    expect(line).toBeDefined();
    expect(line).toContain('999');
    logSpy.mockRestore();
  });

  it('is not redirected to /auth/login (sits before the auth gate)', async () => {
    const res = await supertest(getApp()).post('/perf').send({ readyMs: 1 });
    expect(res.status).not.toBe(302);
  });
});
