# Account Page Design Spec

**Date:** 2026-04-07
**Feature:** Account page in settings drawer — view username, change username, change password, logout

---

## Goal

Add an "Account" tab to the settings drawer that lets the operator view their current username, change their username, change their password, and log out. All credential changes force a re-login.

---

## Architecture

No new backend routes. The existing `POST /auth/change-password` route already accepts `currentPassword`, `newUsername`, `newPassword` and destroys the session on success (redirecting to `/auth/login`). Both change-username and change-password flows use this same endpoint.

Changes are confined to:
- `web-client/index.html` — new drawer nav tab + account page markup + accordion JS
- `auth-server/views/change-password.html` — no changes needed (first-login flow unchanged)

---

## Page Layout

The account page is a fourth drawer tab labelled **"Account"**, using the existing `.drawer-page` pattern. It contains:

### 1. Header row
- Current username displayed as a read-only label (fetched from the session via a new `GET /auth/me` endpoint — see note below)
- Red "Log out" button floated right — submits `POST /auth/logout` via a `<form>`

### 2. Change Username accordion
Collapsed by default. Expands to show:
- Current password field (type="password") with eyeball toggle
- New username field (type="text")
- "Save" button — POSTs to `POST /auth/change-username` (new route, see below)

The existing `POST /auth/change-password` rehashes `newPassword`, so it cannot be used for username-only changes. A dedicated `POST /auth/change-username` route accepts `currentPassword` + `newUsername` only, leaving `passwordHash` unchanged.

### 3. Change Password accordion
Collapsed by default. Expands to show:
- Current password field (type="password") with eyeball toggle
- New password field (type="password") with eyeball toggle
- Confirm new password field (type="password") with eyeball toggle
- Client-side validation: new password and confirm must match before form submits
- "Save" button — POSTs to `POST /auth/change-password` with `currentPassword`, `newUsername` (same as current), `newPassword`

**Note on `newUsername` in change-password flow:** Since the existing route requires `newUsername`, the form sends the current username (fetched from `GET /auth/me`) as `newUsername` to leave it unchanged.

---

## New Backend Routes

### `GET /auth/me`
Returns the current session's username.

**Auth:** requires session (`userId` set). Returns 401 if unauthenticated.

**Response:**
```json
{ "username": "admin" }
```

Used by the account page on load to display the current username and to populate `newUsername` in the change-password form.

### `POST /auth/change-username`
Changes username only, leaving password unchanged.

**Auth:** requires session.

**Body (urlencoded):** `currentPassword`, `newUsername`

**Logic:**
1. Verify `currentPassword` against stored hash — return 401 if wrong
2. Read current credentials, update `username` to `newUsername`, keep `passwordHash` unchanged, set `mustChangePassword: false`
3. Save credentials
4. Destroy session
5. Redirect to `/auth/login`

---

## Accordion Behaviour

- Only one accordion open at a time — opening one closes the other
- Toggle on header click
- CSS transition for smooth open/close (max-height animation)
- Accordion headers styled as drawer nav items (consistent with existing UI)

---

## Eyeball Toggle

Each password input is wrapped in a `position: relative` container. An absolutely-positioned `<button type="button">` sits on the right edge. On click it toggles `input.type` between `"password"` and `"text"` and swaps the icon.

Icon: inline SVG eye / eye-slash (no external dependency).

The button has `aria-label="Show password"` / `"Hide password"` and `tabindex="0"`.

---

## Client-Side Validation

Change-password form only:
- On submit: check `newPassword === confirmPassword` — if not, show inline error message and abort submit
- No other client-side validation (server handles wrong current password with 401)

---

## After Save

Both change-username and change-password routes destroy the session and redirect to `/auth/login`. The client follows the redirect naturally (form POST). No JS redirect needed.

---

## Logout

A `<form method="POST" action="/auth/logout">` with a single submit button styled in red. No JS required.

---

## Styling

Follows existing drawer aesthetic:
- Accordion headers: same font/padding as `.drawer-page h3`
- Inputs: same style as `.drawer-page input[type="text"]`
- Save buttons: same style as `.drawer-page button`
- Logout button: same style but `background: #ef4444; color: #fff`
- Eyeball button: no background, no border, cursor pointer, positioned inside input wrapper

---

## Files Changed

| File | Change |
|---|---|
| `web-client/index.html` | Add Account nav tab, account drawer page with accordion markup and JS |
| `auth-server/src/routes/auth.ts` | Add `GET /auth/me` and `POST /auth/change-username` routes |
| `auth-server/test/auth.test.ts` | Add tests for `GET /auth/me` and `POST /auth/change-username` |

---

## Testing

New tests in `auth-server/test/auth.test.ts`:

- `GET /auth/me` unauthenticated → 401
- `GET /auth/me` authenticated → `{ username: 'admin' }`
- `POST /auth/change-username` unauthenticated → 401
- `POST /auth/change-username` wrong current password → 401
- `POST /auth/change-username` correct → session destroyed, redirect to `/auth/login`, file updated with new username, password unchanged
- `POST /auth/change-password` with matching passwords → existing tests cover this

The eyeball toggle and accordion behaviour are UI-only and not covered by automated tests (no jsdom test for these interactions; covered by manual smoke test).
