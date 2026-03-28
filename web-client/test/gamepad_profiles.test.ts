import { describe, it, expect } from 'vitest';
import { matchProfile, loadCustomProfiles } from '../src/gamepad_profiles.js';

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

  it('returns a copy — mutating result does not affect next call', () => {
    const p1 = matchProfile('');
    p1.name = 'mutated';
    const p2 = matchProfile('');
    expect(p2.name).toBe('Generic');
  });
});

describe('loadCustomProfiles', () => {
  it('returns empty array when localStorage is absent', () => {
    const profiles = loadCustomProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles).toHaveLength(0);
  });
});
