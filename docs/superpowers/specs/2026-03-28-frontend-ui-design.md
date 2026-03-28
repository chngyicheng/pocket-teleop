# Frontend UI Design — pocket-teleop

**Date:** 2026-03-28
**Status:** Approved

---

## Overview

Replace the unstyled `index.html` with a clean, minimal, responsive UI that works on any device (phone, tablet, desktop). The design respects `prefers-color-scheme` for light/dark mode, keeps the driving view uncluttered, and moves all configuration behind a settings drawer.

No new build infrastructure — the existing `tsc` + nginx pipeline is unchanged. One new TypeScript module (`settings.ts`) is added for settings routing and video URL persistence. All DOM wiring stays in `index.html`.

---

## Layout

```
┌─────────────────────────────────────────────┐
│  ☰   pocket-teleop        ● Connected       │  ← sticky header
├─────────────────────────────────────────────┤
│                                             │
│                                             │
│         [ VIDEO STREAM / PLACEHOLDER ]      │  ← fills remaining space
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│  lx  ████░░  0.72   ly  ░░░░░░  0.00       │
│  az  ███░░░ -0.45                           │  ← velocity bar (always visible)
└─────────────────────────────────────────────┘
```

- **Header** — sticky, 48px tall. Hamburger `☰` (left) toggles the settings drawer. App name centered. Connection status pill (right).
- **Video panel** — flex-grows to fill all vertical space between header and velocity bar.
- **Velocity bar** — fixed strip at the bottom. Always visible. Three labeled bars (lx, ly, az).

---

## Header — Connection Status Pill

The status pill in the top-right of the header reflects WebSocket state:

| State | Appearance |
|---|---|
| Connected | `● Connected` — green pill |
| Reconnecting | `⟳ Reconnecting in 3s (1/5)` — amber pill, live countdown |
| Disconnected | `○ Disconnected` — red pill; entire pill is a tappable Reconnect button |

The existing `onStatus`, `onReconnecting`, `onClose` callbacks from `TeleopClient` drive these states. The countdown interval logic from the current `index.html` is preserved.

---

## Velocity Bar

- Three rows: `lx`, `ly`, `az`
- Each row: label + zero-centered filled bar + numeric value (2 decimal places)
- Positive deflection fills rightward from center; negative fills leftward
- Updates at gamepad poll rate (~200 ms); CSS `transition: width 100ms` for smooth animation
- Shows `—` for all values when disconnected (no stale readings)
- A new `onTwist?: (lx: number, ly: number, az: number) => void` option is added to `TeleopClientOptions`; `TeleopClient.sendTwist` fires it. `index.html` wires this callback to update the bar elements directly.

---

## Video Panel

- Always rendered in the DOM — no conditional show/hide
- **No URL configured:** centered placeholder text — `"No video stream — add one in Settings ⚙"`
- **URL configured:** `<img id="video-stream" src="<url>">` fills the panel with `object-fit: contain`
- **Load error:** `onerror` handler swaps back to placeholder text — `"Stream unavailable"`
- Stream URL is stored in `localStorage` via `settings.ts`. Applying a new URL updates `src` live; no page reload needed.

---

## Settings Drawer

**Trigger:** `☰` hamburger in the header toggles the drawer open/closed. Tapping the backdrop also closes it. No close button inside the drawer.

**Layout:**
```
┌──────────────────────────┐░░░░░░░░░░░░░░░░░
│  Settings                │░ (backdrop) ░░░░
│  ──────────────────────  │░░░░░░░░░░░░░░░░░
│  > Gamepad               │░░░░░░░░░░░░░░░░░
│    Video                 │░░░░░░░░░░░░░░░░░
│                          │░░░░░░░░░░░░░░░░░
│  [page content]          │░░░░░░░░░░░░░░░░░
└──────────────────────────┘░░░░░░░░░░░░░░░░░
```

- Width: 320px on desktop; 90% of viewport width on narrow phones (< 400px)
- Slides in from left via `transform: translateX(-100%)` → `translateX(0)` with CSS transition
- Backdrop: semi-transparent overlay behind drawer; click closes
- Two nav items: **Gamepad** and **Video**; active item has a left-border accent

**Gamepad page** — the existing calibration UI verbatim:
- Profile selector + Delete button
- Axis calibration wizard (Start / Next / Skip step)
- Button assignments (add by pressing gamepad button, remove)
- Save profile (name input + Save button)

**Video page** — new, minimal:
- Labeled text input: "Stream URL"
- Pre-filled from `localStorage` on open
- "Apply" — saves URL via `settings.ts`, updates `<img src>` live
- "Clear" — removes URL, reverts video panel to placeholder

---

## `web-client/src/settings.ts`

New TypeScript module. Pure logic — no DOM access.

```typescript
export type SettingsPage = 'gamepad' | 'video';

export class SettingsRouter {
  activePage: SettingsPage;
  onNavigate?: (page: SettingsPage) => void;
  navigate(page: SettingsPage): void;  // sets activePage, fires onNavigate
}

export function loadVideoUrl(): string | null;   // reads localStorage
export function saveVideoUrl(url: string): void; // writes localStorage
export function clearVideoUrl(): void;           // removes localStorage key
```

`index.html` constructs a `SettingsRouter`, sets `onNavigate` to show/hide drawer page elements, and calls `navigate()` from the nav item click handlers.

---

## Styling

- CSS custom properties in `:root` with `@media (prefers-color-scheme: dark)` override block
- Palette: white/near-white background (light), dark-grey background (dark); one accent colour (blue) for active states and pills
- Font: system-ui stack — no external fonts, no network requests
- All styles in a `<style>` block inside `index.html` — no separate stylesheet, no Dockerfile changes

Key tokens:
```css
--bg: #ffffff;          /* page background */
--surface: #f5f5f5;     /* card/panel surface */
--border: #e0e0e0;      /* subtle borders */
--text: #111111;        /* primary text */
--text-muted: #666666;  /* secondary text */
--accent: #0070f3;      /* blue — connected, active nav */
--warn: #f59e0b;        /* amber — reconnecting */
--danger: #ef4444;      /* red — disconnected */
```

---

## Testing

**New unit tests** (`web-client/test/settings.test.ts`):
- `loadVideoUrl` returns `null` when localStorage is empty
- `loadVideoUrl` returns saved value after `saveVideoUrl`
- `clearVideoUrl` removes the saved value
- `SettingsRouter.navigate()` updates `activePage`
- `SettingsRouter.navigate()` fires `onNavigate` callback

**No new integration tests** — settings drawer and video panel involve no server interaction. Existing 38 tests remain the integration coverage baseline.

**Manual verification after implementation:**
- `docker compose up --build --wait webclient` exits healthy
- `curl http://localhost:8080/ | grep -c "pocket-teleop"` returns `1`
- Visual spot-check on phone and desktop: layout renders, drawer opens/closes on hamburger and backdrop, velocity bars update on gamepad input, video placeholder visible, stream URL apply/clear works

---

## Files Changed

| File | Change |
|---|---|
| `web-client/index.html` | Full rewrite — new layout, styles, settings drawer, velocity bars, video panel |
| `web-client/src/settings.ts` | New — `SettingsRouter`, `loadVideoUrl`, `saveVideoUrl`, `clearVideoUrl` |
| `web-client/src/teleop_client.ts` | Add `onTwist` to `TeleopClientOptions`; fire it from `sendTwist` |
| `web-client/test/settings.test.ts` | New — 5 unit tests for `settings.ts` |

No changes to `Dockerfile.webclient`, `docker-compose.yml`, `tsconfig.json`, or any server files.
