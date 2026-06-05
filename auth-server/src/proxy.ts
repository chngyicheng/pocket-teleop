import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Socket } from 'net';

export function makeHttpProxy(target: string, pathRewrite?: Record<string, string>): RequestHandler {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: 10_000,
    timeout: 10_000,
    ...(pathRewrite ? { pathRewrite } : {}),
  }) as unknown as RequestHandler;
}

/**
 * WebSocket upgrade handler for /ws. The teleop socket is the robot control
 * channel, so it MUST be authenticated exactly like the HTTP routes — an
 * unauthenticated upgrade would let any LAN client drive the robot.
 *
 * `sessionMiddleware` is the same express-session instance used by the app
 * (see createApp). It is run against the raw upgrade request to populate
 * `req.session` from the cookie; only requests with a valid `userId` session
 * are proxied. Fail closed: no middleware or no session → 401 + socket destroy.
 */
export function makeWsUpgradeHandler(target: string, sessionMiddleware?: RequestHandler) {
  const wsProxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/ws': '/teleop' },
  });

  const reject = (socket: Socket) => {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
  };

  return (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (!sessionMiddleware) {
      reject(socket);
      return;
    }
    // express-session expects (req, res, next). The upgrade has no real
    // ServerResponse, so pass a minimal stub exposing only the methods the
    // middleware touches while loading (not writing) the session.
    const res = {
      setHeader() {},
      getHeader() {},
      removeHeader() {},
      writeHead() {},
      end() {},
      on() {},
      once() {},
      emit() {},
    } as unknown as ServerResponse;

    sessionMiddleware(req as any, res as any, () => {
      if ((req as any).session?.userId) {
        (wsProxy as any).upgrade!(req, socket, head);
      } else {
        reject(socket);
      }
    });
  };
}
