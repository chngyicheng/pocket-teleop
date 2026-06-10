import { describe, it, expect } from 'vitest';
import {
  mapToScreenTransform,
  scanToScreenPoints,
  mapToRgba,
} from '../src/map_render';

describe('mapToScreenTransform', () => {
  // Test vector 1: θ=0, pose(0,0), origin(0,0)
  // pixel(0,0)→(50,50); pixel(10,0)→(50,40); pixel(0,10)→(40,50)
  it('θ=0 pose(0,0) origin(0,0): pixel(0,0)→(50,50)', () => {
    const size = 100;
    const metersAcross = 10;
    const s = size / metersAcross; // 10
    const r = 0.1;
    const sr = s * r; // 1
    const pose = { x: 0, y: 0, heading: 0 };
    const meta = { originX: 0, originY: 0, resolution: 0.1 };

    const t = mapToScreenTransform(pose, meta, size, metersAcross);

    // θ=0: sin(0)=0, cos(0)=1
    // a = s*r*sin(0) = 0
    // b = -s*r*cos(0) = -1
    // c = -s*r*cos(0) = -1
    // d = -s*r*sin(0) = 0
    // e = cx - s*(-sin(0)*0 + cos(0)*0) = 50
    // f = cy - s*(cos(0)*0 + sin(0)*0) = 50
    expect(t.a).toBeCloseTo(0, 5);
    expect(t.b).toBeCloseTo(-1, 5);
    expect(t.c).toBeCloseTo(-1, 5);
    expect(t.d).toBeCloseTo(0, 5);
    expect(t.e).toBeCloseTo(50, 5);
    expect(t.f).toBeCloseTo(50, 5);

    // x'(0,0) = a*0 + c*0 + e = 50
    // y'(0,0) = b*0 + d*0 + f = 50
    const x = t.a * 0 + t.c * 0 + t.e;
    const y = t.b * 0 + t.d * 0 + t.f;
    expect(x).toBeCloseTo(50, 5);
    expect(y).toBeCloseTo(50, 5);

    // pixel(10,0) [east 1m]→(50,40)
    const x10_0 = t.a * 10 + t.c * 0 + t.e; // 0 - 10 + 50 = 40? NO, c*0=0 so 0+0+50=50
    const y10_0 = t.b * 10 + t.d * 0 + t.f; // -10 + 0 + 50 = 40
    expect(x10_0).toBeCloseTo(50, 5);
    expect(y10_0).toBeCloseTo(40, 5);

    // pixel(0,10) [north 1m]→(40,50)
    const x0_10 = t.a * 0 + t.c * 10 + t.e; // 0 - 10 + 50 = 40
    const y0_10 = t.b * 0 + t.d * 10 + t.f; // 0 + 0 + 50 = 50
    expect(x0_10).toBeCloseTo(40, 5);
    expect(y0_10).toBeCloseTo(50, 5);
  });

  // Test vector 2: θ=π/2, pose(0,0), origin(0,0)
  // pixel(0,10)→(50,40); pixel(10,0)→(60,50)
  it('θ=π/2 pose(0,0): pixel(0,10)→(50,40), pixel(10,0)→(60,50)', () => {
    const size = 100;
    const metersAcross = 10;
    const s = size / metersAcross;
    const r = 0.1;
    const sr = s * r;
    const pose = { x: 0, y: 0, heading: Math.PI / 2 };
    const meta = { originX: 0, originY: 0, resolution: 0.1 };

    const t = mapToScreenTransform(pose, meta, size, metersAcross);

    // θ=π/2: sin(π/2)=1, cos(π/2)=0
    // a = 1*1 = 1
    // b = -1*0 = 0
    // c = -1*0 = 0
    // d = -1*1 = -1
    // e = 50 - 1*(-1*0 + 0*0) = 50
    // f = 50 - 1*(0*0 + 1*0) = 50
    expect(t.a).toBeCloseTo(1, 5);
    expect(t.b).toBeCloseTo(0, 5);
    expect(t.c).toBeCloseTo(0, 5);
    expect(t.d).toBeCloseTo(-1, 5);

    // pixel(0,10)→(50,40): x'=0+0+50=50, y'=0-10+50=40
    const x0_10 = t.a * 0 + t.c * 10 + t.e;
    const y0_10 = t.b * 0 + t.d * 10 + t.f;
    expect(x0_10).toBeCloseTo(50, 5);
    expect(y0_10).toBeCloseTo(40, 5);

    // pixel(10,0)→(60,50): x'=10+0+50=60, y'=0+0+50=50
    const x10_0 = t.a * 10 + t.c * 0 + t.e;
    const y10_0 = t.b * 10 + t.d * 0 + t.f;
    expect(x10_0).toBeCloseTo(60, 5);
    expect(y10_0).toBeCloseTo(50, 5);
  });

  // Test vector 3: θ=0, pose(2,1), origin(0,0)
  // pixel(20,10)→(50,50)
  it('θ=0 pose(2,1): pixel(20,10)→(50,50)', () => {
    const size = 100;
    const metersAcross = 10;
    const pose = { x: 2, y: 1, heading: 0 };
    const meta = { originX: 0, originY: 0, resolution: 0.1 };

    const t = mapToScreenTransform(pose, meta, size, metersAcross);

    // pixel(20,10) = world(2,1) = robot position
    const x = t.a * 20 + t.c * 10 + t.e;
    const y = t.b * 20 + t.d * 10 + t.f;
    expect(x).toBeCloseTo(50, 5);
    expect(y).toBeCloseTo(50, 5);
  });
});

describe('scanToScreenPoints', () => {
  // angleMin=0, inc=π/2, ranges=[1,1,0,2]→3 points
  it('angleMin=0, inc=π/2, ranges=[1,1,0,2] filters range<=0', () => {
    const size = 100;
    const metersAcross = 10;
    const s = size / metersAcross; // 10

    const scan = {
      angleMin: 0,
      angleIncrement: Math.PI / 2,
      rangeMax: 10,
      ranges: [1, 1, 0, 2],
    };

    const points = scanToScreenPoints(scan, size, metersAcross);

    // i=0: φ=0, r=1, bx=1, by=0 → x=50-0*10=50, y=50-1*10=40
    // i=1: φ=π/2, r=1, bx=0, by=1 → x=50-1*10=40, y=50-0*10=50
    // i=2: r=0, skip
    // i=3: φ=3π/2, r=2, bx=0, by=-2 → x=50-(-2)*10=70, y=50-0*10=50

    expect(points.length).toBe(3);
    expect(points[0].x).toBeCloseTo(50, 5);
    expect(points[0].y).toBeCloseTo(40, 5);
    expect(points[1].x).toBeCloseTo(40, 5);
    expect(points[1].y).toBeCloseTo(50, 5);
    expect(points[2].x).toBeCloseTo(70, 5);
    expect(points[2].y).toBeCloseTo(50, 5);
  });
});

describe('mapToRgba', () => {
  // cells=[0,1,2] w=3 h=1 → palette mission
  it('cells=[0,1,2] w=3 h=1: palette→[UNKNOWN, FREE, OCCUPIED]', () => {
    const cells = new Uint8Array([0, 1, 2]);
    const width = 3;
    const height = 1;

    const rgba = mapToRgba(cells, width, height);

    expect(rgba.length).toBe(3 * 4);

    // CELL_UNKNOWN (0) → (0,0,0,0) transparent
    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(0);

    // CELL_FREE (1) → (78,201,214,18) accent micro-glow
    expect(rgba[4]).toBe(78);
    expect(rgba[5]).toBe(201);
    expect(rgba[6]).toBe(214);
    expect(rgba[7]).toBe(18);

    // CELL_OCCUPIED (2) → (230,240,245,230) bright
    expect(rgba[8]).toBe(230);
    expect(rgba[9]).toBe(240);
    expect(rgba[10]).toBe(245);
    expect(rgba[11]).toBe(230);
  });
});
