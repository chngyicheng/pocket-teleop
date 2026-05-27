import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl } from '../src/settings.js';

describe('video URL persistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadVideoUrl returns null when localStorage is empty', () => {
    expect(loadVideoUrl()).toBeNull();
  });

  it('loadVideoUrl returns saved value after saveVideoUrl', () => {
    saveVideoUrl('http://robot.local:8081/stream');
    expect(loadVideoUrl()).toBe('http://robot.local:8081/stream');
  });

  it('clearVideoUrl removes the saved value', () => {
    saveVideoUrl('http://robot.local:8081/stream');
    clearVideoUrl();
    expect(loadVideoUrl()).toBeNull();
  });

  it('loadVideoUrl returns null and does not throw when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(loadVideoUrl()).toBeNull();
  });

  it('saveVideoUrl silently ignores localStorage.setItem exceptions', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => {},
    });
    expect(() => saveVideoUrl('http://example.com')).not.toThrow();
  });

  it('clearVideoUrl silently ignores localStorage.removeItem exceptions', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(() => clearVideoUrl()).not.toThrow();
  });
});

describe('SettingsRouter', () => {
  it('navigate updates activePage', () => {
    const router = new SettingsRouter();
    router.navigate('video');
    expect(router.activePage).toBe('video');
  });

  it('navigate fires onNavigate callback', () => {
    const router = new SettingsRouter();
    const pages: string[] = [];
    router.onNavigate = (page) => pages.push(page);
    router.navigate('video');
    router.navigate('gamepad');
    expect(pages).toEqual(['video', 'gamepad']);
  });
});
