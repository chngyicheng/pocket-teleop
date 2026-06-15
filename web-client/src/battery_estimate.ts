export interface BatterySample {
  t: number; // milliseconds since epoch
  pct: number; // percentage 0..100
}

/**
 * Estimate remaining runtime minutes based on discharge rate.
 *
 * @param samples — chronological array of battery samples (t, pct)
 * @param charging — true if currently charging
 * @returns { minutes: number | null; charging: boolean }
 *   - charging=true → { minutes: null, charging: true }
 *   - < 2 samples or < 5s timespan → { minutes: null, charging: false }
 *   - rate <= 0 (not discharging) → { minutes: null, charging: false }
 *   - otherwise → { minutes: rounded from current_pct / discharge_rate_pct_per_min, charging: false }
 */
export function estimateRemainingMinutes(samples: BatterySample[], charging: boolean): { minutes: number | null; charging: boolean } {
  if (charging) {
    return { minutes: null, charging: true };
  }

  if (samples.length < 2) {
    return { minutes: null, charging: false };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const timeSpanMs = last.t - first.t;

  // Require at least 5 seconds of data
  if (timeSpanMs < 5000) {
    return { minutes: null, charging: false };
  }

  // Discharge rate: pct per millisecond (negative when discharging)
  const ratePerMs = (last.pct - first.pct) / timeSpanMs;

  // Rate must be negative (discharging) for a valid estimate
  if (ratePerMs >= 0) {
    return { minutes: null, charging: false };
  }

  // Convert to absolute discharge rate pct per minute: |ratePerMs| * 60000 ms/min
  const dischargeRatePerMin = -ratePerMs * 60000;

  // Remaining minutes = current percentage / discharge rate
  const minutes = last.pct / dischargeRatePerMin;

  return { minutes: Math.round(minutes), charging: false };
}

/**
 * Remove samples outside the time window.
 *
 * @param samples — chronological array of battery samples
 * @param nowMs — current time in milliseconds
 * @param windowMs — lookback window in milliseconds (default: 60000 = 60s)
 * @returns new array with only samples where t >= now - window
 */
export function pruneSamples(samples: BatterySample[], nowMs: number, windowMs: number = 60000): BatterySample[] {
  const cutoffTime = nowMs - windowMs;
  return samples.filter((s) => s.t >= cutoffTime);
}
