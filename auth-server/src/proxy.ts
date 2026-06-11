import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Socket } from 'net';
import type { Store } from 'express-session';

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
 * Build an unmasked WebSocket close frame.
 * Format: 0x88 (close opcode), payload length, code (2 bytes, big-endian), reason (ASCII).
 */
export function buildWsCloseFrame(code: number, reason: string): Buffer {
  const reasonBytes = Buffer.from(reason, 'ascii');
  const payloadLength = 2 + reasonBytes.length; // code (2 bytes) + reason

  const frame = Buffer.alloc(2 + payloadLength);
  frame[0] = 0x88; // Close opcode
  frame[1] = payloadLength; // Length (since < 126, just the value)
  frame.writeUInt16BE(code, 2); // Code in big-endian
  reasonBytes.copy(frame, 4); // Reason starts at byte 4

  return frame;
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
 *
 * `store` and `idleTimeoutMs` enable session idle timeout monitoring: every 60s,
 * check if the session has expired (lastActivity > idleTimeoutMs). If so, send
 * a 4001 WebSocket close frame and destroy the socket.
 */
export function makeWsUpgradeHandler(
  target: string,
  sessionMiddleware?: RequestHandler,
  store?: Store,
  idleTimeoutMs?: number,
) {
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
      const sess = (req as any).session;
      // Idle check at upgrade time: a session whose lastActivity is already past
      // the timeout must not open a control channel, even if its file has not
      // been destroyed yet (HTTP idle-destroy only runs on HTTP requests).
      const idleExpired = idleTimeoutMs !== undefined
        && typeof sess?.lastActivity === 'number'
        && Date.now() - sess.lastActivity > idleTimeoutMs;
      if (sess?.userId && !idleExpired) {
        const sessionID = (req as any).sessionID;

        // Set up idle timeout monitoring if store and timeout are provided
        let idleCheckInterval: NodeJS.Timeout | null = null;
        if (store && idleTimeoutMs) {
          idleCheckInterval = setInterval(() => {
            store.get(sessionID, (err: any, current: any) => {
              // Session gone, store error, or lastActivity exceeded: kill the socket.
              // Sessions without lastActivity are spared, matching the HTTP idle middleware.
              if (err || !current
                  || (typeof current.lastActivity === 'number'
                      && Date.now() - current.lastActivity > idleTimeoutMs)) {
                const closeFrame = buildWsCloseFrame(4001, 'session expired');
                socket.write(closeFrame);
                socket.end();
                if (idleCheckInterval) clearInterval(idleCheckInterval);
              }
            });
          }, 60_000); // Check every 60 seconds
          idleCheckInterval.unref(); // Don't block process exit
        }

        // Clean up interval on socket close
        socket.on('close', () => {
          if (idleCheckInterval) clearInterval(idleCheckInterval);
        });

        (wsProxy as any).upgrade!(req, socket, head);
      } else {
        reject(socket);
      }
    });
  };
}
