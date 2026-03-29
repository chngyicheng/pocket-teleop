import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl,
         loadRobotNamespace, saveRobotNamespace, clearRobotNamespace } from '../src/settings.js';

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
});

describe('robot namespace persistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem:    (key: string) => store[key] ?? null,
      setItem:    (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadRobotNamespace returns null when localStorage is empty', () => {
    expect(loadRobotNamespace()).toBeNull();
  });

  it('loadRobotNamespace returns saved value after saveRobotNamespace', () => {
    saveRobotNamespace('robot1');
    expect(loadRobotNamespace()).toBe('robot1');
  });

  it('clearRobotNamespace removes the saved value', () => {
    saveRobotNamespace('robot1');
    clearRobotNamespace();
    expect(loadRobotNamespace()).toBeNull();
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
