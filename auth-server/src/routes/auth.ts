import { Router, type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readCredentials, saveCredentials, verifyPassword, hashPassword } from '../credentials.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS_DIR = path.join(__dirname, '../../views');

export function authRouter(credPath: string): Router {
  const router = Router();

  router.get('/login', (_req, res) => {
    res.sendFile(path.join(VIEWS_DIR, 'login.html'));
  });

  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      if (!username || !password) {
        return res.redirect('/auth/login?error=1');
      }
      const creds = await readCredentials(credPath);
      const valid = username === creds.username && await verifyPassword(password, creds.passwordHash);
      if (!valid) {
        return res.redirect('/auth/login?error=1');
      }
      req.session.userId = username;
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
      const creds = await readCredentials(credPath);
      if (!await verifyPassword(currentPassword, creds.passwordHash)) {
        return res.redirect('/auth/change-password?error=1');
      }
      const updated = {
        username: newUsername ?? creds.username,
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      };
      await saveCredentials(updated, credPath);
      req.session.userId = updated.username;
      req.session.mustChangePassword = false;
      return res.redirect('/');
    } catch (err) {
      next(err);
    }
  });

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

  return router;
}
