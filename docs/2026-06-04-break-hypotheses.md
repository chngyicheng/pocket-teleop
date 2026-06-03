# Break Hypotheses — 2026-06-04

> Adversarial-test seed list. Six verified break points across auth-server and web-client. Each entry names a hypothesis, the file:line that proves it possible by inspection, the adversarial input, expected behaviour, and observed behaviour. Tests under `*.adversarial.test.ts` are written to fail today — fixing them is the next agent's job.

Method: three parallel Haiku scouts in wenyan-ultra surveyed React UI, auth-server, and timer/reconnect paths. Controller (Opus 4.7) re-read each candidate against the source to drop false positives. Six survivors below.

---

## H1 — WebSocket upgrade bypasses session auth (CRITICAL)

**Where:** `auth-server/src/proxy.ts:16-26`, `auth-server/src/index.ts:33`

`makeWsUpgradeHandler` proxies every `upgrade` event straight to `teleop-server:9091` via `http-proxy-middleware`. There is no session-cookie check before the upgrade fires. The handler is wired with `server.on('upgrade', ...)` at index.ts:33, completely outside the Express middleware chain that mounts `session(...)` in `app.ts`.

**Adversarial input:** raw WebSocket connect to `ws://<host>:8080/ws` with no `Cookie` header.

**Expected:** 401 Unauthorized before the upgrade handshake completes.

**Actual:** 101 Switching Protocols. Anonymous client now controls `/cmd_vel`.

**Impact:** Anyone who reaches the host on port 8080 can drive the robot without logging in. All other security work (bcrypt, atomic writes, secure cookies) is moot for the teleop channel.

---

## H2 — Space key fires E-STOP while user is typing in SettingsDrawer

**Where:** `web-client/src/views/MissionControl.tsx:68-77`, `web-client/src/views/MissionTablet.tsx` (same pattern)

The `keydown` listener is attached to `window` and triggers `bridge.eStop()` on `e.code === 'Space'` with no `event.target` / `instanceof HTMLInputElement` guard. SettingsDrawer mounts a sibling input (e.g. video URL field) inside the same window. Pressing space while the input has focus calls `preventDefault()` AND fires the e-stop.

**Adversarial input:** open SettingsDrawer, focus the Video URL input, type `rtsp://cam 1.local`.

**Expected:** space character inserted into input, no e-stop.

**Actual:** every space keystroke triggers `bridge.eStop()` and is stripped from the input.

**Impact:** can't enter URLs / labels with spaces; every settings edit kicks the robot into e-stop.

---

## H3 — `change-password` accepts new password identical to old

**Where:** `auth-server/src/routes/auth.ts:56-89`

The route checks `newPassword.length < 6` and a special-case block on `"admin"/"admin"`, but never compares `newPassword` against `currentPassword`. A user (or attacker who already has the password) can "rotate" to the exact same secret, satisfying any rotation prompt without actually changing the credential.

**Adversarial input:** POST `/auth/change-password` with `currentPassword === newPassword` and length ≥ 6.

**Expected:** 400 with a "new password must differ" message.

**Actual:** 200/redirect, `credentials.json` rewritten with a fresh bcrypt hash of the same plaintext.

**Impact:** policy gap. Lets a compromised credential survive a forced rotation.

---

## H4 — `latencyMs` readout renders garbage for negative / NaN / Infinity

**Where:** `web-client/src/views/MissionControl.tsx:299`, `web-client/src/views/MissionTablet.tsx` (same render)

The guard is `bridge.latencyMs !== null ? ${bridge.latencyMs} ms : '— ms'`. Anything that is a number — including `-42`, `NaN`, `Infinity` — passes through. `pingSentAt` is reset to 0 only on successful pong; if a stale pong arrives after the keepalive overwrote `pingSentAt`, the subtraction can be tiny or even negative under clock drift. NaN can leak in if `Date.now()` is mocked or the test bridge passes through unchecked values.

**Adversarial input:** drive `bridge.latencyMs` to `-42`, `NaN`, and `Infinity` in turn.

**Expected:** display falls back to `— ms` for any non-finite or negative value.

**Actual:** literally renders `-42 ms`, `NaN ms`, `Infinity ms`.

**Impact:** operator sees nonsense and loses trust in the LAT pill — the very widget meant to flag connection trouble.

---

## H5 — Protocol odom parser passes NaN / Infinity through `typeof` gate

**Where:** `web-client/src/protocol.ts:37-41`

`typeof NaN === 'number'` and `typeof Infinity === 'number'`. The parser only checks `typeof msg.x === 'number'`, so `{"type":"odom","x":NaN,"y":Infinity,"heading":-Infinity}` (or any JSON containing these via a buggy server / reviver / tampered proxy) becomes a structurally-valid `odom` message. Downstream MiniMap and Compass feed those into `Math.atan2` / coordinate transforms, producing NaN screen positions and broken SVG paths.

**Adversarial input:** server emits `{"type":"odom","x":NaN,"y":0,"heading":0}` (via a sympathetic mock).

**Expected:** parser returns `{type:'unknown', raw}` and discards.

**Actual:** parser returns a typed odom message; UI propagates NaN.

**Impact:** a single bad odom message poisons the map until a clean one arrives. Worse if odom rate is low.

---

## H6 — TeleopClient never detects a zombie pong stream

**Where:** `web-client/src/teleop_client.ts:116-150`

Keepalive fires `buildPing()` every 200 ms but only reads pong replies. There is no "pong overdue" detector. `pingSentAt` is overwritten by each new ping (`startKeepalive` interval), so if the server stops responding, `pingSentAt` keeps advancing and the next stale pong (whenever it arrives) reports tiny latency, hiding the outage. The WebSocket can sit in `readyState === 1` for the full TCP timeout window — minutes — while the operator sees a green pill.

**Adversarial input:** mock pong stream stops responding; ping continues for ≥ 5 keepalive cycles.

**Expected:** after some threshold (e.g. 3 missed pongs), `onClose` fires with a synthetic code and reconnection kicks in.

**Actual:** no callback. `latencyMs` either stale or freshly tiny when a delayed pong arrives. Connection state stays `live`.

**Impact:** the operator drives a robot they believe is connected. Closest thing to a silent failure in the entire stack.

---

## Out-of-scope hypotheses considered and dropped

- **TeleopClient exponential backoff overflow** — `Math.min(retryIntervalMs * 2**(n-1), 30_000)` caps cleanly at 30 s; `Math.min(Infinity, 30_000) === 30_000`. Not a bug.
- **Joystick coordinate Infinity** — `Math.hypot` and `Math.atan2` defend in practice; touch pointer x/y are bounded by viewport.
- **matchMedia threshold thrash at 699/700 px** — real, but cosmetic; React reconciles cleanly. Defer until reported.
- **SettingsDrawer rapid-click toggle** — visual jitter only; state remains consistent.
