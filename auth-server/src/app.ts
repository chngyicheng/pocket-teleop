import express from 'express';
import session from 'express-session';
import FileStoreCreator from 'session-file-store';
import fs from 'fs';
import { authRouter } from './routes/auth.js';
import { makeHttpProxy } from './proxy.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    mustChangePassword?: boolean;
  }
}

export interface AppOptions {
  credPath: string;
  sessionsPath: string;
  sessionSecret: string;
  webClientUrl?: string;
  mediaMtxUrl?: string;
  mediaMtxApiUrl?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FileStore = (FileStoreCreator as any)(session);

export function createApp(options: AppOptions): express.Application {
  const webClientUrl = options.webClientUrl
    ?? process.env['WEBCLIENT_URL']
    ?? 'http://webclient:80';

  const mediaMtxUrl = options.mediaMtxUrl
    ?? process.env['MEDIAMTX_URL']
    ?? 'http://localhost:8889';

  const mediaMtxApiUrl = options.mediaMtxApiUrl
    ?? process.env['MEDIAMTX_API_URL']
    ?? 'http://localhost:9997';

  fs.mkdirSync(options.sessionsPath, { recursive: true });

  const store = new FileStore({
    path: options.sessionsPath,
    reapInterval: 3600,
    logFn: () => {},
  });

  const app = express();

  app.use(session({
    store,
    secret: options.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
    rolling: true,
  }));

  app.get('/health', (_req, res) => res.sendStatus(200));

  // Body parsers scoped to /auth only — proxy routes must receive raw streams.
  // Global body parsers consume the request stream before the proxy can pipe it,
  // causing the proxy request to hang (http-proxy pipes the drained stream, which
  // never ends, so the connection stalls).
  app.use('/auth', express.urlencoded({ extended: false }), express.json(), authRouter(options.credPath));

  // Unauthenticated: redirect to login
  app.use((req, res, next) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    // Prevent browser from caching authenticated pages so back-button forces re-auth check
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Authenticated but must change password: redirect to change-password
  app.use((req, res, next) => {
    if (req.session.mustChangePassword && !req.path.startsWith('/auth')) {
      return res.redirect('/auth/change-password');
    }
    next();
  });

  // Video stream proxy (WHEP media)
  app.use('/video', makeHttpProxy(mediaMtxUrl));

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
