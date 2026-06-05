import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The default nginx:alpine config ships gzip off, which served the ~190 KB
// bundle uncompressed (it gzips to ~58 KB) — the diagnosed dominant cost of the
// slow-WiFi white screen. This guards that the custom config keeps gzip on for
// the JS bundle and caches hashed assets.
describe('webclient nginx.conf', () => {
  const conf = readFileSync(resolve('nginx.conf'), 'utf-8');

  it('enables gzip for the JS bundle', () => {
    expect(conf).toMatch(/gzip\s+on;/);
    expect(conf).toContain('application/javascript');
  });

  it('caches hashed /assets/ immutably', () => {
    expect(conf).toMatch(/location\s+\/assets\//);
    expect(conf).toContain('immutable');
  });

  it('keeps index.html revalidating so deploys are picked up', () => {
    expect(conf).toMatch(/location\s*=\s*\/index\.html/);
    expect(conf).toMatch(/no-cache/);
  });
});
