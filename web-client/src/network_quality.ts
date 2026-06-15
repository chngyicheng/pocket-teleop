/**
 * network_quality.ts
 *
 * Pure module: computes a single quality score (0–4 integer) from network stats.
 * Component-wise scoring (RTT, jitter, loss) with min aggregation.
 * Non-finite / negative values are treated as worst-case (score 0 for that dimension).
 */

export interface NetworkStats {
  rtt: number;      // milliseconds
  jitter: number;   // milliseconds
  lossRate: number; // [0, 1] fraction
}

/**
 * Compute a single quality score from network stats.
 *
 * Score range: 0 (worst) to 4 (excellent).
 * Result = min(rttScore, jitterScore, lossScore).
 *
 * Scoring:
 *   rttScore:    rtt<100→4, <200→3, <350→2, <600→1, else→0
 *   jitterScore: jitter<20→4, <50→3, <100→2, <200→1, else→0
 *   lossScore:   lossRate<0.01→4, <0.05→3, <0.10→2, <0.20→1, else→0
 *
 * Non-finite or negative values are treated as 0 (worst) for that component.
 */
export function computeQuality(stats: NetworkStats): number {
  // Compute individual component scores; treat non-finite/negative as 0.
  const rttScore = scoreRtt(stats.rtt);
  const jitterScore = scoreJitter(stats.jitter);
  const lossScore = scoreLoss(stats.lossRate);

  return Math.min(rttScore, jitterScore, lossScore);
}

function scoreRtt(rtt: number): number {
  if (!Number.isFinite(rtt) || rtt < 0) return 0;
  if (rtt < 100) return 4;
  if (rtt < 200) return 3;
  if (rtt < 350) return 2;
  if (rtt < 600) return 1;
  return 0;
}

function scoreJitter(jitter: number): number {
  if (!Number.isFinite(jitter) || jitter < 0) return 0;
  if (jitter < 20) return 4;
  if (jitter < 50) return 3;
  if (jitter < 100) return 2;
  if (jitter < 200) return 1;
  return 0;
}

function scoreLoss(lossRate: number): number {
  if (!Number.isFinite(lossRate) || lossRate < 0) return 0;
  if (lossRate < 0.01) return 4;
  if (lossRate < 0.05) return 3;
  if (lossRate < 0.10) return 2;
  if (lossRate < 0.20) return 1;
  return 0;
}
