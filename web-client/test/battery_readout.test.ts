/**
 * battery_readout.test.ts — batteryReadoutModel unit tests
 *
 * Tests the pure function that computes battery readout display value + color tier
 * based on percentage, voltage, current, charging state, and time estimate.
 */

import { describe, it, expect } from 'vitest';
import { batteryReadoutModel, type BatteryTier } from '../src/battery_readout.js';
import type { BatteryData } from '../src/hooks/useTeleopBridge.js';

describe('batteryReadoutModel', () => {
  // -------------------------------------------------------------------------
  // Null battery tests
  // -------------------------------------------------------------------------
  it('returns em-dash and none tier when battery is null', () => {
    const result = batteryReadoutModel(null, null);
    expect(result.value).toBe('—');
    expect(result.tier).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Null percentage tests
  // -------------------------------------------------------------------------
  it('returns em-dash and none tier when percentage is null', () => {
    const battery: BatteryData = {
      percentage: null,
      voltage: 12.0,
      current: -1.5,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('—');
    expect(result.tier).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Non-finite percentage tests
  // -------------------------------------------------------------------------
  it('returns em-dash and none tier when percentage is NaN', () => {
    const battery: BatteryData = {
      percentage: NaN,
      voltage: 12.0,
      current: -1.5,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('—');
    expect(result.tier).toBe('none');
  });

  it('returns em-dash and none tier when percentage is Infinity', () => {
    const battery: BatteryData = {
      percentage: Infinity,
      voltage: 12.0,
      current: -1.5,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('—');
    expect(result.tier).toBe('none');
  });

  it('returns em-dash and none tier when percentage is -Infinity', () => {
    const battery: BatteryData = {
      percentage: -Infinity,
      voltage: 12.0,
      current: -1.5,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('—');
    expect(result.tier).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Charging tests (tier ok always, ⚡ prefix, rounded percentage)
  // -------------------------------------------------------------------------
  it('returns ⚡ prefix and ok tier when charging at 50%', () => {
    const battery: BatteryData = {
      percentage: 50,
      voltage: 12.5,
      current: 2.0,
      charging: true,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('⚡50%');
    expect(result.tier).toBe('ok');
  });

  it('returns ⚡ prefix and ok tier when charging at 95%', () => {
    const battery: BatteryData = {
      percentage: 95.4,
      voltage: 12.5,
      current: 1.5,
      charging: true,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('⚡95%');
    expect(result.tier).toBe('ok');
  });

  it('rounds percentage correctly when charging (0.5 rounds to 1)', () => {
    const battery: BatteryData = {
      percentage: 0.5,
      voltage: 12.0,
      current: 1.0,
      charging: true,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('⚡1%');
    expect(result.tier).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Discharging tier tests (no prefix, rounded percentage)
  // -------------------------------------------------------------------------
  it('returns ok tier when discharging at 85%', () => {
    const battery: BatteryData = {
      percentage: 85,
      voltage: 12.0,
      current: -1.2,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('85%');
    expect(result.tier).toBe('ok');
  });

  it('returns ok tier when discharging at 81% (boundary)', () => {
    const battery: BatteryData = {
      percentage: 81,
      voltage: 12.0,
      current: -1.2,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('81%');
    expect(result.tier).toBe('ok');
  });

  it('returns warn tier when discharging at 80%', () => {
    const battery: BatteryData = {
      percentage: 80,
      voltage: 11.9,
      current: -1.5,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('80%');
    expect(result.tier).toBe('warn');
  });

  it('returns warn tier when discharging at 50%', () => {
    const battery: BatteryData = {
      percentage: 50,
      voltage: 11.5,
      current: -1.8,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('50%');
    expect(result.tier).toBe('warn');
  });

  it('returns warn tier when discharging at 20% (boundary)', () => {
    const battery: BatteryData = {
      percentage: 20,
      voltage: 10.8,
      current: -2.0,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('20%');
    expect(result.tier).toBe('warn');
  });

  it('returns danger tier when discharging at 19%', () => {
    const battery: BatteryData = {
      percentage: 19,
      voltage: 10.7,
      current: -2.1,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('19%');
    expect(result.tier).toBe('danger');
  });

  it('returns danger tier when discharging at 10%', () => {
    const battery: BatteryData = {
      percentage: 10,
      voltage: 10.5,
      current: -2.2,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('10%');
    expect(result.tier).toBe('danger');
  });

  it('returns danger tier when discharging at 0%', () => {
    const battery: BatteryData = {
      percentage: 0,
      voltage: 10.0,
      current: -2.5,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('0%');
    expect(result.tier).toBe('danger');
  });

  // -------------------------------------------------------------------------
  // Rounding tests
  // -------------------------------------------------------------------------
  it('rounds 85.4% down to 85%', () => {
    const battery: BatteryData = {
      percentage: 85.4,
      voltage: 12.0,
      current: -1.2,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('85%');
  });

  it('rounds 85.5% up to 86%', () => {
    const battery: BatteryData = {
      percentage: 85.5,
      voltage: 12.0,
      current: -1.2,
      charging: false,
    };
    const result = batteryReadoutModel(battery, null);
    expect(result.value).toBe('86%');
  });

  // -------------------------------------------------------------------------
  // estimateMinutes parameter is accepted but not reflected in value (reserved for future use)
  // -------------------------------------------------------------------------
  it('accepts estimateMinutes parameter without affecting value', () => {
    const battery: BatteryData = {
      percentage: 50,
      voltage: 11.5,
      current: -1.8,
      charging: false,
    };
    const result1 = batteryReadoutModel(battery, null);
    const result2 = batteryReadoutModel(battery, 30);
    expect(result1.value).toBe(result2.value);
    expect(result1.tier).toBe(result2.tier);
  });
});
