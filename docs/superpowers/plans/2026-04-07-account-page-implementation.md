# Account Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Account tab to the settings drawer with username display, logout, and accordion sections for changing username and password (with eyeball toggles and password confirmation).

**Architecture:** Two tasks. Task 1 adds two new backend routes (`GET /auth/me`, `POST /auth/change-username`) with TDD. Task 2 adds the Account page to the web-client drawer in `index.html` — HTML markup, CSS, and inline JS only (no new TS module needed).

**Tech Stack:** Node.js 22, Express 4, TypeScript 5 (auth-server); vanilla JS ES module (web-client). Tests run in Docker only (`docker compose --profile test run --rm auth-server-test`).

---

## Worktree setup

Work on branch `feature/account-page`. Create a worktree:

```bash
git worktree add .worktrees/account-page -b feature/account-page
cd .worktrees/account-page
```

All steps below run from `/home/pi5/pocket-teleop/.worktrees/account-page`.

---

## File Map

### Modified files
| File | Change |
|---|---|
| `auth-server/src/routes/auth.ts` | Add `GET /auth/me` and `POST /auth/change-username` routes |
| `auth-server/test/auth.test.ts` | Add 5 new tests for the two new routes |
| `web-client/index.html` | Add Account nav tab, account drawer page (markup + CSS + JS) |
| `AGENTS.md` | Update handoff state |

---

### Task 1: Backend — `GET /auth/me` + `POST /auth/change-username` (TDD)

**Files:**
- Modify: `auth-server/src/routes/auth.ts`
- Modify: `auth-server/test/auth.test.ts`

- [ ] **Step 1: Add 5 new failing tests to `auth-server/test/auth.test.ts`**

Append to the end of the file, before the final closing (after the last `describe` block):

```typescript
describe('GET /auth/me', () => {
  it('unauthenticated returns 401', async () => {
    const res = await supertest(getApp()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('authenticated returns current username', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
  });
});

describe('POST /auth/change-username', () => {
  it('unauthenticated returns 401', async () => {
    const res = await supertest(getApp())
      .post('/auth/change-username')
      .send('currentPassword=correctpass&newUsername=newadmin')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(401);
  });

  it('wrong current password returns 401', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent
      .post('/auth/change-username')
      .send('currentPassword=wrongpass&newUsername=newadmin')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(401);
  });

  it('correct password changes username, preserves password hash, destroys session, redirects to /auth/login', async () => {
    seedCreds(false);
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent
      .post('/auth/change-username')
      .send('currentPassword=correctpass&newUsername=newadmin')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/login');
    // File updated: username changed, password hash preserved
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    expect(creds.username).toBe('newadmin');
    expect(await bcrypt.compare('correctpass', creds.passwordHash)).toBe(true);
    // Session destroyed
    const check = await agent.get('/');
    expect(check.headers['location']).toBe('/auth/login');
  });
});
```

- [ ] **Step 2: Run tests to confirm the 5 new tests fail**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -15
```

Expected: 18 passing, 5 failing with `Cannot find route` or 404.

- [ ] **Step 3: Add routes to `auth-server/src/routes/auth.ts`**

Add these two routes inside `authRouter`, after the existing `router.post('/change-password', ...)` block and before `return router;`:

```typescript
  router.get('/me', (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    return res.json({ username: req.session.userId });
  });

  router.post('/change-username', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.session.userId) return res.status(401).send('Unauthorized');
      const { currentPassword, newUsername } = req.body as {
        currentPassword?: string;
        newUsername?: string;
      };
      if (!currentPassword || !newUsername) return res.status(400).send('Missing fields');
      const creds = await readCredentials(credPath);
      if (!await verifyPassword(currentPassword, creds.passwordHash)) {
        return res.status(401).send('Current password incorrect');
      }
      await saveCredentials(
        { username: newUsername, passwordHash: creds.passwordHash, mustChangePassword: false },
        credPath,
      );
      req.session.destroy(() => res.redirect('/auth/login'));
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 4: Run all tests to confirm all 23 pass**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -15
```

Expected: 23 tests passing (18 existing + 5 new), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add auth-server/src/routes/auth.ts auth-server/test/auth.test.ts
git commit -m "feat: auth routes — GET /auth/me + POST /auth/change-username (23 tests passing)"
```

---

### Task 2: Account page in settings drawer

**Files:**
- Modify: `web-client/index.html`

This task adds all HTML markup, CSS, and JS for the account page directly in `index.html`. No new TS module is needed — all account page logic is self-contained inline JS.

- [ ] **Step 1: Add "Account" nav item**

In `web-client/index.html`, find:
```html
      <li class="nav-item" data-page="connection">Connection</li>
    </ul>
```

Replace with:
```html
      <li class="nav-item" data-page="connection">Connection</li>
      <li class="nav-item" data-page="account">Account</li>
    </ul>
```

- [ ] **Step 2: Add account page markup**

Find the end of the connection page (after `</div>` closing `#page-connection`) and before `</nav>`. Add:

```html
    <!-- Account page -->
    <div id="page-account" class="drawer-page" hidden>

      <!-- Header: username + logout -->
      <div class="account-header">
        <span class="account-username" id="account-username">—</span>
        <form method="POST" action="/auth/logout" style="margin:0">
          <button type="submit" class="btn-logout">Log out</button>
        </form>
      </div>

      <!-- Change Username accordion -->
      <div class="accordion">
        <button type="button" class="accordion-header" id="acc-username-btn" aria-expanded="false">
          Change username <span class="accordion-chevron">▾</span>
        </button>
        <div class="accordion-body" id="acc-username-body" hidden>
          <form id="form-change-username" method="POST" action="/auth/change-username">
            <div class="pw-wrap">
              <input type="password" name="currentPassword" placeholder="Current password" autocomplete="current-password" required>
              <button type="button" class="eyeball" aria-label="Show password"></button>
            </div>
            <input type="text" name="newUsername" placeholder="New username" autocomplete="username" required>
            <button type="submit">Save</button>
            <p class="form-error" hidden></p>
          </form>
        </div>
      </div>

      <!-- Change Password accordion -->
      <div class="accordion">
        <button type="button" class="accordion-header" id="acc-password-btn" aria-expanded="false">
          Change password <span class="accordion-chevron">▾</span>
        </button>
        <div class="accordion-body" id="acc-password-body" hidden>
          <form id="form-change-password" method="POST" action="/auth/change-password">
            <input type="hidden" name="newUsername" id="cp-hidden-username">
            <div class="pw-wrap">
              <input type="password" name="currentPassword" placeholder="Current password" autocomplete="current-password" required>
              <button type="button" class="eyeball" aria-label="Show password"></button>
            </div>
            <div class="pw-wrap">
              <input type="password" name="newPassword" id="cp-new-password" placeholder="New password" autocomplete="new-password" required>
              <button type="button" class="eyeball" aria-label="Show password"></button>
            </div>
            <div class="pw-wrap">
              <input type="password" id="cp-confirm-password" placeholder="Confirm new password" autocomplete="new-password" required>
              <button type="button" class="eyeball" aria-label="Show password"></button>
            </div>
            <button type="submit">Save</button>
            <p class="form-error" hidden></p>
          </form>
        </div>
      </div>

    </div>
```

- [ ] **Step 3: Add CSS**

Find the end of the `<style>` block (just before `</style>`). Add:

```css
    /* ── Account page ────────────────────────── */
    .account-header {
      display: flex; align-items: center; justify-content: space-between;
      padding-bottom: 12px; border-bottom: 1px solid var(--border);
    }
    .account-username { font-size: 15px; font-weight: 600; }
    .btn-logout {
      padding: 6px 12px; background: #ef4444; color: #fff;
      border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
    }
    .btn-logout:active { opacity: 0.85; }

    .accordion { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .accordion + .accordion { margin-top: 8px; }
    .accordion-header {
      width: 100%; display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px; background: none; border: none; font-size: 14px;
      font-weight: 500; color: var(--text); cursor: pointer; text-align: left;
    }
    .accordion-header:hover { background: var(--border); }
    .accordion-chevron { transition: transform 0.2s; }
    .accordion-header[aria-expanded="true"] .accordion-chevron { transform: rotate(180deg); }
    .accordion-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); }

    .pw-wrap { position: relative; display: flex; align-items: center; }
    .pw-wrap input { width: 100%; padding-right: 36px; }
    .eyeball {
      position: absolute; right: 8px; background: none; border: none;
      cursor: pointer; color: var(--text-muted); padding: 4px; line-height: 0;
    }
    .eyeball:hover { color: var(--text); }
    .form-error { font-size: 12px; color: #ef4444; margin: 0; }
```

- [ ] **Step 4: Add account page JS**

Find this line in the `<script type="module">` block:
```javascript
    router.navigate('gamepad'); // initialise: ensures only gamepad page is visible
```

After it, add the entire account page JS block:

```javascript
    // ── Account page ─────────────────────────────────────────────────────────

    const EYE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const EYE_SLASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    // Initialise eyeball icons and toggles
    document.querySelectorAll('.eyeball').forEach((btn) => {
      btn.innerHTML = EYE_SVG;
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.innerHTML = show ? EYE_SLASH_SVG : EYE_SVG;
      });
    });

    // Accordion (only one open at a time)
    const accPanels = [
      { btn: document.getElementById('acc-username-btn'), body: document.getElementById('acc-username-body') },
      { btn: document.getElementById('acc-password-btn'), body: document.getElementById('acc-password-body') },
    ];
    accPanels.forEach(({ btn, body }) => {
      btn.addEventListener('click', () => {
        const opening = body.hidden;
        accPanels.forEach(({ btn: b, body: bo }) => {
          bo.hidden = true;
          b.setAttribute('aria-expanded', 'false');
        });
        if (opening) {
          body.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // Change-password client-side validation (passwords must match)
    document.getElementById('form-change-password').addEventListener('submit', (e) => {
      const newPw     = document.getElementById('cp-new-password').value;
      const confirmPw = document.getElementById('cp-confirm-password').value;
      const errEl     = e.currentTarget.querySelector('.form-error');
      if (newPw !== confirmPw) {
        e.preventDefault();
        errEl.textContent = 'Passwords do not match.';
        errEl.hidden = false;
      } else {
        errEl.hidden = true;
      }
    });

    // Load current username from server when account page is opened
    async function loadAccountPage() {
      try {
        const res = await fetch('/auth/me');
        if (!res.ok) return;
        const { username } = await res.json();
        document.getElementById('account-username').textContent = username;
        document.getElementById('cp-hidden-username').value = username;
      } catch (_) { /* network error — leave placeholder */ }
    }

    // Hook into router to load account data on navigate
    const _origOnNavigate = router.onNavigate;
    router.onNavigate = (page) => {
      _origOnNavigate(page);
      if (page === 'account') loadAccountPage();
    };
```

- [ ] **Step 5: Run auth-server tests to confirm backend still passes**

```bash
docker compose --profile test run --rm auth-server-test 2>&1 | tail -10
```

Expected: 23 tests passing, 0 failures.

- [ ] **Step 6: Build the web-client image and verify it builds cleanly**

```bash
docker compose build webclient 2>&1 | tail -5
```

Expected: `webclient  Built` with no errors.

- [ ] **Step 7: Commit**

```bash
git add web-client/index.html
git commit -m "feat: account page — username display, logout, change-username/password accordions, eyeball toggle"
```

- [ ] **Step 8: Update AGENTS.md**

Update the Handoff State section in `AGENTS.md`:

1. Change the summary line to:
```
> **For the next agent:** Account page feature complete and merged. All planned milestones done. No active implementation plan.
```

2. Update Head SHA to the commit from Step 7.

3. Add to Known Deviations if any deviations were made.

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md — account page complete"
```

---

## Smoke Test (manual, after all tasks)

```bash
docker compose up --build
```

Open `http://<robot-ip>:8080`, log in, open the drawer (☰), click **Account**:

1. Current username shown at top
2. Red "Log out" button works
3. "Change username" accordion opens/closes; other closes when this opens
4. Eyeball toggles visibility in each password field
5. Submit change-username with correct current password → redirected to login; new username works
6. "Change password" accordion: mismatched passwords show "Passwords do not match." error
7. Submit change-password with matching passwords → redirected to login; new password works
