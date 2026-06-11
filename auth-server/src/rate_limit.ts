import type { Request, Response, NextFunction } from 'express';

// Hand-rolled failure-only rate limiting. express-rate-limit was considered
// but its success/failure accounting keys off the response status — login
// failures here are 302 redirects (?error=1), indistinguishable from the
// success redirect, so the handler records failures explicitly instead.
const WINDOW_MS = 60_000;
const IP_LIMIT = 10;
const USERNAME_LIMIT = 5;

const RATE_LIMIT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Too many login attempts</title></head>
<body style="font-family: -apple-system, 'Segoe UI', sans-serif; padding: 40px; text-align: center;">
  <h1 style="font-size: 20px;">Too many login attempts</h1>
  <p>Please try again in a minute.</p>
  <p><a href="/auth/login">Back to login</a></p>
</body>
</html>`;

export interface LoginRateLimit {
  ipLimiter: (req: Request, res: Response, next: NextFunction) => void;
  userLimiter: (req: Request, res: Response, next: NextFunction) => void;
  recordFailure: (req: Request) => void;
}

function ipKey(req: Request): string {
  return req.ip ?? 'unknown';
}

function usernameKey(req: Request): string {
  const username = (req.body as { username?: string } | undefined)?.username;
  return username ?? ipKey(req);
}

function recentFailures(store: Map<string, number[]>, key: string): number[] {
  const now = Date.now();
  const kept = (store.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  store.set(key, kept);
  return kept;
}

function makeLimiter(
  store: Map<string, number[]>,
  key: (req: Request) => string,
  limit: number,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (recentFailures(store, key(req)).length >= limit) {
      res.set('Retry-After', String(WINDOW_MS / 1000));
      return res.status(429).send(RATE_LIMIT_HTML);
    }
    next();
  };
}

// Fresh stores per call: each app instance (and each test app) gets
// independent counters.
export function makeLoginLimiters(): LoginRateLimit {
  const ipStore = new Map<string, number[]>();
  const usernameStore = new Map<string, number[]>();

  return {
    ipLimiter: makeLimiter(ipStore, ipKey, IP_LIMIT),
    userLimiter: makeLimiter(usernameStore, usernameKey, USERNAME_LIMIT),
    recordFailure: (req: Request) => {
      recentFailures(ipStore, ipKey(req)).push(Date.now());
      recentFailures(usernameStore, usernameKey(req)).push(Date.now());
    },
  };
}
