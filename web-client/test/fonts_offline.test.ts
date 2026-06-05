import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

describe('fonts - offline support', () => {
  it('should not reference external fonts.googleapis.com in index.html', () => {
    const htmlPath = resolve('index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('should not reference external fonts.gstatic.com in index.html', () => {
    const htmlPath = resolve('index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('should define @font-face for Inter in index.css', () => {
    const cssPath = resolve('src/index.css');
    const css = readFileSync(cssPath, 'utf-8');
    expect(css).toContain('@font-face');
    expect(css).toContain("font-family: 'Inter'");
    expect(css).toContain("/fonts/inter-latin.woff2");
  });

  it('should define @font-face for JetBrains Mono in index.css', () => {
    const cssPath = resolve('src/index.css');
    const css = readFileSync(cssPath, 'utf-8');
    expect(css).toContain('@font-face');
    expect(css).toContain("font-family: 'JetBrains Mono'");
    expect(css).toContain("/fonts/jetbrains-mono-latin.woff2");
  });

  it('should have local font files available', () => {
    const interPath = resolve('public/fonts/inter-latin.woff2');
    const monoPath = resolve('public/fonts/jetbrains-mono-latin.woff2');

    const inter = readFileSync(interPath);
    const mono = readFileSync(monoPath);

    expect(inter.length).toBeGreaterThan(0);
    expect(mono.length).toBeGreaterThan(0);
  });
});
