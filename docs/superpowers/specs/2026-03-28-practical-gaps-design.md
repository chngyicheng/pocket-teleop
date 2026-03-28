# pocket-teleop Practical Gaps — Design Spec

**Scope:** Three improvements to the web client: auto-reconnection, gamepad profile management, and a calibration UI. No server changes required.

---

## 1. Reconnection

### Behaviour

When the WebSocket closes for any reason other than a deliberate `disconnect()` call, `TeleopClient` automatically retries. Each retry waits longer than the last (exponential backoff). After the retry limit is exhausted, the existing `onClose` callback fires so the UI can offer a manual reconnect button.

### Constructor options (additions to `TeleopClientOptions`)

| Option | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `5` | Maximum automatic retry attempts before giving up |
| `retryBaseDelayMs` | `number` | `2000` | Delay before attempt 1; doubles each attempt |

Backoff schedule with defaults: 2 s, 4 s, 8 s, 16 s, 32 s → give up.

### New callback

```typescript
onReconnecting?: (attempt: number, maxAttempts: number, delayMs: number) => void;
```

Fires immediately before each retry, after the delay has been scheduled but before it elapses — gives the UI enough information to show "Reconnecting in 4 s (attempt 2/5)".

### Implementation notes

- `TeleopClient` stores the URL passed to `connect()` and a boolean `intentionalDisconnect` flag (set in `disconnect()`, cleared in `connect()`).
- On `onClose`: if `intentionalDisconnect` is true, call `options.onClose` and stop. Otherwise start the retry loop.
- Each retry calls `connection.connect(url)` and restarts the keepalive and gamepad handler.
- After `maxRetries` with no success, call `options.onClose` (the manual-reconnect signal).
- Calling `connect()` externally (the manual reconnect button) resets the retry counter and `intentionalDisconnect`.

### `index.html` changes

`onClose` now shows "Disconnected — " with a **Reconnect** button that calls `client.connect(wsUrl)`. `onReconnecting` updates the status paragraph: "Reconnecting in Xs (attempt N/M)…".

---

## 2. Gamepad profiles (`gamepad_profiles.ts`)

### Types

```typescript
export interface AxisConfig {
  axis: number;
  invert: boolean;
}

export interface AxisMapping {
  lx: AxisConfig;   // linear_x — typically left stick Y
  ly: AxisConfig;   // linear_y — typically left stick X
  az: AxisConfig;   // angular_z — typically right stick X
}

export type ButtonMapping = Record<string, number>; // action name → button index

export interface GamepadProfile {
  name: string;
  idPattern: RegExp;
  mapping: AxisMapping;
  buttons: ButtonMapping;
}
```

### Built-in profiles

| Name | `idPattern` | lx | ly | az | Notes |
|---|---|---|---|---|---|
| Xbox | `/xbox\|xinput/i` | axis 1 inv | axis 0 inv | axis 2 inv | Standard XInput layout |
| DualShock / DualSense | `/054c/i` | axis 1 inv | axis 0 inv | axis 3 inv | Sony USB vendor ID; right stick X is axis 3 |
| GameSir G8+ | `TODO: verify gamepad.id on hardware` | axis 1 inv | axis 0 inv | axis 2 inv | Standard dual-analog layout; id string must be confirmed by running calibration UI once on device |
| Generic | `/.*/` | axis 1 inv | axis 0 inv | axis 2 inv | Fallback; always matches |

Built-ins have empty `buttons: {}` by default.

### Exported functions

```typescript
matchProfile(gamepadId: string): GamepadProfile
saveProfile(name: string, mapping: AxisMapping, buttons: ButtonMapping): void
loadCustomProfiles(): GamepadProfile[]
deleteProfile(name: string): void
```

- `matchProfile`: searches built-in profiles in order by `idPattern`, then returns Generic. Custom profiles are never auto-matched — they are only applied via manual selection in the calibration UI dropdown. Returns a copy so callers cannot mutate the registry.
- `saveProfile`: upserts by name into `localStorage`. Custom profiles have no `idPattern` used for auto-matching; they are always selected manually.
- `loadCustomProfiles`: returns `[]` gracefully if `localStorage` is unavailable (Node.js test environment).
- `deleteProfile`: removes by name from `localStorage`; no-op if not found.

**`localStorage` key:** `pocket-teleop.gamepad-profiles` (JSON array of `{ name, idPatternSource, mapping, buttons }`; `idPattern` serialised as its `.source` string for JSON compatibility).

---

## 3. `GamepadHandler` changes

### Constructor option additions

```typescript
profile?: GamepadProfile;   // if omitted, auto-matched on first gamepad detected
onButton?: (action: string) => void;  // fires on button press (rising edge)
```

### Behaviour changes

- On first non-null gamepad in `poll()`: if no profile was provided, call `matchProfile(gp.id)` and store it.
- `poll()` reads axes via `AxisConfig` instead of hardcoded indices: `value = gp.axes[config.axis] * (config.invert ? -1 : 1)`.
- `poll()` tracks previous button states; fires `onButton(action)` for each action in `profile.buttons` whose button transitions from not-pressed to pressed.
- New public method: `setProfile(profile: GamepadProfile): void` — replaces active profile at runtime (used by calibration UI).

### `TeleopClient` changes

`TeleopClientOptions` gains `onButton?: (action: string) => void`. `TeleopClient` forwards it to `GamepadHandler`.

---

## 4. Calibration UI (`index.html`)

A `<details>` element labelled "Configure gamepad" appears when a gamepad is first detected (polled from `navigator.getGamepads()`). It is hidden until then.

### Profile selector

A `<select>` dropdown lists all profiles (built-ins + custom). Changing selection calls `handler.setProfile(selectedProfile)` immediately. A **Delete** button appears for custom profiles only.

### Axis calibration (sequential steps)

| Step | Instruction | Detection |
|---|---|---|
| 1 | Push left stick fully forward | Axis with largest absolute deflection → `lx`; sign determines `invert` |
| 2 | Push left stick fully right | Same → `ly` |
| 3 | Push right stick fully right | Same → `az` |

Each step samples `gp.axes` over 1 s (5 × 200 ms polls), takes the max-deflection axis. A **Next** / **Skip** button per step. Skipping a step keeps the current profile value for that axis.

### Button assignment

Below the axis steps: a list of current button assignments (action name + button index + **Remove** button). An **Add** button opens an inline form: text input for action name + "Press a button…" live detection (first button pressed while form is open). Saves on press.

### Save / apply

A **Save as…** text input + **Save** button at the bottom. Saves the calibrated mapping as a new custom profile via `saveProfile()`. Also calls `handler.setProfile()` immediately. The dropdown updates to show the new profile.

All calibration state is local to the inline script — no new `.ts` files for UI logic.

---

## 5. Files changed

| File | Change |
|---|---|
| `web-client/src/gamepad_profiles.ts` | **New** — types, built-ins, match/save/load/delete |
| `web-client/src/gamepad_handler.ts` | Add profile support, `setProfile()`, `onButton` rising-edge detection |
| `web-client/src/teleop_client.ts` | Add reconnection loop, `onReconnecting`, `onButton` forwarding |
| `web-client/index.html` | Reconnect button + status, calibration UI |
| `web-client/test/integration.test.ts` | Add reconnection integration test |
| `web-client/test/gamepad_profiles.test.ts` | **New** — unit tests for pure profile logic |

---

## 6. Testing

### Reconnection integration test

Connects a `TeleopClient` (client A), waits for status confirmation. Connects a second raw `Connection` (client B) to occupy the slot — this kicks client A, triggering its reconnection loop. Disconnects client B after 1 s. Asserts client A fires `onReconnecting` at least once and eventually fires `onStatus` again (successful reconnect). Uses `maxRetries: 3, retryBaseDelayMs: 500` to keep the test fast.

### `gamepad_profiles.ts` unit tests

Pure logic; no I/O. Tests run in Node — `loadCustomProfiles()` returns `[]` when `localStorage` is absent.

| Test | Assertion |
|---|---|
| `matchProfile` returns Xbox profile for Xbox id string | profile name is `'Xbox'` |
| `matchProfile` returns DualShock profile for Sony vendor id string | profile name is `'DualShock / DualSense'` |
| `matchProfile` returns Generic for unknown id string | profile name is `'Generic'` |
| `matchProfile` returns Generic when id is empty string | profile name is `'Generic'` |
| Built-in profiles are returned as copies | mutating result does not affect next call |
| `loadCustomProfiles` returns empty array when localStorage absent | returns `[]` without throwing |

### Calibration UI

Browser-only. Verified manually on device.

---

## 7. Known limitations

- GameSir G8+ `idPattern` is a placeholder — the implementing agent must run the calibration UI on the actual hardware, note the `gamepad.id` string logged to console, and substitute it before committing.
- Button actions (e.g. `emergency_stop`) are stored and forwarded but produce no robot behaviour in this version. Wiring actions to server commands is deferred to the next phase.
- `localStorage` is unavailable in the test container (Node.js) — custom profile persistence is not integration-tested. The pure match/serialise logic is covered by unit tests.
