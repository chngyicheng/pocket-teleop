/**
 * battery_readout.ts — pure model logic for battery readout display
 *
 * Computes display value and color tier based on battery state.
 * No palette coupling — tier is consumed by the component layer.
 */

import type { BatteryData } from './hooks/useTeleopBridge.js';

export type BatteryTier = 'ok' | 'warn' | 'danger' | 'none';

export interface BatteryReadoutModel {
  value: string;
  tier: BatteryTier;
}

/**
 * Compute battery readout display value and color tier.
 *
 * - null battery or null/non-finite percentage → '—' / 'none'
 * - charging true → '⚡' + rounded_pct + '%' / 'ok'
 * - discharging:
 *   - pct > 80 → pct + '%' / 'ok'
 *   - pct >= 20 → pct + '%' / 'warn'
 *   - pct < 20 → pct + '%' / 'danger'
 */
export function batteryReadoutModel(battery: BatteryData | null): BatteryReadoutModel {
  // Null battery or null percentage → placeholder
  if (battery === null || battery.percentage === null) {
    return { value: '—', tier: 'none' };
  }

  const pct = battery.percentage;

  // Non-finite percentage (NaN, Infinity, -Infinity) → placeholder
  if (!Number.isFinite(pct)) {
    return { value: '—', tier: 'none' };
  }

  const roundedPct = Math.round(pct);

  // Charging: always ok tier, ⚡ prefix
  if (battery.charging) {
    return { value: `⚡${roundedPct}%`, tier: 'ok' };
  }

  // Discharging: tier depends on percentage
  let tier: BatteryTier;
  if (pct > 80) {
    tier = 'ok';
  } else if (pct >= 20) {
    tier = 'warn';
  } else {
    tier = 'danger';
  }

  return { value: `${roundedPct}%`, tier };
}
