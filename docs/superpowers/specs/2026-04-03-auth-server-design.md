# Auth Server Design

**Date:** 2026-04-03
**Replaces:** `docs/superpowers/plans/2026-03-31-token-setup.md` (token-in-URL approach superseded)

---

## Goal

Replace the bare `?token=` URL parameter with a proper username/password login backed by a session cookie. A new `auth-server` Docker service sits in front of all traffic, validates sessions, and proxies authenticated requests to nginx (static files) and the C++ teleop server (WebSocket).

---

## Architecture

```
Internet / VPN
     │
     ▼ port 8080 (only exposed port)
┌─────────────────────────────┐
│  auth-server (Node/Express) │
│  • serves login page        │
│  • validates session cookie │
│  • proxies after auth       │
└──────────┬──────────────────┘
           │ internal Docker network
     ┌─────┴──────┐
     ▼            ▼
  nginx        teleop-server
 (static)     (WebSocket :9091)
 port 80       port 9091
 internal      internal only
 only
```

nginx and the teleop-server lose all exposed ports. Port 8080 is the single network entry point. VPN handles transport encryption.

### Failure mode

If auth-server crashes: all access is blocked, robot receives no commands and halts (watchdog timeout). This is the safe failure mode for a moving robot.

### Mitigations

1. **Minimal auth code** — small surface, few bugs
2. **Compose-level env var validation** — refuses to start if required vars missing; no crash loop
3. **`restart: unless-stopped`** — automatic restart after runtime crashes
4. **Health check** — Docker monitors liveness, triggers restart on hang

---

## Components

### New: `auth-server/`

| File | Responsibility |
|---|---|
| `src/index.ts` | Express app setup, middleware wiring, startup validation |
| `src/credentials.ts` | Load/save/verify credentials from `/data/credentials.json`; bcrypt hashing |
| `src/proxy.ts` | HTTP proxy to nginx; WebSocket proxy to teleop-server |
| `src/routes/auth.ts` | `POST /auth/login`, `POST /auth/logout`, `POST /auth/change-password` |
| `src/views/login.html` | Login page — matches pocket-teleop aesthetic |
| `src/views/change-password.html` | Force-change page shown on first login |
| `test/credentials.test.ts` | Unit tests for credential functions |
| `test/auth.test.ts` | Integration tests for login/logout/change-password routes |
| `Dockerfile.auth` | Node 22-slim, builds and runs auth-server |

### Modified files

| File | Change |
|---|---|
| `docker-compose.yml` | Add `auth-server`; remove exposed ports from `webclient` and `teleop-server` |
| `.env.example` | Add `TELEOP_ADMIN_USER`, `TELEOP_ADMIN_PASSWORD`, `SESSION_SECRET` |
| `.gitignore` | Add `.env` |
| `web-client/index.html` | Change WS URL to same-origin (`ws://${location.hostname}:${location.port}/ws`); remove token from URL |

---

## Session & Credential Flow

### Credential storage — `/data/credentials.json`

```json
{ "username": "admin", "passwordHash": "<bcrypt>", "mustChangePassword": true }
```

- On startup: if file missing, create from `TELEOP_ADMIN_USER`/`TELEOP_ADMIN_PASSWORD` env vars, bcrypt-hash the password, set `mustChangePassword: true`
- File persists across container restarts on the `auth-data` Docker volume
- Env vars are only used to seed the initial file — not read again after that

### Session storage — `/data/sessions/`

- `express-session` + `session-file-store`
- `httpOnly`, `sameSite: lax`, 30-day rolling expiry, signed with `SESSION_SECRET`
- File-backed so sessions survive container restarts
- Reap on startup (`store.reapAsync()`) + every 1 hour (`reapInterval: 3600`) to clean expired files

### Request flows

```
Unauthenticated request
  → serve login page

POST /auth/login
  → verify credentials → set session cookie
  → if mustChangePassword: redirect to /auth/change-password
  → else: redirect to /

POST /auth/change-password (must be authenticated)
  → verify current password → hash new password → save credentials.json
  → clear mustChangePassword → redirect to /

POST /auth/logout
  → destroy session → redirect to login

Authenticated GET /*
  → proxy to nginx (static files, port 80 internal)

Authenticated WebSocket upgrade to /ws
  → rewrite path to /teleop → proxy to teleop-server:9091

GET /health (no auth required)
  → 200 OK — used by Docker health check
```

---

## Docker & Environment

### `docker-compose.yml` additions/changes

```yaml
auth-server:
  build:
    context: ./auth-server
    dockerfile: Dockerfile.auth
    network: host
  ports:
    - "8080:3000"
  environment:
    - "TELEOP_ADMIN_USER=${TELEOP_ADMIN_USER:?Error: TELEOP_ADMIN_USER must be set}"
    - "TELEOP_ADMIN_PASSWORD=${TELEOP_ADMIN_PASSWORD:?Error: TELEOP_ADMIN_PASSWORD must be set}"
    - "SESSION_SECRET=${SESSION_SECRET:?Error: SESSION_SECRET must be set}"
  volumes:
    - auth-data:/data
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```

- `webclient`: remove `ports` mapping (nginx internal only)
- `teleop-server`: remove `ports` mapping (internal only)
- Add `auth-data` named volume

### `.env.example` additions

```
TELEOP_ADMIN_USER=        # required — no default
TELEOP_ADMIN_PASSWORD=    # required — no default
SESSION_SECRET=           # required — generate with: openssl rand -hex 32
```

### Web client WebSocket URL change

```javascript
// Before
const ws = `ws://${location.hostname}:9091/teleop?token=${token}`;

// After
const ws = `ws://${location.hostname}:${location.port}/ws`;
```

Auth-server proxies the WebSocket upgrade after session validation. No token in URL.

---

## Testing

### Unit tests — `test/credentials.test.ts`

- `verifyPassword` returns true for correct password, false for wrong
- `hashPassword` produces a bcrypt hash that round-trips
- `loadCredentials` creates file from env vars if missing; reads existing file
- `saveCredentials` writes updated credentials and persists `mustChangePassword`

### Integration tests — `test/auth.test.ts`

- `POST /auth/login` correct credentials → 302 to `/`
- `POST /auth/login` correct credentials + `mustChangePassword: true` → 302 to `/auth/change-password`
- `POST /auth/login` wrong credentials → 401
- `POST /auth/change-password` authenticated → updates file, clears flag, 302 to `/`
- `POST /auth/change-password` unauthenticated → 401
- `GET /` authenticated → 200 (proxied)
- `GET /` unauthenticated → 302 to login
- `POST /auth/logout` → destroys session, 302 to login

WebSocket proxy path is covered by the existing `web-client/test/integration.test.ts` end-to-end tests.

---

## TELEOP_TOKEN retirement

`TELEOP_TOKEN` is removed. The C++ teleop-server is now internal-only (no exposed port) — no external client can reach it directly. The WebSocket connection comes exclusively from auth-server after session validation, so a shared token on the internal Docker network adds no security value.

Changes:
- Remove `TELEOP_TOKEN` from `docker-compose.yml` and `.env.example`
- Remove token validation from `teleop_server.cpp`
- Remove `?token=` from the WebSocket URL in `web-client/index.html`

---

## Not in scope

- Multi-user support
- OAuth / SSO
- HTTPS termination (handled by VPN)
- Rate limiting on login attempts (home LAN + VPN, acceptable risk)
