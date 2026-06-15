/**
 * network_readout.ts — pure model logic for network quality readout display
 *
 * Computes display tier based on quality score.
 * No palette coupling — tier is consumed by the component layer.
 */

export type SignalTier = 'ok' | 'warn' | 'danger' | 'none';

export interface NetworkReadoutModel {
  quality: number | null;
  tier: SignalTier;
}

/**
 * Compute network readout color tier from quality score.
 *
 * - null quality → 'none'
 * - quality 0 → 'danger'
 * - quality 1 or 2 → 'warn'
 * - quality 3 or 4 → 'ok'
 *
 * Non-integer, non-finite, or out-of-range values are treated as null ('none').
 */
export function networkReadoutModel(quality: number | null): NetworkReadoutModel {
  // Null quality → none tier
  if (quality === null) {
    return { quality: null, tier: 'none' };
  }

  // Non-finite or non-integer quality → treat as none
  if (!Number.isFinite(quality) || !Number.isInteger(quality)) {
    return { quality: null, tier: 'none' };
  }

  // Compute tier from quality score; out-of-range → none
  let tier: SignalTier;
  if (quality === 0) {
    tier = 'danger';
  } else if (quality === 1 || quality === 2) {
    tier = 'warn';
  } else if (quality === 3 || quality === 4) {
    tier = 'ok';
  } else {
    // Out-of-range integers (< 0 or > 4)
    return { quality: null, tier: 'none' };
  }

  return { quality, tier };
}
