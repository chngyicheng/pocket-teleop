import express from 'express';
import session from 'express-session';
import FileStoreCreator from 'session-file-store';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth.js';
import { makeHttpProxy } from './proxy.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    mustChangePassword?: boolean;
    lastActivity?: number;
  }
}

export interface AppOptions {
  credPath: string;
  sessionsPath: string;
  sessionSecret: string;
  webClientUrl?: string;
  mediaMtxUrl?: string;
  mediaMtxApiUrl?: string;
  idleTimeoutMs?: number;
  robotConfigPath?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FileStore = (FileStoreCreator as any)(session);

export function createApp(options: AppOptions): express.Application {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const webClientUrl = options.webClientUrl
    ?? process.env['WEBCLIENT_URL']
    ?? 'http://webclient:80';

  const mediaMtxUrl = options.mediaMtxUrl
    ?? process.env['MEDIAMTX_URL']
    ?? 'http://localhost:8889';

  const mediaMtxApiUrl = options.mediaMtxApiUrl
    ?? process.env['MEDIAMTX_API_URL']
    ?? 'http://localhost:9997';

  const idleTimeoutMs = options.idleTimeoutMs ?? (30 * 60 * 1000);

  const robotConfigPath = options.robotConfigPath
    ?? process.env['ROBOT_CONFIG_PATH']
    ?? '/config/robot.env';

  fs.mkdirSync(options.sessionsPath, { recursive: true });

  const store = new FileStore({
    path: options.sessionsPath,
    reapInterval: 3600,
    logFn: () => {},
  });

  const app = express();

  // Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For, etc.) for TLS termination.
  // When Caddy or similar reverse proxy terminates TLS and forwards HTTP to us, we need
  // to recognize HTTPS from X-Forwarded-Proto for secure cookies.
  app.set('trust proxy', 1);

  const sessionMiddleware = session({
    store,
    secret: options.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 30 * 60 * 1000,
    },
    rolling: true,
  });
  app.use(sessionMiddleware);
  // Exposed so the WebSocket upgrade handler can authenticate /ws the same way.
  app.set('sessionMiddleware', sessionMiddleware);
  // Expose store and timeout for WebSocket idle timeout checks
  app.set('sessionStore', store);
  app.set('idleTimeoutMs', idleTimeoutMs);

  app.get('/health', (_req, res) => res.sendStatus(200));

  // Idle timeout check: destroy session if lastActivity exceeded
  app.use((req, res, next) => {
    if (req.session && req.session.userId && req.session.lastActivity) {
      const elapsed = Date.now() - req.session.lastActivity;
      if (elapsed > idleTimeoutMs) {
        req.session.destroy((err) => {
          if (err) console.error('Session destroy error:', err);
          next();
        });
        return;
      }
    }
    next();
  });

  // Activity tracking: update lastActivity for authenticated requests (excluding session-status)
  app.use((req, res, next) => {
    if (req.session && req.session.userId && req.path !== '/auth/session-status') {
      req.session.lastActivity = Date.now();
    }
    next();
  });

  // Unauthenticated static fonts route — must be before auth-redirect middleware
  app.use('/auth-static', express.static(path.join(__dirname, '../public')));

  // UI performance beacon — client POSTs first-paint / load timing here after
  // React mounts, so the server log carries a real "UI ready at +N ms" line per
  // page load. Unauthenticated + before the auth-redirect so it always records;
  // body parser scoped to this route only (proxy routes need raw streams).
  app.post('/perf', express.json({ limit: '4kb' }), (req, res) => {
    console.log(`[perf] ${new Date().toISOString()} ${JSON.stringify(req.body)}`);
    res.sendStatus(204);
  });

  // Body parsers scoped to /auth only — proxy routes must receive raw streams.
  // Global body parsers consume the request stream before the proxy can pipe it,
  // causing the proxy request to hang (http-proxy pipes the drained stream, which
  // never ends, so the connection stalls).
  app.use('/auth', express.urlencoded({ extended: false }), express.json(), authRouter(options.credPath, idleTimeoutMs, robotConfigPath));

  // Unauthenticated: redirect to login
  app.use((req, res, next) => {
    if (!req.session || !req.session.userId) return res.redirect('/auth/login');
    // Prevent browser from caching authenticated pages so back-button forces re-auth check
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Authenticated but must change password: redirect to change-password
  app.use((req, res, next) => {
    if (req.session && req.session.mustChangePassword && !req.path.startsWith('/auth')) {
      return res.redirect('/auth/change-password');
    }
    next();
  });

  // Video stream proxy (WHEP media) — pathRewrite strips /video prefix so
  // /video/teleop/whep → /teleop/whep on mediamtx (same reason as /mediamtx-api).
  app.use('/video', makeHttpProxy(mediaMtxUrl, { '^/video': '' }));

  // MediaMTX config API — authenticated; /mediamtx-api/* → mediaMtxApiUrl/v3/*
  // http-proxy-middleware resets req.url = req.originalUrl in prepareProxyRequest, so
  // manual req.url mutation before calling the proxy is always overwritten.
  // pathRewrite runs after the reset, operating on req.originalUrl — use it instead.
  // mediaMtxApiUrl is port 9997 (config API), distinct from mediaMtxUrl port 8889 (WHEP).
  app.use('/mediamtx-api', makeHttpProxy(mediaMtxApiUrl, { '^/mediamtx-api': '/v3' }));

  // Proxy authenticated requests to nginx (catch-all — must be last)
  app.use(makeHttpProxy(webClientUrl));

  return app;
}
