# auth-server — login + reverse proxy

## Purpose

Node/Express server on port 8080 — the only host-exposed port. Validates the session cookie, forces a first-login password change, and fronts everything:

```
Phone browser  http://<robot-ip>:8080
    │
    ▼ port 8080 (only exposed port)
┌──────────────────────────────────────────────────────────┐
│  auth-server (Node/Express)                                │
│  • session cookie validation + 30-min idle timeout         │
│  • login rate limit (per-IP 10/min + per-user 5/min)       │
│  • proxies HTTP            → nginx (internal, serves dist/) │
│  • proxies /ws upgrade     → teleop-server:9091 (session-authed, fail-closed) │
│  • proxies /video, /mediamtx-api → mediamtx:8889           │
│  • POST /perf → logs first-paint timing                    │
└──────────────────────────────────────────────────────────┘
```

## Ownership

Owns: `src/`, `test/`, `views/`, `Dockerfile.auth` (base → builder → runtime), `package.json`, `vitest.config.ts`, `tsconfig.json`. Credentials persist in the `auth-data` Docker volume at `/data/credentials.json` (survive reboots + `up --build`; only `down -v` resets to `.env` defaults).

| File | What it does |
|---|---|
| `src/credentials.ts` | bcrypt hash/verify; init + read/save `credentials.json` |
| `src/robot_config.ts` | Parse/serialize/validate robot config; seven-key allowlist (ROBOT_TYPE, ROBOT_NAME, ROBOT_NAMESPACE, ROBOT_LENGTH_M, ROBOT_WIDTH_M, VIDEO_TOPIC, VIDEO_TOPIC_TYPE) |
| `src/app.ts` | `createApp(AppOptions)` factory — testable Express wiring; `/perf` + `/auth-static` routes |
| `src/index.ts` | Entry point — env validation, server start, WS upgrade wiring |
| `src/proxy.ts` | HTTP proxy to webclient; `makeWsUpgradeHandler` runs express-session on `/ws` upgrade (fail-closed); `/video` + `/mediamtx-api` proxies |
| `src/routes/auth.ts` | Login, logout, change-password (rejects new == current); `enforceDefaultCredentialChange`; `/auth/session-status`, `/auth/heartbeat`, `/auth/robot-config` (GET/PUT) |
| `src/rate_limit.ts` | Hand-rolled per-IP + per-user login rate limiter |
| `views/login.html` / `change-password.html` | Login + force-change pages (themed; offline woff2 via `/auth-static`) |
| `test/auth.test.ts` / `auth_offline.test.ts` / `credentials.test.ts` | Route integration (supertest) + offline + credential unit tests |
| `test/robot_config.test.ts` | robot-config module unit + endpoint integration (32 tests) |
| `test/idle_timeout.test.ts` / `rate_limit.test.ts` / `tls_proxy.test.ts` / `perf_beacon.test.ts` | Idle/rate-limit/TLS/perf behavior |
| `test/*.adversarial.test.ts` | Hardening cases |
| `test/mediamtx_integration.test.ts` | Apply-button e2e — needs `mediamtx-test` container (full `--profile test` only) |

## Local Contracts

- **`/ws` upgrade is fail-closed** — runs express-session; no valid session = reject. Never weaken.
- **No default credentials path** — first login forces a password change (`enforceDefaultCredentialChange`); change-password rejects new == current. Single-operator model: one credential set per robot, multi-user not implemented.
- **Idle timeout 30 min** rolling: `lastActivity` middleware; `/auth/session-status` poll excluded from activity; `/auth/heartbeat` + `/auth/robot-config` (GET/PUT) on real input; WS upgrade 401 when expired + per-connection re-check every 60 s kills with a 4001 close frame. Cookie maxAge 30 min rolling.
- **Robot config** (`GET/PUT /auth/robot-config`): Seven-key allowlist only (ROBOT_TYPE, ROBOT_NAME, ROBOT_NAMESPACE, ROBOT_LENGTH_M, ROBOT_WIDTH_M, VIDEO_TOPIC, VIDEO_TOPIC_TYPE). Reads/writes `/config/robot.env` atomically. Never exposes secrets. Partial PUT allowed; merges with existing. Validation per field; 400 with error map on invalid.
- **Login rate limit**: per-IP 10/min + per-user 5/min (`rate_limit.ts`).
- bcrypt for credential hashing; secrets via env only, never in source.
- Session cookie `secure: 'auto'` follows `req.secure` from `trust proxy` + Caddy's `X-Forwarded-Proto`; plain-HTTP LAN keeps a non-Secure cookie and works unchanged.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TELEOP_ADMIN_USER` | Yes | Initial admin username — first run only, seeds credentials |
| `TELEOP_ADMIN_PASSWORD` | Yes | Initial admin password — first run only; forced change on first login |
| `SESSION_SECRET` | Yes | Signs session cookies; `openssl rand -hex 32` |
| `TELEOP_SERVER_URL` | No (`http://teleop-server:9091`) | Teleop WS server URL for `/ws` proxy |
| `WEBCLIENT_URL` | No (`http://webclient:80`) | nginx webclient URL for HTTP proxy |
| `MEDIAMTX_URL` | No (`http://localhost:8889`) | MediaMTX API + WHEP; proxied at `/video` |
| `BIND_HOST` | No (`0.0.0.0`) | Set `127.0.0.1` behind the TLS frontend so plain HTTP is loopback-only |

## Work Guidance

- Testing trophy: route integration via supertest; `createApp(AppOptions)` for testable wiring; `*.adversarial.test.ts` = hardening. TDD order mandatory.
- `mediamtx_integration.test.ts` (3) needs the full `--profile test` stack — red without it is expected, not a regression.

## Verification

```bash
docker compose -p pocket-teleop run --rm --no-deps --build auth-server-test npm test
```
`--build` REQUIRED after edits (else a stale baked image is reused). Baseline: auth count in the root AGENTS.md "Test baseline" (authoritative).

## Child DOX Index

No children. Leaf boundary. For the proxied targets (teleop-server, nginx web client, MediaMTX): root [AGENTS.md](../AGENTS.md) + [repository-structure.md](../memory/agent-guides/repository-structure.md).
