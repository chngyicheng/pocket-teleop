/**
 * geofence.ts — Pure module for geofence functionality (framework-free).
 * Polygons (map coordinates), point-in-polygon detection, boundary distance,
 * and speed scaling based on proximity to geofences.
 */

export interface FencePolygon {
  vertices: [number, number][];
}

/**
 * Check if a point is inside a polygon using the ray-casting algorithm.
 * Works for both convex and concave polygons.
 *
 * @param point [x, y] point to test
 * @param polygon FencePolygon with ≥3 vertices
 * @returns true if point is inside, false otherwise (or if polygon has <3 vertices)
 */
export function pointInPolygon(point: [number, number], polygon: FencePolygon): boolean {
  if (polygon.vertices.length < 3) return false;

  const [x, y] = point;
  const vertices = polygon.vertices;
  let inside = false;

  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];

    // Ray-casting: count crossings of a horizontal ray to the right
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculate the minimum distance from a point to the boundary of a polygon.
 * Returns the closest distance to any edge.
 *
 * @param point [x, y] point to test
 * @param polygon FencePolygon with ≥3 vertices
 * @returns minimum distance to boundary; Infinity if polygon has <3 vertices
 */
export function distanceToBoundary(point: [number, number], polygon: FencePolygon): number {
  if (polygon.vertices.length < 3) return Infinity;

  const [x, y] = point;
  const vertices = polygon.vertices;
  let minDist = Infinity;

  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];

    // Distance from point to line segment
    const dist = distanceToSegment(x, y, x1, y1, x2, y2);
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

/**
 * Calculate the minimum distance from a point to a line segment.
 *
 * @param px, py point
 * @param x1, y1 segment start
 * @param x2, y2 segment end
 * @returns minimum distance
 */
function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    // Segment is a point
    return Math.hypot(px - x1, py - y1);
  }

  // Project point onto segment, clamped to [0, 1]
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return Math.hypot(px - closestX, py - closestY);
}

/**
 * Find the closest point on a polygon's boundary to the given point.
 * Used by escape mode: from inside a fence, the closest boundary point is
 * the shortest way out.
 */
export function closestBoundaryPoint(
  point: [number, number],
  polygon: FencePolygon
): [number, number] | null {
  if (polygon.vertices.length < 3) return null;

  const [px, py] = point;
  let best: [number, number] | null = null;
  let bestDist = Infinity;

  const vertices = polygon.vertices;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) {
      bestDist = d;
      best = [cx, cy];
    }
  }
  return best;
}

/** Crawl factor for escape motion while inside a fence. */
export const ESCAPE_SPEED_SCALE = 0.3;

/**
 * Per-axis twist scaling with escape mode.
 *
 * Outside all fences: both scales follow the buffer ramp (same as speedScale).
 * Inside a fence:
 *  - rotation is always allowed (az scale 1) so the robot can turn toward the exit;
 *  - linear motion is allowed at ESCAPE_SPEED_SCALE only when the commanded
 *    body-frame direction (lx fwd, ly left), rotated into the world by
 *    `heading`, points toward the nearest boundary point (dot > 0) — i.e. out;
 *    motion deeper into the fence stays blocked (0).
 *
 * @param pose robot pose in map frame (heading in radians, ROS yaw)
 * @param lin  commanded linear body-frame components (pre-scale)
 */
export function twistScale(
  pose: { x: number; y: number; heading: number },
  lin: { lx: number; ly: number },
  fences: FencePolygon[],
  bufferM: number = 0.5
): { lin: number; az: number } {
  const p: [number, number] = [pose.x, pose.y];

  // Inside any fence → escape mode
  for (const fence of fences) {
    if (fence.vertices.length < 3) continue;
    if (!pointInPolygon(p, fence)) continue;

    const hasLinear = lin.lx !== 0 || lin.ly !== 0;
    if (!hasLinear) return { lin: 0, az: 1 }; // rotate in place freely

    const exit = closestBoundaryPoint(p, fence);
    if (!exit) return { lin: 0, az: 1 };

    // Body-frame (lx fwd, ly left) → world direction (ROS yaw convention)
    const wx = lin.lx * Math.cos(pose.heading) - lin.ly * Math.sin(pose.heading);
    const wy = lin.lx * Math.sin(pose.heading) + lin.ly * Math.cos(pose.heading);
    const toExit: [number, number] = [exit[0] - p[0], exit[1] - p[1]];
    const outward = wx * toExit[0] + wy * toExit[1] > 0;

    return { lin: outward ? ESCAPE_SPEED_SCALE : 0, az: 1 };
  }

  // Outside: original buffer ramp on every axis
  const s = speedScale(p, fences, bufferM);
  return { lin: s, az: s };
}

/**
 * Calculate speed scale factor based on proximity to geofences.
 * - Inside any fence: 0
 * - Outside all fences: 1
 * - Within buffer distance of a fence: linear interpolation [0, 1]
 * - Multiple fences: take minimum scale
 *
 * @param point [x, y] point to test
 * @param fences array of FencePolygon
 * @param bufferM buffer distance in meters (default 0.5)
 * @returns scale factor [0, 1]
 */
export function speedScale(
  point: [number, number],
  fences: FencePolygon[],
  bufferM: number = 0.5
): number {
  if (fences.length === 0) return 1;

  let minScale = 1;

  for (const fence of fences) {
    if (fence.vertices.length < 3) continue;

    // Check if inside fence
    if (pointInPolygon(point, fence)) {
      return 0; // Inside any fence → full stop
    }

    // Distance to this fence's boundary
    const dist = distanceToBoundary(point, fence);

    // Scale based on distance to buffer
    let scale = 1;
    if (dist < bufferM) {
      scale = dist / bufferM; // Linear ramp [0, 1) as distance increases
    }

    minScale = Math.min(minScale, scale);
  }

  return minScale;
}
