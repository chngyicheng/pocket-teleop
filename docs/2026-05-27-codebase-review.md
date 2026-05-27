# pocket-teleop — Codebase Review (2026-05-27)

> Audience: a fresh agent picking up this codebase. Read top-to-bottom; every finding lists file, line, and a concrete fix. Findings are **verified by direct read** after sub-agent analysis — invalid sub-agent findings were dropped, so you can trust this list.
>
> Methodology: six Haiku sub-agents reviewed disjoint slices (frontend TS core, frontend HTML/UI, video pipeline, auth-server, C++ teleop server, cross-cutting). The architect then read each flagged file:line to confirm, downgrade, or reject. See "Verification notes" at the bottom for findings rejected and why.

---

## Architecture as actually built (verified against code)

```
phone browser  http://<robot-ip>:8080
    │
    ▼  port 8080 (the only intended public port)
auth-server (Node/Express)                 PORT=8080, host network
  • express-session (file store, /data/sessions)
  • /auth/* → login, logout, change-password, change-username, me
  • /video → mediamtx WHEP (8889)
  • /mediamtx-api → mediamtx config API (9997)
  • upgrade /ws → teleop-server (localhost:9091)
  • catch-all → webclient nginx (localhost:18080)
      │              │              │              │
      ▼              ▼              ▼              ▼
  webclient   teleop-server   mediamtx       video-bridge
  (nginx)     (C++ ROS2)      (RTSP+WHEP)    (rclpy → GStreamer → RTSP push)
              port 9091       8554 / 8889
              host network    9997 / 8891 UDP
                              all host network
```

The **fatal architectural assumption** is that teleop-server (9091), mediamtx RTSP (8554), and mediamtx config API (9997) are "internal." With `network_mode: host` they are **not** — they bind to 0.0.0.0 on the robot and are reachable from anywhere on the LAN. See findings 2, 6, 7.

---

## Findings

### CRITICAL

**1. `mjpegImgElEl` typo still present in showVideoStream — index.html:951-952**

Declaration on line 948 is `const mjpegImgEl` (correct), but `showVideoStream` references `mjpegImgElEl`:

```
951:      mjpegImgElEl.src = '';
952:      mjpegImgElEl.style.display = 'none';
```

The previous handoff in `AGENTS.md` claimed this typo was fixed; in fact only the declaration was renamed — the body of `showVideoStream` still has the wrong name. When WebRTC successfully connects and `WhepClient.onStream` fires, `showVideoStream` throws `ReferenceError: mjpegImgElEl is not defined`, so the `<video>` element never receives `srcObject`. Test suite does not exercise this path (jsdom doesn't supply MediaStream), which is why 157 tests still pass.

**Fix:** rename both lines to `mjpegImgEl`. Also see finding 30 about adding a regression test that drives `showVideoStream`.

**2. Teleop WebSocket port 9091 publicly reachable without auth — docker-compose.yml:14, teleop_server.cpp:38**

`docker-compose.yml` puts teleop-server on `network_mode: "host"`. `teleop_server.cpp:38` calls `ws_server_.listen(port_)` with no host argument; websocketpp's default is to bind to all interfaces. `on_open` performs **no token check** — only single-client enforcement. The auth-server WS proxy at `/ws` is the only documented path, but it does not prevent direct connections to `ws://<robot-ip>:9091/teleop`. Anyone on the LAN can drive the robot with `wscat`.

**Fix:** either (a) bind teleop-server to `127.0.0.1` only (requires moving it onto a Docker bridge network or passing a bind address into websocketpp), or (b) require a session token at WS handshake and have auth-server inject it via header rewrite in `makeWsUpgradeHandler`. Option (a) is the cleanest given the proxy already exists. Note that `network_mode: host` is currently used so the ROS2 DDS discovery works on the host's NIC — switching teleop-server off host network needs separate thinking about DDS (could keep it host-mode and just add a loopback bind in C++, e.g. `ws_server_.listen("127.0.0.1", port_)`).

---

### HIGH

**3. Exponential-backoff reconnect claimed but never implemented — teleop_client.ts:127-137**

```ts
private scheduleRetry(): void {
  this.retryAttempt += 1;
  this.options.onReconnecting?.(this.retryAttempt);
  this.retryTimeoutId = setTimeout(() => { ... }, this.retryIntervalMs);  // constant 5000ms
}
```

`retryAttempt` is incremented and reported to the UI but never used in the delay computation. `AGENTS.md` says "exponential-backoff reconnect" — that is documentation drift.

**Fix:** `setTimeout(..., Math.min(this.retryIntervalMs * 2 ** (this.retryAttempt - 1), 30_000))`. Or, simpler, decide that constant 5 s is fine and fix the docs.

**4. `test_command_handler.cpp` is empty (0 bytes) — server/test/test_command_handler.cpp**

The whole pure-logic parser layer is untested. `CMakeLists.txt` and `AGENTS.md` both reference this test target. JSON parsing edge cases (NaN, integers vs floats, missing keys, extra keys, deeply nested input, boundary -1.0/1.0) are exercised nowhere.

**Fix:** populate with gtest cases covering: valid twist, boundary values, out-of-range, missing fields, type errors, NaN, Infinity, malformed JSON, ping, unknown type, large payload.

**5. NaN bypasses range check — command_handler.cpp:30**

```cpp
if (val < -1.0 || val > 1.0) { ... }   // false for NaN — both comparisons fail
```

A client sending `{"type":"twist","linear_x":NaN,...}` (which JSON does not allow per spec, but `nlohmann::json` accepts and many JSON-emitting clients produce) gets the NaN passed through to `geometry_msgs::Twist::linear.x` and published.

**Fix:** add `if (!std::isfinite(lx) || !std::isfinite(ly) || !std::isfinite(az)) return ParseError{"non-finite value"};`. `<cmath>` is not currently included in this TU — add it.

**6. MediaMTX config API exposed on 0.0.0.0:9997 — mediamtx.yml:9**

`apiAddress: :9997` binds to all interfaces. With host network, anyone on the LAN can PATCH the runtime config and change the video source out from under the authenticated operator (or DoS it).

**Fix:** `apiAddress: 127.0.0.1:9997`. Auth-server's `/mediamtx-api` proxy targets `http://localhost:9997` already (app.ts:38, 95), so this is a one-line change with no other consequences.

**7. MediaMTX RTSP ingest exposed on 0.0.0.0:8554 — mediamtx.yml:13**

Anyone on the LAN can push a stream to path `teleop`, replacing the operator's camera feed. No publish auth is configured.

**Fix:** either `rtspAddress: 127.0.0.1:8554` (video-bridge runs on host network so loopback works) or add a `publish` action with credentials in mediamtx auth config.

**8. Session cookie missing `secure` flag — app.ts:55-59**

```ts
cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 }
```

Fine today because the deployment is HTTP-only on a LAN, but the HTTPS plan (`2026-05-06-https-tls-implementation.md`) is queued and will not be safe without this flag.

**Fix:** add `secure: process.env.NODE_ENV === 'production'` (or wire to a `HTTPS_ENABLED` env var). Bundle this with the HTTPS milestone.

**9. No login rate-limit — auth.ts:16-36**

Known gap per `AGENTS.md` backlog (`2026-05-06-login-rate-limit-implementation.md`). Worth flagging here because in combination with the missing `secure` flag and Wi-Fi LAN exposure, brute-force is the most realistic path to robot control. Pair with #2 — restricting 9091 to loopback closes the only auth-bypass route, so brute force is the only remaining attack surface.

**Fix:** `express-rate-limit` on `POST /auth/login` and `POST /auth/change-password`, 5 attempts / 15 min per IP and per session.

**10. video_bridge.py threading race on pipeline mutation — video_bridge.py:122-156**

`_on_message` runs on the rclpy executor thread; `_on_bus_error` runs on the GLib main loop thread. Both can call `_schedule_pipeline_restart()` concurrently, which mutates `self._pipeline` and `self._src` without a lock.

**Fix:** wrap `_stop_pipeline`, `_schedule_pipeline_restart`, and `_retry_pipeline` with a `threading.Lock`, or marshal all pipeline state changes onto a single thread via `GLib.idle_add`.

**11. Robot namespace silently overrides `cmd_vel_topic` parameter — teleop_node.cpp:22-24**

```cpp
const auto topic = robot_namespace.empty()
  ? base_topic
  : "/" + robot_namespace + "/cmd_vel";
```

If an operator sets both `cmd_vel_topic=/something_else` and `robot_namespace=robot1`, the explicit `cmd_vel_topic` is silently ignored and the topic becomes `/robot1/cmd_vel`. There's no error or warning.

**Fix:** either (a) honour `cmd_vel_topic` when set explicitly (strip leading `/` and re-prefix with namespace), or (b) emit `RCLCPP_WARN` when namespace overrides a non-default cmd_vel_topic. Likely (a) is what users expect.

**12. HTTP proxy lacks request-size limits — proxy.ts:6-12**

`createProxyMiddleware` is called without a body-size or timeout config. Large PATCH bodies to `/mediamtx-api` or large bodies via the catch-all webclient proxy will be streamed end-to-end with no cap. Combined with single-operator model the practical DoS risk is low, but defense-in-depth is missing.

**Fix:** add `limits: { proxyTimeout: 10_000 }` and consider a body size limit middleware ahead of the proxy on routes that don't need large bodies.

---

### MEDIUM

**13. WhepClient `start()` re-entry races with in-flight `_connect()` — whep_client.ts:40-43, 54-115**

`start()` calls `_connect()`, which first calls `_closePc()` (closing any prior `pc`) and then awaits `createOffer → setLocalDescription → _waitForIceGathering → fetch`. If `start()` is called again mid-fetch, the new `_connect()` closes the in-flight `pc`, but the awaited `fetch` for the prior attempt still resolves and tries to call `pc.setRemoteDescription` on a closed PC, throwing.

**Fix:** capture a local `attemptId` (or local `pc` reference) and bail out of the async path if `this.pc !== pc` after each `await`.

**14. Calibration sampling interval race — index.html:1145-1162**

```js
function beginSampling() {
  calNextBtn.style.display = 'none';
  ...
  calSampleInterval = setInterval(..., 200);
}
calNextBtn.addEventListener('click', beginSampling);
```

If two click events have already been dispatched before the first handler hides the button, two `setInterval`s are created. The first becomes orphaned (its handle is overwritten) and runs forever, pushing to `calSamples` concurrently with the new one.

**Fix:** guard at top: `if (calSampleInterval !== null) return;`.

**15. Gamepad-detection setInterval never cleared — index.html:1244-1248**

```js
let gamepadDetected = false;
setInterval(() => {
  if (gamepadDetected) return;
  ...
}, 500);
```

Even after detection, the interval polls forever. Trivial CPU cost but obvious correctness gap.

**Fix:** capture the handle and `clearInterval` after first detection.

**16. Username comparison not timing-safe — auth.ts:23**

```ts
const valid = username === creds.username && await verifyPassword(password, creds.passwordHash);
```

`===` short-circuits, so a wrong username returns faster than a wrong-password-but-correct-username. Single-operator system, so this is mostly an information-disclosure footnote — but it should not be visibly different from a constant-time comparison.

**Fix:** always invoke `verifyPassword` (against a fixed-known-bad hash if username is wrong), and combine results with a single boolean at the end.

**17. `saveCredentials` write is not atomic — credentials.ts:44-49**

`fs.writeFile` truncates then writes; a crash mid-write leaves an empty or partial `credentials.json` and locks the operator out of the robot. Concurrent change-password requests can interleave.

**Fix:** write to `credentials.json.tmp`, then `fs.rename` (atomic on POSIX). Optionally a `proper-lockfile` advisory lock.

**18. No CSRF tokens on POST /auth routes — auth.ts:16, 38, 47, 89**

Defense relies entirely on `sameSite: 'lax'`. For a single-operator LAN tool this is acceptable, but layered defense is cheap.

**Fix:** add `csrf-csrf` middleware on `POST /auth/*` routes, render the token into `login.html` / `change-password.html` / the account form on `index.html`. Tighten cookie to `sameSite: 'strict'` once CSRF tokens are in.

**19. MJPEG URL written to `<img>.src` without re-validation on load path — index.html:1010**

`VideoSourcePicker.validate()` enforces `http://` or `https://` only for new entries, but the boot-time IIFE in `index.html:1055-1068` calls `picker.apply()` from `loadSaved()` which trusts whatever is in `localStorage`. A user who manually tampers with `localStorage` can inject e.g. `data:` or `javascript:` URLs. Browsers refuse non-image schemes in `<img>.src`, so practical risk is near zero — flag for defense-in-depth.

**Fix:** call `validate()` in `loadSaved()` and silently revert to `ros2` if invalid.

**20. WHEP ICE-gathering safety timeout not cleared on success — whep_client.ts:128**

`setTimeout(resolve, 5_000)` is never cancelled when `iceGatheringState === 'complete'` fires first. It eventually resolves an already-resolved promise (a no-op), so behaviourally harmless — just untidy.

**Fix:** capture the timer, `clearTimeout(timer)` in the `check` handler before `resolve()`.

**21. `broadcast()` send errors silently dropped — teleop_server.cpp:113-116**

`ec` is intentionally ignored. Fine on disconnect (cleanup happens via `on_close`), but odom messages dropping because the buffer is briefly full will leave the operator's UI stuck on a stale pose with no diagnostic.

**Fix:** at minimum log `ec` when non-zero. Optionally count drops and surface in a debug status frame.

**22. Watchdog → on_open race window — teleop_server.cpp:128-145, 60-68**

Between `timed_out_ = true` being set in `watchdog_loop` and the posted lambda clearing `has_client_`, a new client connecting is rejected as "already connected" because `has_client_` is still true. The new client then has to reconnect. Rare in practice (window is sub-50 ms).

**Fix:** in the watchdog, hold `client_mutex_`, mark the old client as torn down, set `has_client_ = false` synchronously before scheduling the close. Or accept the race and document it.

---

### LOW / NIT

**23. Duplicated twist-compute logic — keyboard_handler.ts:36-40, 71-74.** Extract into a private method.

**24. Asymmetric `onActivity` firing — keyboard_handler.ts:28, 34.** `onActivity` fires on keydown unconditionally but only on keyup when enabled. Pick one rule.

**25. `settings.ts` does not try/catch localStorage — settings.ts:17, 24.** Other modules (`gamepad_profiles.ts`) do. Inconsistency; private-browsing throws.

**26. video_bridge `_retry_timer` not canceled in `destroy_node` — video_bridge.py:157-159.** Add `if self._retry_timer: self._retry_timer.cancel()` before `super().destroy_node()`.

**27. `Dockerfile.auth` declares `EXPOSE 3000` but actual port is 8080** (cosmetic, no runtime effect with host networking).

**28. CLAUDE.md/AGENTS.md drift.** Claims "157 webclient tests" all pass, claims `mjpegImgEl` typo is fixed. The typo is not fully fixed (finding 1) and the test suite plainly doesn't cover `showVideoStream`. Update the handoff once finding 1 is actually resolved.

**29. Status `connected` field not type-checked in parseMessage — protocol.ts.** Coerced via JS truthiness; data-schema.md says always present. Add `typeof === 'boolean'` guard.

**30. WhepClient missing test for multiple `start()` calls and showVideoStream regression — web-client/test/whep_client.test.ts.** Add a test that calls `start()` twice and asserts only one `fetch` happens (covers #13). Add a separate integration-style test that mocks `MediaStream` and runs `showVideoStream` so finding 1 cannot recur silently.

---

## What's solid (don't refactor for the sake of it)

- **CommandHandler** is a clean pure function with `std::variant` return; the design is right, only NaN and tests are missing (findings 4, 5).
- **TeleopServer** correctly uses `steady_clock` for the watchdog (not `system_clock` — immune to NTP jumps). Single-client enforcement with a mutex is correct. Sub-agent claimed an overflow/NTP issue — false alarm.
- **WhepClient** retry/backoff is correctly implemented (whep_client.ts:140) — the doubling-then-cap pattern is exactly right. Contrast with TeleopClient where it isn't (#3).
- **TouchJoystick** the use of document-level listeners and `_activeTouchIds` to dodge Brave's setPointerCapture quirk is non-obvious and the comments explain why — leave it alone.
- **auth-server middleware ordering** (app.ts:69-98) — body parsers scoped to `/auth` only, auth gate before proxy paths, mediamtx-api before catch-all — this is correct and the inline comments explain why; don't reorder.
- **video_source.ts** has a clean mode/url/validate/save/apply flow; tests cover the validation matrix.
- **Docker compose `network_mode: host`** is the right call for ROS2 DDS discovery — but it forces the binding hygiene fixes in #2, #6, #7.

---

## Verification notes — what was rejected and why

- **C++ sub-agent's "clock overflow / NTP risk"** — code already uses `steady_clock`. Rejected.
- **C++ sub-agent's "watchdog early-exit prevents timeout"** — `timed_out_` is reset in `reset_watchdog()` on each new connection. Rejected.
- **Frontend sub-agent's "double-close race in connection.ts"** — old `ws.close()` and new `new WebSocket()` are sequential in synchronous JS; old handlers fire on the old object reference, new on the new one. Not a bug. Rejected.
- **Multiple "missing null check on getElementById" findings** — every ID referenced in `index.html` is actually present in the markup; null returns are not possible without HTML refactor. Downgraded to nit at most, not listed.
- **WHEP "listener leak" finding** — listener is on the `pc` instance which is GC'd when `_closePc` nulls the reference. Rejected.
- **Several "silent catch" findings on auth forms** — UX paths fall through to network-error display; adding `console.error` adds noise without value. Skipped.

---

## Recommended order of operations

1. **Land #1 immediately** (one-line fix, prevents video panel from working with WebRTC). Add the regression test from #30.
2. **#2 + #6 + #7 together** — these are the actual security boundary; one PR that adds loopback bindings + a `make sure 9091 is not reachable from outside` test.
3. **#4 + #5 together** — populate `test_command_handler.cpp`, then the NaN fix is a one-line change with the test already in place.
4. **#3** — small fix, kills doc drift.
5. **#10 + #26** — video_bridge concurrency.
6. **#9 + #16 + #17 + #18 + #8** as one auth-hardening pass, ideally aligned with the HTTPS milestone (`2026-05-06-https-tls-implementation.md`).
7. Remaining medium / low items as bandwidth allows.

When done, update `AGENTS.md` handoff and remove the stale "all tests pass" / "mjpegImgEl fixed" claims.
