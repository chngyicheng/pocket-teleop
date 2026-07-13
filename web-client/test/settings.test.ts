import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl, loadFences, saveFences } from '../src/settings.js';

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

describe('geofence persistence', () => {
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

  it('loadFences returns empty array when localStorage is empty', () => {
    expect(loadFences()).toEqual([]);
  });

  it('loadFences returns saved fences after saveFences', () => {
    const fences = [
      { vertices: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { vertices: [[20, 20], [30, 20], [30, 30], [20, 30]] },
    ];
    saveFences(fences);
    expect(loadFences()).toEqual(fences);
  });

  it('loadFences returns empty array on invalid JSON', () => {
    store['pocket-teleop.geofences'] = 'invalid json {';
    expect(loadFences()).toEqual([]);
  });

  it('loadFences filters out invalid fence entries', () => {
    const data = [
      { vertices: [[0, 0], [10, 0], [10, 10]] },
      { notVertices: 'bad' },
      { vertices: [[20, 20], [30, 20], [30, 30]] },
    ];
    store['pocket-teleop.geofences'] = JSON.stringify(data);
    const loaded = loadFences();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].vertices).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(loaded[1].vertices).toEqual([[20, 20], [30, 20], [30, 30]]);
  });

  it('saveFences silently ignores localStorage.setItem exceptions', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => {},
    });
    expect(() => saveFences([{ vertices: [[0, 0], [1, 0], [1, 1]] }])).not.toThrow();
  });

  it('loadFences silently ignores localStorage.getItem exceptions', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(loadFences()).toEqual([]);
  });

  it('round-trip: save and load fences preserves structure', () => {
    const original = [
      { vertices: [[5.5, 10.2], [15.7, 10.2], [15.7, 20.8], [5.5, 20.8]] },
    ];
    saveFences(original);
    const loaded = loadFences();
    expect(loaded).toEqual(original);
  });
});
