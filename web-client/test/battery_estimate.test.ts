import { describe, it, expect } from 'vitest';
import {
  estimateRemainingMinutes,
  pruneSamples,
  type BatterySample,
} from '../src/battery_estimate.js';

describe('estimateRemainingMinutes', () => {
  it('charging=true returns minutes=null, charging=true', () => {
    const samples: BatterySample[] = [
      { t: 1000, pct: 80 },
      { t: 2000, pct: 81 },
    ];
    const result = estimateRemainingMinutes(samples, true);
    expect(result).toEqual({ minutes: null, charging: true });
  });

  it('discharging from 100 to 80 over 1200s (20min) → ~60min remaining at 100pct', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 1200000, pct: 100 },
      { t: now, pct: 80 },
    ];
    const result = estimateRemainingMinutes(samples, false);
    expect(result.charging).toBe(false);
    // Slope: (80-100) / (now - (now-1200000)) = -20 / 1200000 pct/ms
    // = -20 / 1200 pct/min = -0.0167 pct/min
    // At 80 pct, remaining = 80 / 0.0167 ≈ 4800 min (at 100pct) ... wait
    // Slope: -20 pct per 1200000 ms = -20 pct per 1200 s = -1 pct per 60s
    // So rate = 1 pct per minute. At 80 pct, minutes = 80 / 1 = 80 min
    expect(result.minutes).toBeCloseTo(80, 0);
  });

  it('insufficient samples (< 2) → minutes=null, charging=false', () => {
    const samples: BatterySample[] = [{ t: 1000, pct: 85 }];
    const result = estimateRemainingMinutes(samples, false);
    expect(result).toEqual({ minutes: null, charging: false });
  });

  it('zero samples → minutes=null, charging=false', () => {
    const samples: BatterySample[] = [];
    const result = estimateRemainingMinutes(samples, false);
    expect(result).toEqual({ minutes: null, charging: false });
  });

  it('short timespan (< 5000ms) → minutes=null, charging=false', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 1000, pct: 100 },
      { t: now, pct: 99.5 },
    ];
    const result = estimateRemainingMinutes(samples, false);
    expect(result).toEqual({ minutes: null, charging: false });
  });

  it('rate <= 0 (not discharging) → minutes=null, charging=false', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 10000, pct: 80 },
      { t: now, pct: 81 },
    ];
    const result = estimateRemainingMinutes(samples, false);
    expect(result).toEqual({ minutes: null, charging: false });
  });

  it('discharging fast: 10 pct per minute → 10 min remaining at 100 pct', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 60000, pct: 100 },
      { t: now, pct: 90 },
    ];
    const result = estimateRemainingMinutes(samples, false);
    expect(result.charging).toBe(false);
    // rate = 10 pct / 60000 ms = 10 / 60 pct/sec = 10 pct/min
    // minutes = 90 / 10 = 9 min
    expect(result.minutes).toBeCloseTo(9, 0);
  });

  it('current percentage is from last sample', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 60000, pct: 100 },
      { t: now - 30000, pct: 95 },
      { t: now, pct: 85 },
    ];
    const result = estimateRemainingMinutes(samples, false);
    expect(result.charging).toBe(false);
    // rate = (85 - 100) / 60000 = -15 / 60000 pct/ms = 15 pct/min
    // minutes = 85 / 15 ≈ 5.67 min, rounds to 6
    expect(result.minutes).toBeCloseTo(6, 0);
  });
});

describe('pruneSamples', () => {
  it('keeps samples within window, removes those outside', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 120000, pct: 100 },
      { t: now - 90000, pct: 95 },
      { t: now - 30000, pct: 85 },
      { t: now, pct: 80 },
    ];
    const pruned = pruneSamples(samples, now, 60000);
    expect(pruned).toHaveLength(2);
    expect(pruned[0].t).toBe(now - 30000);
    expect(pruned[1].t).toBe(now);
  });

  it('default window 60000ms', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 90000, pct: 100 },
      { t: now - 30000, pct: 85 },
    ];
    const pruned = pruneSamples(samples, now);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].t).toBe(now - 30000);
  });

  it('empty samples → empty result', () => {
    const pruned = pruneSamples([], Date.now(), 60000);
    expect(pruned).toEqual([]);
  });

  it('all samples outside window → empty result', () => {
    const now = Date.now();
    const samples: BatterySample[] = [
      { t: now - 200000, pct: 100 },
      { t: now - 150000, pct: 90 },
    ];
    const pruned = pruneSamples(samples, now, 60000);
    expect(pruned).toEqual([]);
  });
});
