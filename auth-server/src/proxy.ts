import { RequestHandler } from 'express';

export function makeHttpProxy(_target: string): RequestHandler {
  return (_req, res) => res.status(502).send('proxy not yet implemented');
}

export function makeWsUpgradeHandler(_target: string) {
  return (_req: unknown, _socket: unknown, _head: unknown) => {};
}
