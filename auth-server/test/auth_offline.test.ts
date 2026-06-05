import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let mockServer: http.Server;
let mockPort: number;
let correctHash: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-offline-test-'));
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

describe('GET /auth-static/fonts (unauthenticated)', () => {
  it('serves font without session', async () => {
    const res = await supertest(getApp()).get('/auth-static/fonts/jetbrains-mono-latin.woff2');
    expect(res.status).toBe(200);
  });
});

describe('GET /auth/login (offline fonts)', () => {
  it('does not contain external fonts.googleapis.com', async () => {
    const res = await supertest(getApp()).get('/auth/login');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('fonts.googleapis.com');
  });
});

describe('login.html file (offline fonts)', () => {
  it('does not contain external fonts.googleapis.com', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../views/login.html'),
      'utf-8'
    );
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('contains @font-face with local path', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../views/login.html'),
      'utf-8'
    );
    expect(html).toContain('@font-face');
    expect(html).toContain('/auth-static/fonts/');
  });
});

describe('change-password.html file (offline fonts)', () => {
  it('does not contain external fonts.googleapis.com', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../views/change-password.html'),
      'utf-8'
    );
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('contains @font-face with local path', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../views/change-password.html'),
      'utf-8'
    );
    expect(html).toContain('@font-face');
    expect(html).toContain('/auth-static/fonts/');
  });
});
