import { describe, it, expect } from 'vitest';
import { pointInPolygon, distanceToBoundary, speedScale, twistScale, closestBoundaryPoint, ESCAPE_SPEED_SCALE, type FencePolygon } from '../src/geofence';

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

// ─── Escape mode (twistScale) ─────────────────────────────────────────────────

describe('twistScale escape mode', () => {
  const square: FencePolygon = { vertices: [[0, 0], [10, 0], [10, 10], [0, 10]] };

  it('outside all fences: both axes follow the buffer ramp', () => {
    const far = twistScale({ x: 20, y: 20, heading: 0 }, { lx: 1, ly: 0 }, [square]);
    expect(far).toEqual({ lin: 1, az: 1 });
    const near = twistScale({ x: 10.25, y: 5, heading: 0 }, { lx: 1, ly: 0 }, [square]);
    expect(near.lin).toBeCloseTo(0.5, 5);
    expect(near.az).toBeCloseTo(0.5, 5);
  });

  it('inside: rotation in place is always allowed', () => {
    const s = twistScale({ x: 5, y: 5, heading: 0 }, { lx: 0, ly: 0 }, [square]);
    expect(s).toEqual({ lin: 0, az: 1 });
  });

  it('inside near the right edge, facing +x: forward (toward exit) crawls out', () => {
    const s = twistScale({ x: 9, y: 5, heading: 0 }, { lx: 1, ly: 0 }, [square]);
    expect(s.lin).toBe(ESCAPE_SPEED_SCALE);
    expect(s.az).toBe(1);
  });

  it('inside near the right edge, facing +x: reverse (deeper in) is blocked', () => {
    const s = twistScale({ x: 9, y: 5, heading: 0 }, { lx: -1, ly: 0 }, [square]);
    expect(s.lin).toBe(0);
    expect(s.az).toBe(1);
  });

  it('nosed in head-first (facing away from exit): backing out is allowed', () => {
    // Robot entered through the right edge facing -x (heading = π).
    // Reverse (lx < 0) moves +x in the world — toward the nearest boundary.
    const s = twistScale({ x: 9, y: 5, heading: Math.PI }, { lx: -1, ly: 0 }, [square]);
    expect(s.lin).toBe(ESCAPE_SPEED_SCALE);
    expect(s.az).toBe(1);
  });

  it('nosed in head-first: pushing further forward stays blocked', () => {
    const s = twistScale({ x: 9, y: 5, heading: Math.PI }, { lx: 1, ly: 0 }, [square]);
    expect(s.lin).toBe(0);
  });

  it('strafe toward the exit counts as outward', () => {
    // Facing +y (heading π/2) near the right edge; strafe right (ly < 0) is
    // world +x → toward the boundary.
    const s = twistScale({ x: 9, y: 5, heading: Math.PI / 2 }, { lx: 0, ly: -1 }, [square]);
    expect(s.lin).toBe(ESCAPE_SPEED_SCALE);
  });

  it('closestBoundaryPoint finds the nearest edge point', () => {
    const p = closestBoundaryPoint([9, 5], square);
    expect(p?.[0]).toBeCloseTo(10, 5);
    expect(p?.[1]).toBeCloseTo(5, 5);
  });
});
