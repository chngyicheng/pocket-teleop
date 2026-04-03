# Auth Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node.js/Express `auth-server` Docker service that validates username/password sessions and proxies all traffic, replacing the bare `?token=` URL approach.

**Architecture:** `auth-server` (port 8080, only exposed port) validates session cookies, proxies HTTP to `webclient:80` and WebSocket upgrades to `teleop-server:9091` (rewriting `/ws` → `/teleop`). Sessions are file-backed (30-day rolling). Credentials stored as bcrypt hash in a Docker volume. `TELEOP_TOKEN` is retired — teleop-server loses its exposed port.

**Tech Stack:** Node.js 22-slim, TypeScript 5 (module: Node16), Express 4, express-session + session-file-store, bcryptjs, http-proxy-middleware 2, supertest + vitest. Tests run in Docker only — never bare npm.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `auth-server/package.json` | npm deps and scripts |
| `auth-server/tsconfig.json` | TypeScript config (Node16, strict, outDir: dist) |
| `auth-server/Dockerfile.auth` | base → builder → runtime stages |
| `auth-server/src/credentials.ts` | `initCredentials`, `readCredentials`, `saveCredentials`, `hashPassword`, `verifyPassword` |
| `auth-server/src/app.ts` | `createApp(AppOptions)` factory — Express wiring, session middleware, auth guards |
| `auth-server/src/index.ts` | Entry point — env validation, credential init, server start, WS upgrade handler |
| `auth-server/src/proxy.ts` | HTTP proxy to webclient; WS upgrade handler to teleop-server |
| `auth-server/src/routes/auth.ts` | `authRouter(credPath)` — GET/POST login, POST logout, GET/POST change-password |
| `auth-server/views/login.html` | Login page matching pocket-teleop aesthetic |
| `auth-server/views/change-password.html` | Force-change-on-first-login page |
| `auth-server/test/credentials.test.ts` | Unit tests for credential functions (real temp dir, no mocks) |
| `auth-server/test/auth.test.ts` | Integration tests for auth routes (supertest agent, mock nginx) |

### Modified files
| File | Change |
|---|---|
| `docker-compose.yml` | Add `auth-server` and `auth-server-test` services; remove ports from `webclient` and `teleop-server`; add `auth-data` volume; remove `TELEOP_TOKEN` from `webclient-test` |
| `.env.example` | Replace `TELEOP_TOKEN` with `TELEOP_ADMIN_USER`, `TELEOP_ADMIN_PASSWORD`, `SESSION_SECRET` |
| `.gitignore` | Add `.env` |
| `server/include/teleop_server.hpp` | Remove `token_` member and `token` constructor param; remove `on_validate` declaration |
| `server/src/teleop_server.cpp` | Remove `token` param from constructor; remove `token_` init; remove `set_validate_handler` and `on_validate` body |
| `server/src/teleop_node.cpp` | Remove token param reading/validation; update `TeleopServer` constructor call |
| `server/launch/teleop.launch.py` | Remove `'token'` parameter |
| `server/test/test_teleop_server.cpp` | Remove 3 token tests; remove `"testtoken"` from constructor; strip `?token=testtoken` from all URIs |
| `server/test/test_teleop_node.cpp` | Remove `token` parameter override; strip `?token=nodetest` from URI |
| `web-client/index.html` | Change `buildWsUrl` to same-origin `/ws`; remove `token` variable |
| `web-client/test/integration.test.ts` | Remove `TOKEN`/`INVALID_URL`; remove invalid-token test; simplify `VALID_URL` |

---

### Task 1: auth-server scaffold

**Files:**
- Create: `auth-server/package.json`
- Create: `auth-server/tsconfig.json`
- Create: `auth-server/Dockerfile.auth`
- Modify: `docker-compose.yml` (add `auth-server-test` profile service only — production service added in Task 6)

- [ ] **Step 1: Create `auth-server/package.json`**

```json
{
  "name": "auth-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "http-proxy-middleware": "^2.0.7",
    "session-file-store": "^1.5.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.17.10",
    "@types/node": "^20.0.0",
    "@types/session-file-store": "^1.2.5",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `auth-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `auth-server/Dockerfile.auth`**

```dockerfile
# ---- base stage: deps + source ----
FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# ---- builder stage: compile TypeScript ----
FROM base AS builder
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/views ./views
COPY package.json .
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: Generate package-lock.json via Docker**

```bash
docker run --rm -v $(pwd)/auth-server:/app -w /app --network=host node:22-slim npm install
```

Expected: `package-lock.json` appears in `auth-server/`.

- [ ] **Step 5: Add `auth-server-test` service to `docker-compose.yml`**

Append to `docker-compose.yml` (inside `services:`, after `webclient-test:`):

```yaml
  auth-server-test:
    profiles: ["test"]
    build:
      context: ./auth-server
      dockerfile: Dockerfile.auth
      target: base
      network: host
    command: ["npm", "test"]
```

- [ ] **Step 6: Verify the image builds**

```bash
docker compose build auth-server-test 2>&1 | tail -5
```

Expected: `Successfully built` (or `DONE` with no error).

- [ ] **Step 7: Commit**

```bash
git add auth-server/ docker-compose.yml
git commit -m "feat: auth-server scaffold — package.json, tsconfig, Dockerfile, test service"
```

---

### Task 2: credentials.ts + unit tests (TDD)

**Files:**
- Create: `auth-server/src/credentials.ts`
- Create: `auth-server/test/credentials.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `auth-server/test/credentials.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -15
```

Expected: failures with `Cannot find module '../src/credentials.js'` or similar.

- [ ] **Step 3: Implement `auth-server/src/credentials.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -15
```

Expected: all 7 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/auth-server add auth-server/src/credentials.ts auth-server/test/credentials.test.ts
git -C .worktrees/auth-server commit -m "feat: credentials.ts — initCredentials, readCredentials, saveCredentials, hashPassword, verifyPassword"
```

---

### Task 3: Express app + auth routes + integration tests (TDD)

**Files:**
- Create: `auth-server/src/routes/auth.ts`
- Create: `auth-server/src/app.ts`
- Create: `auth-server/test/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `auth-server/test/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { hashPassword } from '../src/credentials.js';
import { createApp } from '../src/app.js';

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let mockServer: http.Server;
let mockPort: number;

beforeAll(async () => {
  // Temp dirs for sessions and credentials
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-route-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  // Mock nginx target
  mockServer = http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
  await new Promise<void>((r) => mockServer.listen(0, r));
  mockPort = (mockServer.address() as net.AddressInfo).port;
});

afterAll(() => {
  mockServer.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp(mustChangePassword = false) {
  const hash = require('bcryptjs').hashSync('correctpass', 10);
  fs.writeFileSync(credPath, JSON.stringify({
    username: 'admin',
    passwordHash: hash,
    mustChangePassword,
  }));
  return createApp({
    credPath,
    sessionsPath,
    sessionSecret: 'test-secret',
    webClientUrl: `http://localhost:${mockPort}`,
  });
}
```

Wait — this uses `require('bcryptjs')` which doesn't work in ESM. Use the async version in `beforeAll` instead. Rewrite:

```typescript
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

  it('wrong current password returns 401', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent
      .post('/auth/change-password')
      .send('currentPassword=wrongpass&newUsername=admin&newPassword=newpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -15
```

Expected: failures — `Cannot find module '../src/app.js'`.

- [ ] **Step 3: Create `auth-server/src/routes/auth.ts`**

```typescript
import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readCredentials, saveCredentials, verifyPassword, hashPassword } from '../credentials.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS_DIR = path.join(__dirname, '../../views');

export function authRouter(credPath: string): Router {
  const router = Router();

  router.get('/login', (_req, res) => {
    res.sendFile(path.join(VIEWS_DIR, 'login.html'));
  });

  router.post('/login', async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.redirect('/auth/login?error=1');
    }
    const creds = await readCredentials(credPath);
    const valid = username === creds.username && await verifyPassword(password, creds.passwordHash);
    if (!valid) {
      return res.redirect('/auth/login?error=1');
    }
    req.session.userId = username;
    req.session.mustChangePassword = creds.mustChangePassword;
    if (creds.mustChangePassword) {
      return res.redirect('/auth/change-password');
    }
    return res.redirect('/');
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/auth/login'));
  });

  router.get('/change-password', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    res.sendFile(path.join(VIEWS_DIR, 'change-password.html'));
  });

  router.post('/change-password', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Unauthorized');
    const { currentPassword, newUsername, newPassword } = req.body as {
      currentPassword?: string;
      newUsername?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) return res.status(400).send('Missing fields');
    const creds = await readCredentials(credPath);
    if (!await verifyPassword(currentPassword, creds.passwordHash)) {
      return res.status(401).send('Current password incorrect');
    }
    const updated = {
      username: newUsername ?? creds.username,
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    };
    await saveCredentials(updated, credPath);
    req.session.userId = updated.username;
    req.session.mustChangePassword = false;
    return res.redirect('/');
  });

  return router;
}
```

- [ ] **Step 4: Create `auth-server/src/app.ts`**

```typescript
import express from 'express';
import session from 'express-session';
import FileStoreCreator from 'session-file-store';
import fs from 'fs';
import { authRouter } from './routes/auth.js';
import { makeHttpProxy } from './proxy.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    mustChangePassword?: boolean;
  }
}

export interface AppOptions {
  credPath: string;
  sessionsPath: string;
  sessionSecret: string;
  webClientUrl?: string;
}

const FileStore = FileStoreCreator(session);

export function createApp(options: AppOptions): express.Application {
  const webClientUrl = options.webClientUrl
    ?? process.env['WEBCLIENT_URL']
    ?? 'http://webclient:80';

  fs.mkdirSync(options.sessionsPath, { recursive: true });

  const store = new FileStore({
    path: options.sessionsPath,
    reapInterval: 3600,
    logFn: () => {},
  });
  store.reapAsync(() => {});

  const app = express();

  app.use(session({
    store,
    secret: options.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
    rolling: true,
  }));

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.sendStatus(200));

  app.use('/auth', authRouter(options.credPath));

  // Unauthenticated: redirect to login
  app.use((req, res, next) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    next();
  });

  // Authenticated but must change password: redirect to change-password
  app.use((req, res, next) => {
    if (req.session.mustChangePassword && !req.path.startsWith('/auth')) {
      return res.redirect('/auth/change-password');
    }
    next();
  });

  // Proxy authenticated requests to nginx
  app.use(makeHttpProxy(webClientUrl));

  return app;
}
```

- [ ] **Step 5: Create placeholder `auth-server/src/proxy.ts`** (real implementation in Task 4; minimal stub to unblock tests)

```typescript
import { RequestHandler } from 'express';

export function makeHttpProxy(_target: string): RequestHandler {
  return (_req, res) => res.status(502).send('proxy not yet implemented');
}

export function makeWsUpgradeHandler(_target: string) {
  return (_req: unknown, _socket: unknown, _head: unknown) => {};
}
```

- [ ] **Step 6: Create placeholder `auth-server/src/index.ts`** (real implementation in Task 4; minimal stub to allow build)

```typescript
export {};
```

- [ ] **Step 7: Create empty view files so `sendFile` doesn't crash during tests**

Create `auth-server/views/login.html`:
```html
<!DOCTYPE html><html><body>login</body></html>
```

Create `auth-server/views/change-password.html`:
```html
<!DOCTYPE html><html><body>change-password</body></html>
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -20
```

Expected: all tests pass (12+ tests), 0 failures.

- [ ] **Step 9: Commit**

```bash
git -C .worktrees/auth-server add auth-server/src/ auth-server/views/ auth-server/test/auth.test.ts
git -C .worktrees/auth-server commit -m "feat: app.ts + auth routes — login, logout, change-password (all tests passing)"
```

---

### Task 4: proxy.ts + index.ts (production wiring)

**Files:**
- Modify: `auth-server/src/proxy.ts` (replace stub)
- Modify: `auth-server/src/index.ts` (replace stub)

- [ ] **Step 1: Replace `auth-server/src/proxy.ts`**

```typescript
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler } from 'express';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export function makeHttpProxy(target: string): RequestHandler {
  return createProxyMiddleware({ target, changeOrigin: true }) as RequestHandler;
}

export function makeWsUpgradeHandler(target: string) {
  const wsProxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/ws': '/teleop' },
  });
  return (req: IncomingMessage, socket: Socket, head: Buffer) => {
    wsProxy.upgrade!(req, socket, head);
  };
}
```

- [ ] **Step 2: Replace `auth-server/src/index.ts`**

```typescript
import { createApp } from './app.js';
import { initCredentials } from './credentials.js';
import { makeWsUpgradeHandler } from './proxy.js';

const adminUser     = process.env['TELEOP_ADMIN_USER'];
const adminPassword = process.env['TELEOP_ADMIN_PASSWORD'];
const sessionSecret = process.env['SESSION_SECRET'];

if (!adminUser || !adminPassword || !sessionSecret) {
  console.error(
    'Error: TELEOP_ADMIN_USER, TELEOP_ADMIN_PASSWORD, and SESSION_SECRET must be set'
  );
  process.exit(1);
}

const CRED_PATH     = '/data/credentials.json';
const SESSIONS_PATH = '/data/sessions';
const TELEOP_URL    = process.env['TELEOP_SERVER_URL'] ?? 'ws://teleop-server:9091';

await initCredentials(adminUser, adminPassword, CRED_PATH);

const app = createApp({
  credPath:      CRED_PATH,
  sessionsPath:  SESSIONS_PATH,
  sessionSecret,
});

const server = app.listen(3000, () => {
  console.log('auth-server listening on port 3000');
});

server.on('upgrade', makeWsUpgradeHandler(TELEOP_URL));
```

- [ ] **Step 3: Run tests to confirm they still pass**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -15
```

Expected: same pass count as after Task 3, 0 failures (proxy stub is gone but tests mock the proxy target anyway).

- [ ] **Step 4: Commit**

```bash
git -C .worktrees/auth-server add auth-server/src/proxy.ts auth-server/src/index.ts
git -C .worktrees/auth-server commit -m "feat: proxy.ts + index.ts — HTTP/WS proxy, env validation, server entry point"
```

---

### Task 5: Login and change-password HTML views

**Files:**
- Modify: `auth-server/views/login.html` (replace placeholder)
- Modify: `auth-server/views/change-password.html` (replace placeholder)

- [ ] **Step 1: Replace `auth-server/views/login.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pocket-teleop · Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff; --surface: #f5f5f5; --border: #e0e0e0;
      --text: #111111; --text-muted: #666666; --accent: #0070f3;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--text); background: var(--bg);
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #111111; --surface: #1e1e1e; --border: #333333;
              --text: #f0f0f0; --text-muted: #999999; }
    }
    html, body { height: 100%; }
    body { display: flex; flex-direction: column; align-items: center;
           justify-content: center; gap: 20px; padding: 32px; background: var(--bg); }
    .title { font-family: 'Press Start 2P', monospace; font-size: 13px; color: var(--accent); }
    form { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 300px; }
    input {
      width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px;
      font-size: 14px; background: var(--surface); color: var(--text);
    }
    input:focus { outline: none; border-color: var(--accent); }
    button {
      width: 100%; padding: 10px; background: var(--accent); color: #fff;
      border: none; border-radius: 6px; font-size: 14px; cursor: pointer;
    }
    button:active { opacity: 0.85; }
    .error { font-size: 12px; color: #ef4444; text-align: center; display: none; }
  </style>
</head>
<body>
  <span class="title">pocket-teleop</span>
  <form method="POST" action="/auth/login" id="form">
    <input type="text"     name="username" placeholder="Username" autocomplete="username" required>
    <input type="password" name="password" placeholder="Password" autocomplete="current-password" required>
    <button type="submit">Connect</button>
  </form>
  <p class="error" id="err">Invalid username or password.</p>
  <script>
    // Show error if redirected back with ?error=1
    if (new URLSearchParams(window.location.search).get('error')) {
      document.getElementById('err').style.display = 'block';
    }
  </script>
</body>
</html>
```

The `POST /auth/login` route already uses `res.redirect('/auth/login?error=1')` on failure (as implemented in Task 3). The `?error=1` param triggers the error message display in this HTML. No route changes needed.

- [ ] **Step 2: Replace `auth-server/views/change-password.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pocket-teleop · Change Password</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff; --surface: #f5f5f5; --border: #e0e0e0;
      --text: #111111; --text-muted: #666666; --accent: #0070f3;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--text); background: var(--bg);
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #111111; --surface: #1e1e1e; --border: #333333;
              --text: #f0f0f0; --text-muted: #999999; }
    }
    html, body { height: 100%; }
    body { display: flex; flex-direction: column; align-items: center;
           justify-content: center; gap: 20px; padding: 32px; background: var(--bg); }
    .title { font-family: 'Press Start 2P', monospace; font-size: 13px; color: var(--accent); }
    p { font-size: 13px; color: var(--text-muted); text-align: center; max-width: 300px; }
    form { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 300px; }
    input {
      width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px;
      font-size: 14px; background: var(--surface); color: var(--text);
    }
    input:focus { outline: none; border-color: var(--accent); }
    button {
      width: 100%; padding: 10px; background: var(--accent); color: #fff;
      border: none; border-radius: 6px; font-size: 14px; cursor: pointer;
    }
    button:active { opacity: 0.85; }
  </style>
</head>
<body>
  <span class="title">pocket-teleop</span>
  <p>Set a new username and password before continuing.</p>
  <form method="POST" action="/auth/change-password">
    <input type="text"     name="newUsername"     placeholder="New username" autocomplete="username" required>
    <input type="password" name="currentPassword" placeholder="Current password" autocomplete="current-password" required>
    <input type="password" name="newPassword"     placeholder="New password" autocomplete="new-password" required>
    <button type="submit">Save and continue</button>
  </form>
</body>
</html>
```

- [ ] **Step 3: Run tests to verify they still pass**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -15
```

Expected: all tests pass, 0 failures. (Tests updated in Step 1 reflect new redirect behaviour.)

- [ ] **Step 4: Commit**

```bash
git -C .worktrees/auth-server add auth-server/views/ auth-server/src/routes/auth.ts auth-server/test/auth.test.ts
git -C .worktrees/auth-server commit -m "feat: login.html + change-password.html; redirect on bad login instead of 401"
```

---

### Task 6: docker-compose.yml + .env.example + .gitignore

**Files:**
- Modify: `docker-compose.yml`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Replace `docker-compose.yml`**

Replace the entire file with:

```yaml
services:
  teleop-server:
    build:
      context: .
      network: host
    environment:
      - ROBOT_TYPE=${ROBOT_TYPE:-diff_drive}
      - ROBOT_NAME=${ROBOT_NAME:-}
      - ROBOT_NAMESPACE=${ROBOT_NAMESPACE:-}
    restart: unless-stopped

  webclient:
    build:
      context: ./web-client
      dockerfile: Dockerfile.webclient
      target: runtime
      network: host
    restart: unless-stopped

  auth-server:
    build:
      context: ./auth-server
      dockerfile: Dockerfile.auth
      target: runtime
      network: host
    ports:
      - "8080:3000"
    environment:
      - "TELEOP_ADMIN_USER=${TELEOP_ADMIN_USER:?Error: TELEOP_ADMIN_USER must be set}"
      - "TELEOP_ADMIN_PASSWORD=${TELEOP_ADMIN_PASSWORD:?Error: TELEOP_ADMIN_PASSWORD must be set}"
      - "SESSION_SECRET=${SESSION_SECRET:?Error: SESSION_SECRET must be set}"
    volumes:
      - auth-data:/data
    depends_on:
      - webclient
      - teleop-server
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  webclient-test:
    profiles: ["test"]
    build:
      context: ./web-client
      dockerfile: Dockerfile.webclient
      target: base
      network: host
    environment:
      - TELEOP_SERVER_URL=ws://teleop-server:9091/teleop
    depends_on:
      - teleop-server
    command: ["npm", "test"]

  auth-server-test:
    profiles: ["test"]
    build:
      context: ./auth-server
      dockerfile: Dockerfile.auth
      target: base
      network: host
    command: ["npm", "test"]

volumes:
  auth-data:
```

- [ ] **Step 2: Create `.env.example`**

```
# Copy to .env and fill in all values before starting the server.
# NEVER commit .env — it is gitignored.

# Server auth credentials (no defaults — must be set explicitly)
TELEOP_ADMIN_USER=
TELEOP_ADMIN_PASSWORD=

# Session signing secret — generate with: openssl rand -hex 32
SESSION_SECRET=

# Optional robot identity
ROBOT_TYPE=diff_drive
ROBOT_NAME=
ROBOT_NAMESPACE=
```

- [ ] **Step 3: Update `.gitignore`**

The current `.gitignore` contains:
```
.worktrees/
.superpowers/
```

Append `.env` so it becomes:
```
.worktrees/
.superpowers/
.env
```

- [ ] **Step 4: Verify docker compose config parses correctly**

```bash
TELEOP_ADMIN_USER=admin TELEOP_ADMIN_PASSWORD=testpass SESSION_SECRET=testsecret \
  docker compose config 2>&1 | grep -E "auth-server|TELEOP_ADMIN|SESSION"
```

Expected: shows auth-server service with env vars resolved; no errors.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/auth-server add docker-compose.yml .env.example .gitignore
git -C .worktrees/auth-server commit -m "feat: docker-compose — auth-server service, remove exposed ports, auth-data volume, env template"
```

---

### Task 7: Retire TELEOP_TOKEN from C++ server

**Files:**
- Modify: `server/include/teleop_server.hpp`
- Modify: `server/src/teleop_server.cpp`
- Modify: `server/src/teleop_node.cpp`
- Modify: `server/launch/teleop.launch.py`
- Modify: `server/test/test_teleop_server.cpp`
- Modify: `server/test/test_teleop_node.cpp`

- [ ] **Step 1: Update `server/include/teleop_server.hpp`**

Replace the constructor signature and remove `token_` member and `on_validate` declaration. The full updated file:

```cpp
#pragma once
#include <functional>
#include <string>
#include <atomic>
#include <thread>
#include <mutex>
#include <chrono>

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include "command_handler.hpp"

using WsServer = websocketpp::server<websocketpp::config::asio>;
using ConnectionHdl = websocketpp::connection_hdl;

class TeleopServer {
public:
  using PublishCallback = std::function<void(double, double, double)>;

  TeleopServer(int port,
               int timeout_ms,
               const std::string& robot_type,
               const std::string& robot_name,
               const std::string& robot_namespace,
               PublishCallback callback);
  ~TeleopServer();

  void start();  // blocks until stop() is called
  void stop();

private:
  void on_open(ConnectionHdl hdl);
  void on_close(ConnectionHdl hdl);
  void on_message(ConnectionHdl hdl, WsServer::message_ptr msg);
  void watchdog_loop();
  void reset_watchdog();

  const int port_;
  const int timeout_ms_;
  const std::string robot_type_;
  const std::string robot_name_;
  const std::string robot_namespace_;
  PublishCallback publish_callback_;

  WsServer ws_server_;
  CommandHandler command_handler_;

  std::mutex client_mutex_;
  ConnectionHdl active_client_;
  bool has_client_{false};

  std::atomic<bool> running_{false};
  std::atomic<bool> timed_out_{false};
  std::thread watchdog_thread_;
  std::atomic<int64_t> last_message_ms_{0};
};
```

- [ ] **Step 2: Update `server/src/teleop_server.cpp`**

Replace the constructor and remove `on_validate`. The top of the file through `start()` becomes:

```cpp
#include "teleop_server.hpp"
#include <nlohmann/json.hpp>
#include <sstream>
#include <iostream>

using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;

TeleopServer::TeleopServer(int port,
                           int timeout_ms,
                           const std::string& robot_type,
                           const std::string& robot_name,
                           const std::string& robot_namespace,
                           PublishCallback callback)
  : port_(port),
    timeout_ms_(timeout_ms),
    robot_type_(robot_type),
    robot_name_(robot_name),
    robot_namespace_(robot_namespace),
    publish_callback_(std::move(callback)) {
  ws_server_.set_access_channels(websocketpp::log::alevel::none);
  ws_server_.set_error_channels(websocketpp::log::elevel::none);
  ws_server_.init_asio();
  ws_server_.set_reuse_addr(true);

  ws_server_.set_open_handler(bind(&TeleopServer::on_open, this, _1));
  ws_server_.set_close_handler(bind(&TeleopServer::on_close, this, _1));
  ws_server_.set_message_handler(bind(&TeleopServer::on_message, this, _1, _2));
}
```

Remove the entire `on_validate` method body (lines 64–89 in the original). Keep `~TeleopServer`, `start`, `stop`, `reset_watchdog`, `on_open`, `on_close`, `on_message`, `watchdog_loop` unchanged.

- [ ] **Step 3: Update `server/src/teleop_node.cpp`**

Replace the entire file:

```cpp
#include "teleop_node.hpp"

TeleopNode::TeleopNode(const rclcpp::NodeOptions& options)
  : Node("teleop_node", options) {

  declare_parameter("port",            9091);
  declare_parameter("timeout_ms",      500);
  declare_parameter("cmd_vel_topic",   std::string("/cmd_vel"));
  declare_parameter("robot_type",      std::string("diff_drive"));
  declare_parameter("robot_name",      std::string(""));
  declare_parameter("robot_namespace", std::string(""));

  const auto port            = get_parameter("port").as_int();
  const auto timeout_ms      = get_parameter("timeout_ms").as_int();
  const auto base_topic      = get_parameter("cmd_vel_topic").as_string();
  const auto robot_type      = get_parameter("robot_type").as_string();
  const auto robot_name      = get_parameter("robot_name").as_string();
  const auto robot_namespace = get_parameter("robot_namespace").as_string();

  const auto topic = robot_namespace.empty()
    ? base_topic
    : "/" + robot_namespace + "/cmd_vel";

  publisher_ = create_publisher<geometry_msgs::msg::Twist>(topic, 10);

  server_ = std::make_unique<TeleopServer>(
    static_cast<int>(port),
    static_cast<int>(timeout_ms),
    robot_type,
    robot_name,
    robot_namespace,
    [this](double lx, double ly, double az) { publish_twist(lx, ly, az); });

  server_thread_ = std::thread([this]() { server_->start(); });

  RCLCPP_INFO(get_logger(), "Teleop server listening on port %ld", port);
  RCLCPP_INFO(get_logger(), "Publishing to topic: %s", topic.c_str());
}

TeleopNode::~TeleopNode() {
  server_->stop();
  if (server_thread_.joinable()) server_thread_.join();
}

void TeleopNode::publish_twist(double lx, double ly, double az) {
  geometry_msgs::msg::Twist msg;
  msg.linear.x  = lx;
  msg.linear.y  = ly;
  msg.angular.z = az;
  publisher_->publish(msg);
}
```

- [ ] **Step 4: Update `server/launch/teleop.launch.py`**

Replace with (remove `token` parameter):

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, EnvironmentVariable
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('port',          default_value='9091'),
        DeclareLaunchArgument('timeout_ms',    default_value='500'),
        DeclareLaunchArgument('cmd_vel_topic', default_value='/cmd_vel'),
        DeclareLaunchArgument('robot_type',    default_value='diff_drive'),

        Node(
            package='pocket_teleop',
            executable='teleop_node',
            name='teleop_node',
            parameters=[{
                'port':            LaunchConfiguration('port'),
                'timeout_ms':      LaunchConfiguration('timeout_ms'),
                'cmd_vel_topic':   LaunchConfiguration('cmd_vel_topic'),
                'robot_type':      LaunchConfiguration('robot_type'),
                'robot_name':      EnvironmentVariable('ROBOT_NAME',      default_value=''),
                'robot_namespace': EnvironmentVariable('ROBOT_NAMESPACE', default_value=''),
            }],
            output='screen',
        ),
    ])
```

- [ ] **Step 5: Update `server/test/test_teleop_server.cpp`**

Make three changes:

1. In `SetUp`, change constructor call from:
   ```cpp
   server_ = std::make_unique<TeleopServer>(
     "testtoken", 19091, 300, "diff_drive", "", "",
   ```
   To:
   ```cpp
   server_ = std::make_unique<TeleopServer>(
     19091, 300, "diff_drive", "", "",
   ```

2. Remove the three token tests entirely: `ValidTokenAccepted`, `InvalidTokenRejectedWith401`, `MissingTokenRejectedWith401` (also remove the `attempt_connect` helper function since it's only used by those tests).

3. In all remaining test URIs, replace `?token=testtoken` with nothing:
   - `"ws://localhost:19091/teleop?token=testtoken"` → `"ws://localhost:19091/teleop"`

There are 6 occurrences to fix (in `ConnectReceivesStatusMessage`, `TwistFiresCallback`, `PingReturnsPongCallbackNotFired`, `MalformedMessageReturnsErrorCallbackNotFired`, `WatchdogFiresZeroVelocityOnTimeout`, `SecondClientReceivesAlreadyConnectedError`).

- [ ] **Step 6: Update `server/test/test_teleop_node.cpp`**

Two changes:

1. Remove the token parameter override:
   ```cpp
   opts.append_parameter_override("token", "nodetest");  // delete this line
   ```

2. Update the connection URI (line ~60):
   ```cpp
   auto con = client.get_connection("ws://localhost:19092/teleop", ec);
   ```

- [ ] **Step 7: Run server tests in Docker**

```bash
docker build --network=host --target builder -t pocket-teleop-dev . && \
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  pocket-teleop-dev \
  /bin/bash -c ". /opt/ros/humble/setup.sh && \
    cd /ros2_ws && \
    colcon build --packages-select pocket_teleop && \
    colcon test --packages-select pocket_teleop --event-handlers console_direct+ && \
    colcon test-result --verbose" 2>&1 | tail -30
```

Expected: all tests pass, token-related tests gone, remaining tests still pass.

- [ ] **Step 8: Commit**

```bash
git -C .worktrees/auth-server add \
  server/include/teleop_server.hpp \
  server/src/teleop_server.cpp \
  server/src/teleop_node.cpp \
  server/launch/teleop.launch.py \
  server/test/test_teleop_server.cpp \
  server/test/test_teleop_node.cpp
git -C .worktrees/auth-server commit -m "feat: retire TELEOP_TOKEN — remove from C++ server, node, launch, tests"
```

---

### Task 8: Update web-client

**Files:**
- Modify: `web-client/index.html`
- Modify: `web-client/test/integration.test.ts`

- [ ] **Step 1: Update `buildWsUrl` in `web-client/index.html`**

Find (around line 458–463):
```javascript
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token') ?? '';

    function buildWsUrl() {
      return `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;
    }
```

Replace with:
```javascript
    function buildWsUrl() {
      return `ws://${window.location.hostname}:${window.location.port}/ws`;
    }
```

- [ ] **Step 2: Update `web-client/test/integration.test.ts`**

Replace the top of the file (lines 1–9) from:
```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { Connection } from '../src/connection.js';
import { buildPing } from '../src/protocol.js';

const SERVER_URL = process.env['TELEOP_SERVER_URL'] ?? 'ws://localhost:9091/teleop';
const TOKEN = process.env['TELEOP_TOKEN'] ?? 'testtoken';
const VALID_URL = `${SERVER_URL}?token=${TOKEN}`;
const INVALID_URL = `${SERVER_URL}?token=wrongtoken`;
```

To:
```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { Connection } from '../src/connection.js';
import { buildPing } from '../src/protocol.js';

const VALID_URL = process.env['TELEOP_SERVER_URL'] ?? 'ws://localhost:9091/teleop';
```

Then remove the test `'invalid token is rejected without opening'` (lines 79–93 in the original) — it no longer applies since the teleop-server accepts all connections.

Replace all remaining occurrences of `VALID_URL` — they are unchanged in name, just the value is simpler now.

- [ ] **Step 3: Run web-client tests**

```bash
docker compose --profile test run --rm webclient-test 2>&1 | tail -20
```

Note: no `TELEOP_TOKEN` needed — it was retired in Task 6. No need to stop the main stack — teleop-server no longer binds host ports so there is no port conflict.

Expected: 10 tests pass (was 11; the invalid-token test is removed), 0 failures.

- [ ] **Step 4: Commit**

```bash
git -C .worktrees/auth-server add web-client/index.html web-client/test/integration.test.ts
git -C .worktrees/auth-server commit -m "feat: web-client — same-origin WS URL via auth-server; remove token from buildWsUrl"
```

---

### Task 9: Full stack smoke test + AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Create local `.env`**

```bash
cat > .env << 'EOF'
TELEOP_ADMIN_USER=admin
TELEOP_ADMIN_PASSWORD=admin
SESSION_SECRET=$(openssl rand -hex 32)
ROBOT_TYPE=diff_drive
EOF
```

Verify Docker Compose resolves env vars:
```bash
docker compose config 2>&1 | grep -E "TELEOP_ADMIN_USER|SESSION_SECRET"
```

Expected: values present, no errors.

- [ ] **Step 2: Build and start the full stack**

```bash
docker compose up --build 2>&1 | tail -30
```

Expected: all three services start (`teleop-server`, `webclient`, `auth-server`). auth-server health check passes within 30s.

- [ ] **Step 3: Manual smoke test (4 scenarios)**

Open `http://<robot-ip>:8080` in a browser:

1. **No session** → login page appears with "pocket-teleop" title and username/password form.
2. **Wrong password** → page reloads with "Invalid username or password." error message.
3. **Correct credentials (admin / admin)** → redirected to `/auth/change-password` (mustChangePassword = true on first run). Change credentials. After change, robot controller UI loads and "Connecting…" pill appears.
4. **Refresh browser** → session cookie persists, app loads directly (no login prompt).

- [ ] **Step 4: Update `AGENTS.md` handoff**

Update the Handoff State section. Change the single-pointer line to:

```
> **For the next agent:** Auth-server merged to main. `feature/auth-server` branch ready to merge. Plan: `docs/superpowers/plans/2026-04-03-auth-server-implementation.md` — all 9 tasks complete.
```

Update Head SHA after the final commit (run `git rev-parse --short HEAD` after staging).

Add a new row to Known deviations if any deviations were made from this plan.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/auth-server add AGENTS.md
git -C .worktrees/auth-server commit -m "docs: update AGENTS.md handoff — auth-server complete"
```

After committing, report: `"Committed as <hash>. Ready to push — shall I?"`
