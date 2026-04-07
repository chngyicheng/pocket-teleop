import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

export interface Credentials {
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function initCredentials(
  adminUser: string,
  adminPassword: string,
  credPath: string,
): Promise<void> {
  if (existsSync(credPath)) return;
  const creds: Credentials = {
    username: adminUser,
    passwordHash: await hashPassword(adminPassword),
    mustChangePassword: true,
  };
  await fs.mkdir(path.dirname(credPath), { recursive: true });
  await fs.writeFile(credPath, JSON.stringify(creds, null, 2));
}

export async function readCredentials(credPath: string): Promise<Credentials> {
  const raw = await fs.readFile(credPath, 'utf-8');
  return JSON.parse(raw) as Credentials;
}

export async function saveCredentials(
  creds: Credentials,
  credPath: string,
): Promise<void> {
  await fs.writeFile(credPath, JSON.stringify(creds, null, 2));
}
