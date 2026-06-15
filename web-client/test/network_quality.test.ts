/**
 * network_quality.test.ts — TDD trophy
 *
 * Test computeQuality scoring logic across all dimensions + boundaries.
 */

import { describe, it, expect } from 'vitest';
import { computeQuality, type NetworkStats } from '../src/network_quality.js';

describe('network_quality', () => {
  // === RTT (Round-Trip Time) scoring ===
  it('rtt<100ms scores 4', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(4);
  });

  it('rtt=100ms is boundary to score 3', () => {
    const stats: NetworkStats = { rtt: 100, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(3);
  });

  it('rtt=99ms scores 4 (just below boundary)', () => {
    const stats: NetworkStats = { rtt: 99, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(4);
  });

  it('rtt in [100,200) scores 3', () => {
    const stats: NetworkStats = { rtt: 150, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(3);
  });

  it('rtt=200ms is boundary to score 2', () => {
    const stats: NetworkStats = { rtt: 200, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(2);
  });

  it('rtt in [200,350) scores 2', () => {
    const stats: NetworkStats = { rtt: 250, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(2);
  });

  it('rtt=350ms is boundary to score 1', () => {
    const stats: NetworkStats = { rtt: 350, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(1);
  });

  it('rtt in [350,600) scores 1', () => {
    const stats: NetworkStats = { rtt: 450, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(1);
  });

  it('rtt=600ms is boundary to score 0', () => {
    const stats: NetworkStats = { rtt: 600, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('rtt>600ms scores 0', () => {
    const stats: NetworkStats = { rtt: 1000, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(0);
  });

  // === Jitter scoring ===
  it('jitter<20ms scores 4', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0 };
    expect(computeQuality(stats)).toBe(4);
  });

  it('jitter=20ms is boundary to score 3', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 20, lossRate: 0 };
    expect(computeQuality(stats)).toBe(3);
  });

  it('jitter in [20,50) scores 3', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 30, lossRate: 0 };
    expect(computeQuality(stats)).toBe(3);
  });

  it('jitter=50ms is boundary to score 2', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 50, lossRate: 0 };
    expect(computeQuality(stats)).toBe(2);
  });

  it('jitter in [50,100) scores 2', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 75, lossRate: 0 };
    expect(computeQuality(stats)).toBe(2);
  });

  it('jitter=100ms is boundary to score 1', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 100, lossRate: 0 };
    expect(computeQuality(stats)).toBe(1);
  });

  it('jitter in [100,200) scores 1', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 150, lossRate: 0 };
    expect(computeQuality(stats)).toBe(1);
  });

  it('jitter=200ms is boundary to score 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 200, lossRate: 0 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('jitter>200ms scores 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 300, lossRate: 0 };
    expect(computeQuality(stats)).toBe(0);
  });

  // === Loss rate scoring ===
  it('lossRate<0.01 (1%) scores 4', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.005 };
    expect(computeQuality(stats)).toBe(4);
  });

  it('lossRate=0.01 (1%) is boundary to score 3', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.01 };
    expect(computeQuality(stats)).toBe(3);
  });

  it('lossRate in [0.01,0.05) scores 3', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.03 };
    expect(computeQuality(stats)).toBe(3);
  });

  it('lossRate=0.05 (5%) is boundary to score 2', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.05 };
    expect(computeQuality(stats)).toBe(2);
  });

  it('lossRate in [0.05,0.10) scores 2', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.07 };
    expect(computeQuality(stats)).toBe(2);
  });

  it('lossRate=0.10 (10%) is boundary to score 1', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.10 };
    expect(computeQuality(stats)).toBe(1);
  });

  it('lossRate in [0.10,0.20) scores 1', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.15 };
    expect(computeQuality(stats)).toBe(1);
  });

  it('lossRate=0.20 (20%) is boundary to score 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.20 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('lossRate>0.20 scores 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: 0.50 };
    expect(computeQuality(stats)).toBe(0);
  });

  // === Min of three dimensions ===
  it('quality = min(rttScore, jitterScore, lossScore)', () => {
    // rtt→4, jitter→2, loss→3 → min=2
    const stats: NetworkStats = { rtt: 50, jitter: 75, lossRate: 0.03 };
    expect(computeQuality(stats)).toBe(2);
  });

  it('one bad dimension pulls quality down', () => {
    // rtt→3, jitter→4, loss→0 → min=0
    const stats: NetworkStats = { rtt: 150, jitter: 10, lossRate: 0.25 };
    expect(computeQuality(stats)).toBe(0);
  });

  // === Non-finite handling ===
  it('NaN rtt treated as 0', () => {
    const stats: NetworkStats = { rtt: NaN, jitter: 10, lossRate: 0.003 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('Infinity rtt treated as 0', () => {
    const stats: NetworkStats = { rtt: Infinity, jitter: 10, lossRate: 0.003 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('negative rtt treated as 0', () => {
    const stats: NetworkStats = { rtt: -50, jitter: 10, lossRate: 0.003 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('NaN jitter treated as 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: NaN, lossRate: 0.003 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('Infinity jitter treated as 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: Infinity, lossRate: 0.003 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('negative jitter treated as 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: -20, lossRate: 0.003 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('NaN lossRate treated as 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: NaN };
    expect(computeQuality(stats)).toBe(0);
  });

  it('Infinity lossRate treated as 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: Infinity };
    expect(computeQuality(stats)).toBe(0);
  });

  it('negative lossRate treated as 0', () => {
    const stats: NetworkStats = { rtt: 50, jitter: 10, lossRate: -0.05 };
    expect(computeQuality(stats)).toBe(0);
  });

  it('all three non-finite → quality = 0', () => {
    const stats: NetworkStats = { rtt: NaN, jitter: Infinity, lossRate: NaN };
    expect(computeQuality(stats)).toBe(0);
  });
});
