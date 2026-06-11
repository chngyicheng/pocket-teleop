import { Router, type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readCredentials, saveCredentials, verifyPassword, hashPassword } from '../credentials.js';
import { makeLoginLimiters } from '../rate_limit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS_DIR = path.join(__dirname, '../../views');

// Precomputed bcrypt hash for timing-safe login comparison.
// This ensures verifyPassword() always runs, preventing username enumeration attacks.
// The actual string value does not matter; it is used only to consume bcrypt.compare time.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export function authRouter(credPath: string, idleTimeoutMs: number = 30 * 60 * 1000): Router {
  const router = Router();
  const { ipLimiter, userLimiter, recordFailure } = makeLoginLimiters();

  router.get('/login', (_req, res) => {
    res.sendFile(path.join(VIEWS_DIR, 'login.html'));
  });

  router.post('/login', ipLimiter, userLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      if (!username || !password) {
        recordFailure(req);
        return res.redirect('/auth/login?error=1');
      }
      const creds = await readCredentials(credPath);
      // Timing-safe comparison: always run verifyPassword to prevent username enumeration.
      const usernameMatch = username === creds.username;
      const hashToCompare = usernameMatch ? creds.passwordHash : DUMMY_HASH;
      const passwordValid = await verifyPassword(password, hashToCompare);
      const valid = usernameMatch && passwordValid;
      if (!valid) {
        recordFailure(req);
        return res.redirect('/auth/login?error=1');
      }
      req.session.userId = username;
      req.session.lastActivity = Date.now();
      req.session.mustChangePassword = creds.mustChangePassword;
      if (creds.mustChangePassword) {
        return res.redirect('/auth/change-password');
      }
      return res.redirect('/');
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/auth/login'));
  });

  router.get('/change-password', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    res.sendFile(path.join(VIEWS_DIR, 'change-password.html'));
  });

  router.post('/change-password', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.session.userId) return res.status(401).send('Unauthorized');
      const { currentPassword, newUsername, newPassword } = req.body as {
        currentPassword?: string;
        newUsername?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword) return res.status(400).send('Missing fields');
      if (newPassword.length < 6) return res.status(400).send('Password must be at least 6 characters');
      const creds = await readCredentials(credPath);
      if (!await verifyPassword(currentPassword, creds.passwordHash)) {
        return res.redirect('/auth/change-password?error=1');
      }
      if (newPassword === currentPassword) {
        return res.status(400).send('New password must differ from the current password');
      }
      const newUsernameVal = newUsername ?? creds.username;
      if (newUsernameVal === 'admin' && newPassword === 'admin') {
        return res.status(400).send('Cannot use default admin credentials');
      }
      const updated = {
        username: newUsernameVal,
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      };
      await saveCredentials(updated, credPath);
      // First-login forced change: keep session, go to app
      if (req.session.mustChangePassword) {
        req.session.userId = updated.username;
        req.session.mustChangePassword = false;
        return res.redirect('/');
      }
      // Account-page change: destroy session, force re-login
      req.session.destroy(() => res.redirect('/auth/login'));
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    return res.json({ username: req.session.userId });
  });

  router.get('/session-status', (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const lastActivity = req.session.lastActivity ?? Date.now();
    const remainingMs = Math.max(0, idleTimeoutMs - (Date.now() - lastActivity));
    return res.json({ remainingMs });
  });

  router.post('/heartbeat', (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    req.session.lastActivity = Date.now();
    return res.sendStatus(204);
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
      if (newUsername === 'admin') {
        return res.status(400).send('Cannot use default admin username');
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

  return router;
}
