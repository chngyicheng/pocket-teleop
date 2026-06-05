import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The boot splash is hand-written markup in index.html that paints on HTML
// parse (before the JS bundle executes) so the operator never sees a white
// screen during the multi-second bundle download+execute. React's createRoot
// replaces #app's children on first commit, removing it.
describe('boot splash (index.html)', () => {
  const html = readFileSync(resolve('index.html'), 'utf-8');

  it('renders a #boot-splash inside #app', () => {
    expect(html).toContain('id="app"');
    expect(html).toContain('id="boot-splash"');
    // splash markup must sit inside the #app container React will overwrite
    const appIdx = html.indexOf('id="app"');
    const splashIdx = html.indexOf('id="boot-splash"');
    expect(splashIdx).toBeGreaterThan(appIdx);
  });

  it('paints the Mission dark background via critical inline CSS (no white flash)', () => {
    expect(html).toContain('<style>');
    expect(html).toMatch(/background:\s*#0c0e12/);
  });
});
