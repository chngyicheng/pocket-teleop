import { describe, it, expect } from 'vitest';
import {
  mapToScreenTransform,
  scanToScreenPoints,
  mapToRgba,
  footprintScreenRect,
  worldToScreenPoint,
  selectScanCapturePose,
  cellAtWorld,
} from '../src/map_render';
import { CELL_UNKNOWN, CELL_FREE, CELL_OCCUPIED } from '../src/map_codec';

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

describe('worldToScreenPoint', () => {
  it('worldToScreenPoint: heading=0, world(1,2)→screen(30,40)', () => {
    const world = { x: 1, y: 2 };
    const currentPose = { x: 0, y: 0, heading: 0 };
    const size = 100;
    const metersAcross = 10;
    const s = size / metersAcross; // 10; cx=cy=50
    // θ=0: cos(0)=1, sin(0)=0
    // dx=1-0=1, dy=2-0=2
    // forward = 1*1 + 2*0 = 1
    // left = -1*0 + 2*1 = 2
    // x = 50 - 2*10 = 30; y = 50 - 1*10 = 40

    const point = worldToScreenPoint(world, currentPose, size, metersAcross);
    expect(point.x).toBeCloseTo(30, 5);
    expect(point.y).toBeCloseTo(40, 5);
  });
});

describe('scanToScreenPoints', () => {
  // angleMin=0, inc=π/2, ranges=[1,1,0,2]→3 points
  it('angleMin=0, inc=π/2, ranges=[1,1,0,2] filters range<=0 (legacy robot-centered)', () => {
    const size = 100;
    const metersAcross = 10;
    const s = size / metersAcross; // 10

    const scan = {
      angleMin: 0,
      angleIncrement: Math.PI / 2,
      rangeMax: 10,
      ranges: [1, 1, 0, 2],
    };

    // Robot-centered case: capturePose === currentPose
    const pose = { x: 0, y: 0, heading: 0 };
    const points = scanToScreenPoints(scan, pose, pose, size, metersAcross);

    // i=0: φ=0, r=1, bx=1, by=0 → world(0+1*1-0*0, 0+1*0+0*1)=(1,0) → screen(50,40)
    // i=1: φ=π/2, r=1, bx=0, by=1 → world(0+0*1-1*0, 0+0*0+1*1)=(0,1) → screen(40,50)
    // i=2: r=0, skip
    // i=3: φ=3π/2, r=2, bx=0, by=-2 → world(0+0*1-(-2)*0, 0+0*0+(-2)*1)=(0,-2) → screen(70,50)

    expect(points.length).toBe(3);
    expect(points[0].x).toBeCloseTo(50, 5);
    expect(points[0].y).toBeCloseTo(40, 5);
    expect(points[1].x).toBeCloseTo(40, 5);
    expect(points[1].y).toBeCloseTo(50, 5);
    expect(points[2].x).toBeCloseTo(70, 5);
    expect(points[2].y).toBeCloseTo(50, 5);
  });

  it('scan with capture pose displacement and rotation', () => {
    const size = 100;
    const metersAcross = 10;
    const s = size / metersAcross; // 10

    const scan = {
      angleMin: 0,
      angleIncrement: 0, // single ray
      rangeMax: 10,
      ranges: [2.0],
    };

    // Capture at (1, 0) heading π/2; current at (0, 0) heading 0
    const capturePose = { x: 1, y: 0, heading: Math.PI / 2 };
    const currentPose = { x: 0, y: 0, heading: 0 };

    const points = scanToScreenPoints(scan, capturePose, currentPose, size, metersAcross);

    // i=0: φ=0, r=2.0, bx=2.0*cos(0)=2.0, by=2.0*sin(0)=0
    // base_link → world via capturePose (heading π/2):
    //   ch = π/2: cos(π/2)=0, sin(π/2)=1
    //   wx = 1 + 2.0*0 - 0*1 = 1
    //   wy = 0 + 2.0*1 + 0*0 = 2
    // world(1,2) → screen via currentPose (heading 0):
    //   dx=1-0=1, dy=2-0=2
    //   forward = 1*1 + 2*0 = 1
    //   left = -1*0 + 2*1 = 2
    //   x = 50 - 2*10 = 30; y = 50 - 1*10 = 40

    expect(points.length).toBe(1);
    expect(points[0].x).toBeCloseTo(30, 5);
    expect(points[0].y).toBeCloseTo(40, 5);
  });
});

describe('selectScanCapturePose', () => {
  it('scanPose present and frame matches currentPose → return scanPose', () => {
    const scanPose = { frame: 'map' as const, x: 1, y: 2, heading: 0.5 };
    const currentPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };

    const result = selectScanCapturePose(scanPose, currentPose);

    expect(result.x).toBe(1);
    expect(result.y).toBe(2);
    expect(result.heading).toBe(0.5);
  });

  it('scanPose frame mismatch (odom vs map) → return currentPose', () => {
    const scanPose = { frame: 'odom' as const, x: 1, y: 2, heading: 0.5 };
    const currentPose = { frame: 'map' as const, x: 3, y: 4, heading: 1.0 };

    const result = selectScanCapturePose(scanPose, currentPose);

    expect(result.x).toBe(3);
    expect(result.y).toBe(4);
    expect(result.heading).toBe(1.0);
  });

  it('scanPose undefined → return currentPose', () => {
    const scanPose = undefined;
    const currentPose = { frame: 'map' as const, x: 5, y: 6, heading: 2.0 };

    const result = selectScanCapturePose(scanPose, currentPose);

    expect(result.x).toBe(5);
    expect(result.y).toBe(6);
    expect(result.heading).toBe(2.0);
  });
});

describe('footprintScreenRect', () => {
  it('lengthM=0.281 widthM=0.306 pxPerM=50: heightPx≈14 widthPx≈15.3 (gate open)', () => {
    const result = footprintScreenRect(0.281, 0.306, 50);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.heightPx).toBeCloseTo(14.05, 1);
      expect(result.widthPx).toBeCloseTo(15.3, 1);
    }
  });

  it('lengthM=0.281 widthM=0.306 pxPerM=6 (odom default): gate closed (<14px)', () => {
    const result = footprintScreenRect(0.281, 0.306, 6);
    expect(result).toBeNull(); // max(1.686, 1.836) = 1.836 < 14
  });

  it('lengthM=0 widthM=0.306 pxPerM=50: null (zero length)', () => {
    const result = footprintScreenRect(0, 0.306, 50);
    expect(result).toBeNull();
  });

  it('lengthM=0.281 widthM=-0.1 pxPerM=50: null (negative width)', () => {
    const result = footprintScreenRect(0.281, -0.1, 50);
    expect(result).toBeNull();
  });

  it('lengthM=0.281 widthM=0.306 pxPerM=0: null (zero pxPerM)', () => {
    const result = footprintScreenRect(0.281, 0.306, 0);
    expect(result).toBeNull();
  });

  it('lengthM=3 widthM=2 pxPerM=10: heightPx=30 widthPx=20 (gate open)', () => {
    const result = footprintScreenRect(3, 2, 10);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.heightPx).toBe(30);
      expect(result.widthPx).toBe(20);
    }
  });

  it('lengthM=1 widthM=1 pxPerM=14: heightPx=14 widthPx=14 (gate edge case)', () => {
    const result = footprintScreenRect(1, 1, 14);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.heightPx).toBe(14);
      expect(result.widthPx).toBe(14);
    }
  });

  it('lengthM=1 widthM=1 pxPerM=13.9: null (gate closed, 13.9 < 14)', () => {
    const result = footprintScreenRect(1, 1, 13.9);
    expect(result).toBeNull();
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

describe('cellAtWorld', () => {
  // 3×2 grid, row-major:
  //   row 0: [FREE, FREE, FREE]
  //   row 1: [OCCUPIED, UNKNOWN, FREE]
  // origin (0,0), resolution 0.5 → grid spans x ∈ [0, 1.5), y ∈ [0, 1.0)
  const mapGrid = {
    cells: new Uint8Array([CELL_FREE, CELL_FREE, CELL_FREE, CELL_OCCUPIED, CELL_UNKNOWN, CELL_FREE]),
    width: 3,
    height: 2,
    resolution: 0.5,
    originX: 0,
    originY: 0,
  };

  it('center of free cell (col 0, row 0) at world (0.25, 0.25) → CELL_FREE', () => {
    expect(cellAtWorld(mapGrid, 0.25, 0.25)).toBe(CELL_FREE);
  });

  it('center of occupied cell (col 0, row 1) at world (0.25, 0.75) → CELL_OCCUPIED', () => {
    expect(cellAtWorld(mapGrid, 0.25, 0.75)).toBe(CELL_OCCUPIED);
  });

  it('center of unknown cell (col 1, row 1) at world (0.75, 0.75) → CELL_UNKNOWN', () => {
    expect(cellAtWorld(mapGrid, 0.75, 0.75)).toBe(CELL_UNKNOWN);
  });

  it('origin point (0, 0) → cell (0,0) = CELL_FREE (origin is cell (0,0) world corner)', () => {
    expect(cellAtWorld(mapGrid, 0, 0)).toBe(CELL_FREE);
  });

  it('four corners: inside near-corners resolve, outside far edges null', () => {
    // bottom-left corner cell
    expect(cellAtWorld(mapGrid, 0.01, 0.01)).toBe(CELL_FREE);
    // bottom-right corner cell (col 2, row 0)
    expect(cellAtWorld(mapGrid, 1.49, 0.01)).toBe(CELL_FREE);
    // top-left corner cell (col 0, row 1)
    expect(cellAtWorld(mapGrid, 0.01, 0.99)).toBe(CELL_OCCUPIED);
    // top-right corner cell (col 2, row 1)
    expect(cellAtWorld(mapGrid, 1.49, 0.99)).toBe(CELL_FREE);
    // exact far edges are out of bounds (floor lands on width/height)
    expect(cellAtWorld(mapGrid, 1.5, 0.5)).toBeNull();
    expect(cellAtWorld(mapGrid, 0.5, 1.0)).toBeNull();
  });

  it('negative world coords → null', () => {
    expect(cellAtWorld(mapGrid, -0.01, 0.25)).toBeNull();
    expect(cellAtWorld(mapGrid, 0.25, -0.01)).toBeNull();
    expect(cellAtWorld(mapGrid, -1, -1)).toBeNull();
  });

  it('far out of bounds → null', () => {
    expect(cellAtWorld(mapGrid, 100, 0.25)).toBeNull();
    expect(cellAtWorld(mapGrid, 0.25, 100)).toBeNull();
  });

  it('non-zero origin shifts the lookup', () => {
    const shifted = { ...mapGrid, originX: -5, originY: 10 };
    // world (-4.75, 10.75) → col 0, row 1 → CELL_OCCUPIED
    expect(cellAtWorld(shifted, -4.75, 10.75)).toBe(CELL_OCCUPIED);
    // world (0,0) is far outside the shifted grid
    expect(cellAtWorld(shifted, 0, 0)).toBeNull();
  });
});
