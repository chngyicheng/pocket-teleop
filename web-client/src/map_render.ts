/**
 * map_render.ts — Pure functions to render SLAM map + lidar scan on canvas.
 * No React, no state—functions only. Canvas context setup in shared.tsx MiniMap.
 */

export interface Pose {
  x: number;
  y: number;
  heading: number;
}

export interface MapMeta {
  originX: number;
  originY: number;
  resolution: number;
}

export interface Scan {
  angleMin: number;
  angleIncrement: number;
  rangeMax: number;
  ranges: number[];
}

export interface ScreenTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Compute the 2D affine transform from map pixel to screen coordinates.
 *
 * Conventions:
 * - ROS map frame: x east, y north, θ counter-clockwise
 * - Screen: robot at (cx, cy) = (size/2, size/2), front (robot x-axis) always upward
 *
 * Derivation:
 * - Map image pixel (px, py) → world (originX + px·resolution, originY + py·resolution)
 * - Robot pose (x, y, θ) defines a local frame where robot front is north on screen
 * - Transform: rotate by θ, scale by s·r (px per m), translate to center
 *
 * Returns [a,b,c,d,e,f] for canvas.setTransform(a,b,c,d,e,f), which applies:
 * x' = a·px + c·py + e
 * y' = b·px + d·py + f
 */
export function mapToScreenTransform(
  pose: Pose,
  meta: MapMeta,
  size: number,
  metersAcross: number
): ScreenTransform {
  const s = size / metersAcross; // pixels per meter
  const r = meta.resolution; // map resolution (meters per cell)
  const sr = s * r;

  const θ = pose.heading;
  const sinθ = Math.sin(θ);
  const cosθ = Math.cos(θ);

  const cx = size / 2;
  const cy = size / 2;

  const dx0 = meta.originX - pose.x;
  const dy0 = meta.originY - pose.y;

  return {
    a: sr * sinθ,
    b: -sr * cosθ,
    c: -sr * cosθ,
    d: -sr * sinθ,
    e: cx - s * (-sinθ * dx0 + cosθ * dy0),
    f: cy - s * (cosθ * dx0 + sinθ * dy0),
  };
}

/**
 * Convert a world point to screen coordinates using current robot pose.
 * Screen convention: robot at (cx, cy) = (size/2, size/2), front (robot x-axis) upward.
 *
 * @param world { x, y } world coordinates (map/odom frame)
 * @param currentPose { x, y, heading } current robot pose
 * @param size canvas size in pixels
 * @param metersAcross view span in meters
 * @returns { x, y } screen coordinates
 */
export function worldToScreenPoint(
  world: { x: number; y: number },
  currentPose: Pose,
  size: number,
  metersAcross: number
): { x: number; y: number } {
  const s = size / metersAcross; // pixels per meter
  const cx = size / 2;
  const cy = size / 2;

  const θ = currentPose.heading;
  const sinθ = Math.sin(θ);
  const cosθ = Math.cos(θ);

  // Rotate to robot frame (undo the heading rotation)
  const dx = world.x - currentPose.x;
  const dy = world.y - currentPose.y;
  const forward = dx * cosθ + dy * sinθ;
  const left = -dx * sinθ + dy * cosθ;

  const x = cx - left * s;
  const y = cy - forward * s;

  return { x, y };
}

/**
 * Convert a screen point to world coordinates using current robot pose.
 * Precise inverse of worldToScreenPoint.
 *
 * @param screen { x, y } screen coordinates
 * @param currentPose { x, y, heading } current robot pose
 * @param size canvas size in pixels
 * @param metersAcross view span in meters
 * @returns { x, y } world coordinates
 */
export function screenToWorldPoint(
  screen: { x: number; y: number },
  currentPose: Pose,
  size: number,
  metersAcross: number
): { x: number; y: number } {
  const s = size / metersAcross; // pixels per meter
  const cx = size / 2;
  const cy = size / 2;

  const θ = currentPose.heading;
  const sinθ = Math.sin(θ);
  const cosθ = Math.cos(θ);

  // Inverse transform: screen → robot frame
  const forward = (cy - screen.y) / s;
  const left = (cx - screen.x) / s;

  // Robot frame → world
  const world = {
    x: currentPose.x + forward * cosθ - left * sinθ,
    y: currentPose.y + forward * sinθ + left * cosθ,
  };

  return world;
}

/**
 * World heading (rad, map frame) that points from a waypoint marker toward a
 * pointer/finger on screen — RViz-style "drag to aim". Purely directional:
 * the result faces wherever the finger is relative to the marker, independent
 * of drag distance.
 *
 * In a base_link-fixed map view, screen-up is the robot's forward direction
 * (world heading = mapHeading), and screen-x is mirrored relative to the map
 * frame (worldToScreenPoint maps a world heading θ to screen direction
 * (-sin(θ-mapHeading), -cos(θ-mapHeading))). Inverting that for a screen
 * vector (marker → pointer) gives this expression.
 *
 * @param marker    waypoint marker screen position { x, y }
 * @param pointer   finger/cursor screen position { x, y }
 * @param mapHeading current robot heading (rad, map frame) — the view's up axis
 * @returns world heading in radians (map frame)
 */
export function pointerToWorldHeading(
  marker: { x: number; y: number },
  pointer: { x: number; y: number },
  mapHeading: number
): number {
  return mapHeading + Math.atan2(marker.x - pointer.x, marker.y - pointer.y);
}

/**
 * SVG rotation (degrees, clockwise) for an up-pointing arrow so it faces a
 * given world heading in a base_link-fixed map view. Exact inverse of
 * pointerToWorldHeading's screen convention.
 *
 * @param worldHeading desired heading (rad, map frame)
 * @param mapHeading   current robot heading (rad, map frame)
 * @returns degrees for an SVG rotate() of an arrow drawn pointing up
 */
export function worldHeadingToScreenDeg(worldHeading: number, mapHeading: number): number {
  return (mapHeading - worldHeading) * 180 / Math.PI;
}

/**
 * Select the capture pose for a scan, returning the pose to use for base_link → world transform.
 * If scanPose exists and its frame matches currentPose frame, use scanPose.
 * Otherwise (frame mismatch or undefined), fall back to currentPose (robot-centered behavior).
 *
 * @param scanPose optional pose with frame when scan was captured
 * @param currentPose current robot pose (defines frame context)
 * @returns the pose to use for scan-to-world transform
 */
export function selectScanCapturePose(
  scanPose: { frame: string; x: number; y: number; heading: number } | undefined,
  currentPose: { frame: string; x: number; y: number; heading: number }
): Pose {
  if (scanPose && scanPose.frame === currentPose.frame) {
    return { x: scanPose.x, y: scanPose.y, heading: scanPose.heading };
  }
  return { x: currentPose.x, y: currentPose.y, heading: currentPose.heading };
}

/**
 * Convert lidar scan rays to screen coordinates.
 * Scan is in base_link frame. Skip invalid ranges (≤0).
 *
 * Each ray: i-th angle = angleMin + i·angleIncrement
 * base_link: x forward, y left
 * Conversion: bx = r·cos(φ), by = r·sin(φ)
 * Then: base_link → world using capturePose (rotate by heading, translate)
 * Finally: world → screen using currentPose
 *
 * When capturePose === currentPose, reduces to robot-centered behavior.
 *
 * @param scan lidar scan data
 * @param capturePose pose when scan was captured (for base_link → world)
 * @param currentPose current robot pose (for world → screen)
 * @param size canvas size in pixels
 * @param metersAcross view span in meters
 * @returns array of screen coordinates for each valid ray
 */
export function scanToScreenPoints(
  scan: Scan,
  capturePose: Pose,
  currentPose: Pose,
  size: number,
  metersAcross: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < scan.ranges.length; i++) {
    const r = scan.ranges[i];
    if (r <= 0) continue; // skip invalid

    const φ = scan.angleMin + i * scan.angleIncrement;
    const bx = r * Math.cos(φ); // forward in base_link
    const by = r * Math.sin(φ); // left in base_link

    // base_link → world via capturePose
    const ch = capturePose.heading;
    const sinch = Math.sin(ch);
    const cosch = Math.cos(ch);
    const wx = capturePose.x + bx * cosch - by * sinch;
    const wy = capturePose.y + bx * sinch + by * cosch;

    // world → screen via currentPose
    const point = worldToScreenPoint({ x: wx, y: wy }, currentPose, size, metersAcross);
    points.push(point);
  }

  return points;
}

/**
 * Compute screen dimensions (px) of the robot footprint rectangle.
 *
 * Conventions:
 * - ROS: length = x-axis (forward), width = y-axis (left/right)
 * - Screen: length is vertical (heightPx), width is horizontal (widthPx)
 * - Zoom gate: if max(widthPx, heightPx) < minPx, return null to avoid noise at far zoom
 *
 * @param lengthM Robot length in meters (forward extent)
 * @param widthM Robot width in meters (left-right extent)
 * @param pxPerM Pixels per meter (scale factor from map/odom context)
 * @param minPx Minimum visible dimension in pixels (default 14); if exceeded, render
 * @returns { widthPx: number; heightPx: number } or null if invalid/gated
 */
export function footprintScreenRect(
  lengthM: number,
  widthM: number,
  pxPerM: number,
  minPx = 14
): { widthPx: number; heightPx: number } | null {
  if (lengthM <= 0 || widthM <= 0 || pxPerM <= 0) {
    return null;
  }

  const heightPx = lengthM * pxPerM;
  const widthPx = widthM * pxPerM;

  if (Math.max(widthPx, heightPx) < minPx) {
    return null;
  }

  return { widthPx, heightPx };
}

/**
 * Render map cells to 32-bit RGBA.
 * Palette (Mission colors):
 * - CELL_UNKNOWN (0) → (0,0,0,0) transparent
 * - CELL_FREE (1) → (78,201,214,18) accent micro-glow
 * - CELL_OCCUPIED (2) → (230,240,245,230) bright
 *
 * Index = (row * width + col) * 4 (row per data order, not flipped).
 */
export function mapToRgba(
  cells: Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = (row * width + col) * 4;
      const cell = cells[row * width + col];

      if (cell === 0) {
        // CELL_UNKNOWN: transparent
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      } else if (cell === 1) {
        // CELL_FREE: accent micro-glow
        rgba[idx] = 78;
        rgba[idx + 1] = 201;
        rgba[idx + 2] = 214;
        rgba[idx + 3] = 18;
      } else if (cell === 2) {
        // CELL_OCCUPIED: bright
        rgba[idx] = 230;
        rgba[idx + 1] = 240;
        rgba[idx + 2] = 245;
        rgba[idx + 3] = 230;
      } else {
        // Unknown cell type: transparent
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  return rgba;
}
