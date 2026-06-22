import { describe, it, expect } from 'vitest';
import { pointerToWorldHeading, worldHeadingToScreenDeg } from '../src/map_render.js';

// Normalize an angle difference to [-π, π] for comparison.
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe('pointerToWorldHeading — RViz-style aim, base_link-fixed view', () => {
  const marker = { x: 100, y: 100 };

  it('finger straight up = robot forward (heading = mapHeading)', () => {
    expect(angDiff(pointerToWorldHeading(marker, { x: 100, y: 40 }, 0), 0)).toBeCloseTo(0, 6);
    expect(angDiff(pointerToWorldHeading(marker, { x: 100, y: 40 }, 1.2), 1.2)).toBeCloseTo(0, 6);
  });

  it('finger to screen-left = +90° (robot left) relative to mapHeading', () => {
    expect(angDiff(pointerToWorldHeading(marker, { x: 40, y: 100 }, 0), Math.PI / 2)).toBeCloseTo(0, 6);
  });

  it('finger to screen-right = -90° (robot right) relative to mapHeading', () => {
    expect(angDiff(pointerToWorldHeading(marker, { x: 160, y: 100 }, 0), -Math.PI / 2)).toBeCloseTo(0, 6);
  });

  it('finger straight down = backward (180°)', () => {
    // result is ±π; compare as an absolute angle
    expect(Math.abs(pointerToWorldHeading(marker, { x: 100, y: 160 }, 0))).toBeCloseTo(Math.PI, 6);
  });

  it('is direction-only — distance from marker does not change the heading', () => {
    const near = pointerToWorldHeading(marker, { x: 120, y: 80 }, 0.5);
    const far = pointerToWorldHeading(marker, { x: 300, y: -100 }, 0.5); // same direction, farther
    expect(angDiff(near, far)).toBeCloseTo(0, 6);
  });

  it('roundtrips with the handle placement convention for assorted headings', () => {
    const r = 18;
    for (const H of [0, 0.7, -1.1, 2.5]) {
      for (const theta of [0, 1, -2, 3.0, Math.PI]) {
        const dh = theta - H;
        const handle = { x: marker.x - r * Math.sin(dh), y: marker.y - r * Math.cos(dh) };
        const recovered = pointerToWorldHeading(marker, handle, H);
        expect(angDiff(recovered, theta)).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('worldHeadingToScreenDeg — inverse, arrow render', () => {
  it('heading == mapHeading → 0° (arrow points up)', () => {
    expect(worldHeadingToScreenDeg(1.3, 1.3)).toBeCloseTo(0, 6);
  });

  it('heading 90° left of mapHeading → -90° SVG rotate', () => {
    expect(worldHeadingToScreenDeg(Math.PI / 2, 0)).toBeCloseTo(-90, 6);
  });

  it('heading 90° right of mapHeading → +90° SVG rotate', () => {
    expect(worldHeadingToScreenDeg(-Math.PI / 2, 0)).toBeCloseTo(90, 6);
  });

  it('agrees with pointerToWorldHeading (drag then render is consistent)', () => {
    const marker = { x: 50, y: 50 };
    const pointer = { x: 80, y: 20 };
    const H = 0.4;
    const theta = pointerToWorldHeading(marker, pointer, H);
    // Re-deriving the screen direction from the render angle should match the
    // marker→pointer screen direction (both unit vectors, same orientation).
    const deg = worldHeadingToScreenDeg(theta, H);
    const a = (deg * Math.PI) / 180;
    // SVG arrow up (0,-1) rotated clockwise by `a`: (sin a, -cos a)
    const rendered = { x: Math.sin(a), y: -Math.cos(a) };
    const sv = { x: pointer.x - marker.x, y: pointer.y - marker.y };
    const len = Math.hypot(sv.x, sv.y);
    expect(angDiff(Math.atan2(rendered.y, rendered.x), Math.atan2(sv.y / len, sv.x / len))).toBeCloseTo(0, 6);
  });
});
