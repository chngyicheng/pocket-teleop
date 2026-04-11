import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler } from 'express';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export function makeHttpProxy(target: string, pathRewrite?: Record<string, string>): RequestHandler {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    ...(pathRewrite ? { pathRewrite } : {}),
  }) as unknown as RequestHandler;
}

export function makeWsUpgradeHandler(target: string) {
  const wsProxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/ws': '/teleop' },
  });
  return (req: IncomingMessage, socket: Socket, head: Buffer) => {
    (wsProxy as any).upgrade!(req, socket, head);
  };
}
