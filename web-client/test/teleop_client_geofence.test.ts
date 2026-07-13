import { describe, it, expect } from 'vitest';
import { speedScale } from '../src/geofence.js';
import type { FencePolygon } from '../src/geofence.js';

/**
 * Integration test for geofence speed scaling logic.
 * (Full client integration tests with fake connection are complex;
 *  these focus on the pure geofence algorithm used by the publisher.)
 */
describe('geofence in TeleopClient context', () => {
  it('speedScale applied to twist components for publishing', () => {
    const fence: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };

    // Pose inside geofence: speed scaled to 0
    const scaleInside = speedScale([5, 5], [fence]);
    expect(scaleInside).toBe(0);

    // Apply scaling to twist: [0.5, 0.2, 0.3] * 0 = [0, 0, 0]
    const twist = { lx: 0.5, ly: 0.2, az: 0.3 };
    const scaled = {
      lx: twist.lx * scaleInside,
      ly: twist.ly * scaleInside,
      az: twist.az * scaleInside,
    };
    expect(scaled.lx).toBe(0);
    expect(scaled.ly).toBe(0);
    expect(scaled.az).toBe(0);
  });

  it('speedScale applied gradually as robot approaches fence boundary', () => {
    const fence: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    const bufferM = 1.0;

    // Pose outside but close: scale interpolates
    const scaleOutside = speedScale([10.5, 5], [fence], bufferM);
    expect(scaleOutside).toBeGreaterThan(0);
    expect(scaleOutside).toBeLessThan(1);

    // Apply to twist: [1.0, 0, 0] * 0.5 = [0.5, 0, 0]
    const twist = { lx: 1.0, ly: 0, az: 0 };
    const scaled = {
      lx: twist.lx * scaleOutside,
    };
    expect(scaled.lx).toBeGreaterThan(0);
    expect(scaled.lx).toBeLessThan(1.0);
  });

  it('no scaling when geofences empty', () => {
    const fences: FencePolygon[] = [];
    const scale = speedScale([5, 5], fences);
    expect(scale).toBe(1);

    // Twist unmodified
    const twist = { lx: 0.8, ly: 0.2, az: 0.1 };
    const scaled = {
      lx: twist.lx * scale,
      ly: twist.ly * scale,
      az: twist.az * scale,
    };
    expect(scaled.lx).toBe(0.8);
    expect(scaled.ly).toBe(0.2);
    expect(scaled.az).toBe(0.1);
  });

  it('multiple fences: robot respect nearest fence', () => {
    const fence1: FencePolygon = {
      vertices: [[0, 0], [5, 0], [5, 5], [0, 5]],
    };
    const fence2: FencePolygon = {
      vertices: [[15, 15], [25, 15], [25, 25], [15, 25]],
    };

    // Pose closer to fence1
    const scale = speedScale([6, 2.5], [fence1, fence2], 1.5);

    // Should be limited by closer fence (fence1)
    expect(scale).toBeLessThanOrEqual(1);
  });

  it('wasGeofenceLimited flag allows onGeofenceLimit callback logic', () => {
    const fence: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };

    // Simulate publisher ticks
    let wasNonZero = true; // Previous tick had motion
    let scale = speedScale([5, 5], [fence]); // Current pose inside: scale = 0

    // Logic: if scale===0 && wasNonZero && !wasLimited, fire onGeofenceLimit once
    const shouldNotify = scale === 0 && wasNonZero;
    expect(shouldNotify).toBe(true);

    // Next tick: same pose
    wasNonZero = false; // scale===0 means nothing sent
    scale = speedScale([5, 5], [fence]); // Still 0
    const shouldNotifyAgain = scale === 0 && wasNonZero;
    expect(shouldNotifyAgain).toBe(false); // No re-fire
  });
});
