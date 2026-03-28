# Touch Joystick Design Spec

**Goal:** Add floating on-screen touch joysticks for holonomic robot control, a robot namespace/name field, responsive layout improvements, and fix several existing UI bugs.

---

## Scope

| In scope | Out of scope |
|---|---|
| `TouchJoystick` TypeScript module | Server-side namespace wiring (follow-up task) |
| Robot namespace stored + displayed + sent in WS URL | Android app |
| Responsive layout: velocity bar overlay, robot name strip, 4:3 placeholder | |
| Input source switching (gamepad ↔ touch) | |
| Settings drawer: new Connection page | |
| Bug fixes: burger z-index, nav tabs, placeholder text | |

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web-client/src/touch_joystick.ts` | Create | `TouchJoystick` class — floating touch joystick, normalised output |
| `web-client/test/touch_joystick.test.ts` | Create | ~8 unit tests using jsdom TouchEvent simulation |
| `web-client/src/settings.ts` | Modify | Add `loadRobotNamespace`, `saveRobotNamespace` |
| `web-client/test/settings.test.ts` | Modify | +2 tests for namespace persistence |
| `web-client/src/gamepad_handler.ts` | Modify | Add `setEnabled(boolean)`, `onActivity` callback |
| `web-client/src/teleop_client.ts` | Modify | Add `setGamepadEnabled(boolean)`, `onGamepadActivity` to options |
| `web-client/index.html` | Rewrite | Full layout update + joystick wiring + bug fixes |

---

## Module: `TouchJoystick`

```typescript
interface TouchJoystickOptions {
  maxRadius: number;                          // px — max knob travel from origin
  onMove: (x: number, y: number) => void;    // x/y normalised -1..1
  onEnd: () => void;                          // finger lifted
}

class TouchJoystick {
  constructor(container: HTMLElement, options: TouchJoystickOptions)
}
```

**Behaviour:**
- Renders two `<div>`s inside `container`: `joystick-base` (outer ring) and `joystick-knob` (inner circle). Both hidden (`display: none`) until first touch.
- **touchstart**: record finger origin from `touch.clientX/Y`, position base at that point, show both divs.
- **touchmove**: compute delta from origin, clamp magnitude to `maxRadius`, translate knob to clamped position, fire `onMove(x, y)` with values normalised to -1..1 (`delta / maxRadius`).
- **touchend / touchcancel**: reset knob to base centre, hide both divs, call `onEnd()`.
- Event listeners attached to `container` — each joystick zone is fully independent.
- Left joystick: `onMove(x, y)` maps to `sendTwist(y, x, 0)` — forward/back = `lx`, strafe = `ly`. Y axis inverted (up = positive).
- Right joystick: `onMove(x, _)` maps to `sendTwist(0, 0, -x)` — horizontal only for `az`. X axis inverted (right = clockwise).

---

## Layout

### DOM structure (top to bottom)

```
<header #app-header>        sticky, 48px, z-index: 40 (above drawer)
<div #robot-name-strip>     thin row (~32px), hidden when namespace empty
<main #video-panel>         flex: 1, position: relative
  <div #vel-overlay>        position: absolute, top: 0, semi-transparent
  <p #video-placeholder>    4:3 aspect-ratio box, max-width+max-height: 100%
  <img #video-img>          object-fit: contain (unchanged)
<div #backdrop>             fixed overlay (drawer backdrop)
<nav #drawer>               slide-in settings drawer
<div #joystick-left>        position: fixed, bottom-left corner
<div #joystick-right>       position: fixed, bottom-right corner
```

### Joystick zones

```css
#joystick-left, #joystick-right {
  position: fixed;
  bottom: 0;
  width: 45vw;
  height: 45vh;
  z-index: 15;   /* above video, below drawer */
}
#joystick-left  { left: 0; }
#joystick-right { right: 0; }
```

### Velocity overlay (replaces footer)

```css
#vel-overlay {
  position: absolute;
  top: 0; left: 0; right: 0;
  background: rgba(0, 0, 0, 0.35);
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

### Video placeholder (4:3, height-limited)

```css
#video-placeholder-box {
  aspect-ratio: 4 / 3;
  max-width: 100%;
  max-height: 100%;
}
```

### Robot name strip

```css
#robot-name-strip {
  flex: 0 0 auto;
  padding: 4px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  display: none;  /* shown via JS when namespace is set */
}
```

### Header z-index fix

Header z-index raised to 40 (above drawer's 30) so `☰` remains tappable while the drawer is open — acts as the close button.

---

## Settings Drawer

### New "Connection" page

Third nav item added. Contains:

| Field | Storage key | Default |
|---|---|---|
| Robot namespace | `teleop_robot_namespace` | `''` |

On apply: reconstruct WS URL as `ws://host:9091/teleop?token=<t>&ns=<namespace>` (server ignores `ns` for now). Update robot name strip visibility and text.

### `settings.ts` additions

```typescript
const NS_KEY = 'teleop_robot_namespace';
export function loadRobotNamespace(): string | null   // reads 'teleop_robot_namespace'
export function saveRobotNamespace(ns: string): void  // writes 'teleop_robot_namespace'
export function clearRobotNamespace(): void            // removes 'teleop_robot_namespace'
```

---

## Input Source Switching

State: `inputSource: 'gamepad' | 'touch'` (default `'touch'`).

| Event | Action |
|---|---|
| `window gamepadconnected` | `inputSource = 'gamepad'`; hide joystick zones; `client.setGamepadEnabled(true)` |
| `window gamepaddisconnected` | `inputSource = 'touch'`; show joystick zones |
| touchstart on joystick zone | `inputSource = 'touch'`; show joystick zones; `client.setGamepadEnabled(false)` |
| `onGamepadActivity` fires (while `inputSource === 'touch'`) | `inputSource = 'gamepad'`; hide joystick zones; `client.setGamepadEnabled(true)` |

**Gamepad activity threshold:** any axis `|value| > 0.1` or any button pressed.

### `GamepadHandler` changes

```typescript
setEnabled(enabled: boolean): void   // pause/resume polling loop
onActivity?: () => void              // fires on axis > 0.1 or button pressed
```

### `TeleopClient` changes

```typescript
// TeleopClientOptions additions
onGamepadActivity?: () => void
// new method
setGamepadEnabled(enabled: boolean): void
```

---

## Bug Fixes

| Bug | Fix |
|---|---|
| Burger `☰` hidden behind drawer | Header z-index: 40 (above drawer z-index: 30) |
| Placeholder text references `⚙` | Change to `"No video stream — configure one in Settings (☰)"` |
| Nav tabs (Gamepad/Video) do nothing | Call `router.navigate('gamepad')` on init to fire `onNavigate` and set correct initial state |
| Both drawer pages always visible | Same fix — `onNavigate` on init ensures only active page is shown |

---

## Testing

### `web-client/test/touch_joystick.test.ts` (~8 tests)

| Test | What it verifies |
|---|---|
| `joystick base is hidden on init` | both divs `display: none` before any touch |
| `touchstart shows the joystick` | base and knob become visible |
| `onMove fires with normalised values` | `(delta / maxRadius)` passed to callback |
| `values clamp to -1..1 at max radius` | delta beyond `maxRadius` clamps |
| `onEnd fires on touchend` | callback called when finger lifts |
| `knob resets to centre on touchend` | knob position returns to base centre |
| `joystick hides on touchend` | base and knob `display: none` again |
| `second touch updates from new origin` | floating origin resets on each touchstart |

### `web-client/test/settings.test.ts` (+2 tests)

| Test | What it verifies |
|---|---|
| `loadRobotNamespace returns null when empty` | no stored value → null |
| `loadRobotNamespace returns saved value after saveRobotNamespace` | round-trip |

**Expected total: 53 tests** (43 existing + 8 `touch_joystick` + 2 `settings`).

---

## Known follow-up tasks

- Server reads `?ns=` parameter and publishes to `/<ns>/cmd_vel`
