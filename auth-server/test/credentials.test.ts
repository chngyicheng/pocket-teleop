import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  hashPassword, verifyPassword,
  initCredentials, readCredentials, saveCredentials,
  type Credentials,
} from '../src/credentials.js';

let tmpDir: string;
let credPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('hashPassword / verifyPassword', () => {
  it('verifyPassword returns true for matching password', async () => {
    const hash = await hashPassword('secret');
    expect(await verifyPassword('secret', hash)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('secret');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('initCredentials', () => {
  it('creates credentials.json from env vars when file is missing', async () => {
    const p = path.join(tmpDir, 'new-creds.json');
    await initCredentials('admin', 'pass123', p);
    const raw = fs.readFileSync(p, 'utf-8');
    const creds = JSON.parse(raw) as Credentials;
    expect(creds.username).toBe('admin');
    expect(await verifyPassword('pass123', creds.passwordHash)).toBe(true);
    expect(creds.mustChangePassword).toBe(true);
  });

  it('does not overwrite existing credentials.json', async () => {
    const p = path.join(tmpDir, 'existing-creds.json');
    const existing: Credentials = {
      username: 'user1',
      passwordHash: await hashPassword('mypass'),
      mustChangePassword: false,
    };
    fs.writeFileSync(p, JSON.stringify(existing));
    await initCredentials('admin', 'pass123', p);
    const raw = fs.readFileSync(p, 'utf-8');
    const creds = JSON.parse(raw) as Credentials;
    expect(creds.username).toBe('user1');
    expect(creds.mustChangePassword).toBe(false);
  });
});

describe('readCredentials', () => {
  it('reads credentials from file', async () => {
    const creds: Credentials = {
      username: 'tester',
      passwordHash: await hashPassword('tpass'),
      mustChangePassword: false,
    };
    fs.writeFileSync(credPath, JSON.stringify(creds));
    const loaded = await readCredentials(credPath);
    expect(loaded.username).toBe('tester');
    expect(loaded.mustChangePassword).toBe(false);
  });
});

describe('saveCredentials', () => {
  it('saves updated credentials to file', async () => {
    const creds: Credentials = {
      username: 'newuser',
      passwordHash: await hashPassword('newpass'),
      mustChangePassword: false,
    };
    await saveCredentials(creds, credPath);
    const raw = fs.readFileSync(credPath, 'utf-8');
    const loaded = JSON.parse(raw) as Credentials;
    expect(loaded.username).toBe('newuser');
    expect(loaded.mustChangePassword).toBe(false);
  });

  it('atomic write: multiple consecutive saves preserve latest content', async () => {
    const creds1: Credentials = {
      username: 'user1',
      passwordHash: await hashPassword('pass1'),
      mustChangePassword: true,
    };
    const creds2: Credentials = {
      username: 'user2',
      passwordHash: await hashPassword('pass2'),
      mustChangePassword: false,
    };
    // Save twice in quick succession
    await saveCredentials(creds1, credPath);
    await saveCredentials(creds2, credPath);
    // Verify the second save won the race
    const raw = fs.readFileSync(credPath, 'utf-8');
    const loaded = JSON.parse(raw) as Credentials;
    expect(loaded.username).toBe('user2');
    expect(loaded.mustChangePassword).toBe(false);
    expect(await verifyPassword('pass2', loaded.passwordHash)).toBe(true);
  });
});
