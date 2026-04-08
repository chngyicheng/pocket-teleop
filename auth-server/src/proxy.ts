import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler } from 'express';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export function makeHttpProxy(target: string): RequestHandler {
  return createProxyMiddleware({ target, changeOrigin: true }) as unknown as RequestHandler;
}

export function makeWsUpgradeHandler(target: string) {
  const wsProxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/ws': '/teleop' },
  });
  const upgrade = (wsProxy as any).upgrade as
    ((req: IncomingMessage, socket: Socket, head: Buffer) => void) | undefined;
  if (!upgrade) throw new Error('http-proxy-middleware: upgrade handler not available');
  return (req: IncomingMessage, socket: Socket, head: Buffer) => upgrade(req, socket, head);
}
