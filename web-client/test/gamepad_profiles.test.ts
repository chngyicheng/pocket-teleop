import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { matchProfile, getAllProfiles, loadCustomProfiles, saveProfile, deleteProfile } from '../src/gamepad_profiles.js';

describe('matchProfile', () => {
  it('returns Xbox profile for Xbox id string', () => {
    const profile = matchProfile('Xbox 360 Controller (XInput STANDARD GAMEPAD)');
    expect(profile.name).toBe('Xbox');
  });

  it('returns DualShock profile for Sony vendor id string', () => {
    const profile = matchProfile('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)');
    expect(profile.name).toBe('DualShock / DualSense');
  });

  it('returns Generic for unknown id string', () => {
    const profile = matchProfile('Unknown Controller 1234:5678');
    expect(profile.name).toBe('Generic');
  });

  it('returns Generic when id is empty string', () => {
    const profile = matchProfile('');
    expect(profile.name).toBe('Generic');
  });

  it('returns GameSir profile for gamesir id string', () => {
    const profile = matchProfile('GameSir G8+ (STANDARD GAMEPAD)');
    expect(profile.name).toBe('GameSir G8+');
  });

  it('returns a copy — mutating name does not affect next call', () => {
    const p1 = matchProfile('');
    p1.name = 'mutated';
    const p2 = matchProfile('');
    expect(p2.name).toBe('Generic');
  });

  it('returns a deep copy — mutating mapping does not affect next call', () => {
    const p1 = matchProfile('');
    p1.mapping.lx.axis = 99;
    const p2 = matchProfile('');
    expect(p2.mapping.lx.axis).not.toBe(99);
  });
});

describe('getAllProfiles', () => {
  it('returns all four built-in profiles', () => {
    const profiles = getAllProfiles();
    const names = profiles.map((p) => p.name);
    expect(names).toContain('Xbox');
    expect(names).toContain('DualShock / DualSense');
    expect(names).toContain('GameSir G8+');
    expect(names).toContain('Generic');
  });

  it('returns at least 4 profiles (the built-ins)', () => {
    expect(getAllProfiles().length).toBeGreaterThanOrEqual(4);
  });
});

describe('loadCustomProfiles', () => {
  it('returns empty array when localStorage is absent', () => {
    const profiles = loadCustomProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles).toHaveLength(0);
  });

  it('returns empty array when localStorage contains corrupt JSON', () => {
    const store: Record<string, string> = { 'pocket-teleop.gamepad-profiles': '{{not json' };
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: () => {} });
    const profiles = loadCustomProfiles();
    expect(profiles).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe('saveProfile / deleteProfile / loadCustomProfiles round-trip', () => {
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

  it('saved profile is returned by loadCustomProfiles', () => {
    const mapping = { lx: { axis: 0, invert: false }, ly: { axis: 1, invert: true }, az: { axis: 3, invert: false } };
    saveProfile('MyController', mapping, { emergency_stop: 9 });
    const profiles = loadCustomProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.name).toBe('MyController');
    expect(profiles[0]!.mapping).toEqual(mapping);
    expect(profiles[0]!.buttons).toEqual({ emergency_stop: 9 });
  });

  it('saving a profile with the same name overwrites it', () => {
    const mapping = { lx: { axis: 0, invert: false }, ly: { axis: 1, invert: true }, az: { axis: 3, invert: false } };
    saveProfile('MyController', mapping, {});
    const updatedMapping = { lx: { axis: 2, invert: true }, ly: { axis: 1, invert: false }, az: { axis: 0, invert: true } };
    saveProfile('MyController', updatedMapping, { horn: 5 });
    const profiles = loadCustomProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.mapping).toEqual(updatedMapping);
    expect(profiles[0]!.buttons).toEqual({ horn: 5 });
  });

  it('deleteProfile removes the named profile', () => {
    const mapping = { lx: { axis: 0, invert: false }, ly: { axis: 1, invert: false }, az: { axis: 2, invert: false } };
    saveProfile('ToDelete', mapping, {});
    saveProfile('ToKeep', mapping, {});
    deleteProfile('ToDelete');
    const profiles = loadCustomProfiles();
    expect(profiles.map((p) => p.name)).not.toContain('ToDelete');
    expect(profiles.map((p) => p.name)).toContain('ToKeep');
  });

  it('deleteProfile on non-existent name is a no-op', () => {
    const mapping = { lx: { axis: 0, invert: false }, ly: { axis: 1, invert: false }, az: { axis: 2, invert: false } };
    saveProfile('Keep', mapping, {});
    deleteProfile('DoesNotExist');
    expect(loadCustomProfiles()).toHaveLength(1);
  });

  it('getAllProfiles includes saved custom profiles after built-ins', () => {
    const mapping = { lx: { axis: 0, invert: false }, ly: { axis: 1, invert: false }, az: { axis: 2, invert: false } };
    saveProfile('Custom1', mapping, {});
    const names = getAllProfiles().map((p) => p.name);
    expect(names).toContain('Xbox');
    expect(names).toContain('Custom1');
    // Built-ins come before custom profiles
    const xboxIdx = names.indexOf('Xbox');
    const customIdx = names.indexOf('Custom1');
    expect(xboxIdx).toBeLessThan(customIdx);
  });
});
