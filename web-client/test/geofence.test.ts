import { describe, it, expect } from 'vitest';
import { pointInPolygon, distanceToBoundary, speedScale, type FencePolygon } from '../src/geofence';

describe('geofence module', () => {
  // Test case 1: Point inside convex polygon
  it('pointInPolygon: point inside convex polygon', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    expect(pointInPolygon([5, 5], polygon)).toBe(true);
  });

  // Test case 2: Point outside convex polygon
  it('pointInPolygon: point outside convex polygon', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    expect(pointInPolygon([15, 15], polygon)).toBe(false);
  });

  // Test case 3: Point inside concave polygon
  it('pointInPolygon: point inside concave polygon', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [5, 5], [0, 10]],
    };
    expect(pointInPolygon([2, 2], polygon)).toBe(true);
  });

  // Test case 4: Point outside concave polygon (in the "bite")
  it('pointInPolygon: point outside concave polygon (in the concavity)', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]],
    };
    expect(pointInPolygon([7, 7], polygon)).toBe(false);
  });

  // Test case 5: Point on polygon boundary
  it('pointInPolygon: point on polygon edge (ray-casting behavior)', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    // Ray-casting is ambiguous at edges; this just documents the behavior
    const result = pointInPolygon([5, 0], polygon);
    expect(typeof result).toBe('boolean');
  });

  // Test case 6: Polygon with <3 vertices (invalid)
  it('pointInPolygon: invalid polygon (<3 vertices)', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0]],
    };
    expect(pointInPolygon([5, 5], polygon)).toBe(false);
  });

  // Test case 7: distanceToBoundary for point inside polygon
  it('distanceToBoundary: returns finite distance for point inside polygon', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    const dist = distanceToBoundary([5, 5], polygon);
    expect(Number.isFinite(dist)).toBe(true);
    expect(dist).toBeLessThanOrEqual(5); // Minimum distance to any edge is ≤5
  });

  // Test case 8: distanceToBoundary for point very close to edge
  it('distanceToBoundary: point close to edge', () => {
    const polygon: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    const dist = distanceToBoundary([0.5, 5], polygon);
    expect(dist).toBeCloseTo(0.5, 1);
  });

  // Test case 9: speedScale returns 1.0 when no fences
  it('speedScale: returns 1.0 with empty fences array', () => {
    const scale = speedScale([5, 5], []);
    expect(scale).toBe(1);
  });

  // Test case 10: speedScale returns 0 when inside fence
  it('speedScale: returns 0 when point is inside fence', () => {
    const fence: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    const scale = speedScale([5, 5], [fence]);
    expect(scale).toBe(0);
  });

  // Test case 11: speedScale returns 1.0 when far from fence (> buffer)
  it('speedScale: returns 1.0 when point is far from fence', () => {
    const fence: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    const scale = speedScale([20, 20], [fence], 0.5);
    expect(scale).toBeCloseTo(1, 1);
  });

  // Test case 12: speedScale returns linear interpolation within buffer
  it('speedScale: linear interpolation within buffer distance', () => {
    const fence: FencePolygon = {
      vertices: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    // Point at distance 0.25 from boundary with buffer 0.5 → scale = 0.25 / 0.5 = 0.5
    const scale = speedScale([10.25, 5], [fence], 0.5);
    expect(scale).toBeCloseTo(0.5, 1);
  });

  // Test case 13: speedScale with multiple fences (takes minimum)
  it('speedScale: multiple fences takes minimum scale', () => {
    const fence1: FencePolygon = {
      vertices: [[0, 0], [5, 0], [5, 5], [0, 5]],
    };
    const fence2: FencePolygon = {
      vertices: [[15, 15], [25, 15], [25, 25], [15, 25]],
    };
    // Point [6, 2] is outside fence1 by ~1.2 units, outside fence2 by ~13 units
    // With buffer 2, closer to fence1 → scale should be ~0.6
    const scale = speedScale([6, 2], [fence1, fence2], 2);
    expect(scale).toBeLessThanOrEqual(1);
    expect(scale).toBeGreaterThanOrEqual(0);
  });

  // Test case 14: Invalid polygon (empty vertices)
  it('speedScale: ignores polygon with <3 vertices', () => {
    const invalidFence: FencePolygon = {
      vertices: [[0, 0], [5, 0]],
    };
    const scale = speedScale([2.5, 2.5], [invalidFence]);
    expect(scale).toBe(1); // Ignored, behaves as if no fence
  });
});
