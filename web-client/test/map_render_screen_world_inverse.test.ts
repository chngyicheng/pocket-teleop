import { describe, it, expect } from 'vitest';
import { worldToScreenPoint, screenToWorldPoint } from '../src/map_render.js';

describe('screenToWorldPoint — precise inverse of worldToScreenPoint', () => {
  it('roundtrip θ=0, pose(0,0): screen→world→screen returns original', () => {
    const size = 100;
    const metersAcross = 10;
    const pose = { x: 0, y: 0, heading: 0 };

    // Start with world point (2, 3)
    const worldStart = { x: 2, y: 3 };
    const screen = worldToScreenPoint(worldStart, pose, size, metersAcross);
    const worldEnd = screenToWorldPoint(screen, pose, size, metersAcross);

    expect(worldEnd.x).toBeCloseTo(worldStart.x, 5);
    expect(worldEnd.y).toBeCloseTo(worldStart.y, 5);
  });

  it('roundtrip θ=45°, pose(5,10): screen→world→screen returns original', () => {
    const size = 100;
    const metersAcross = 20;
    const pose = { x: 5, y: 10, heading: Math.PI / 4 };

    const worldStart = { x: 10, y: 5 };
    const screen = worldToScreenPoint(worldStart, pose, size, metersAcross);
    const worldEnd = screenToWorldPoint(screen, pose, size, metersAcross);

    expect(worldEnd.x).toBeCloseTo(worldStart.x, 5);
    expect(worldEnd.y).toBeCloseTo(worldStart.y, 5);
  });

  it('roundtrip θ=-60°, pose(-3,-7): screen→world→screen returns original', () => {
    const size = 200;
    const metersAcross = 50;
    const pose = { x: -3, y: -7, heading: -Math.PI / 3 };

    const worldStart = { x: -10, y: 20 };
    const screen = worldToScreenPoint(worldStart, pose, size, metersAcross);
    const worldEnd = screenToWorldPoint(screen, pose, size, metersAcross);

    expect(worldEnd.x).toBeCloseTo(worldStart.x, 5);
    expect(worldEnd.y).toBeCloseTo(worldStart.y, 5);
  });

  it('roundtrip θ=π, pose(0,0): screen→world→screen returns original', () => {
    const size = 100;
    const metersAcross = 15;
    const pose = { x: 0, y: 0, heading: Math.PI };

    const worldStart = { x: -5, y: 8 };
    const screen = worldToScreenPoint(worldStart, pose, size, metersAcross);
    const worldEnd = screenToWorldPoint(screen, pose, size, metersAcross);

    expect(worldEnd.x).toBeCloseTo(worldStart.x, 5);
    expect(worldEnd.y).toBeCloseTo(worldStart.y, 5);
  });

  it('robot at screen center when world=pose position', () => {
    const size = 100;
    const metersAcross = 10;
    const pose = { x: 7, y: 9, heading: 0.5 };

    // World point == pose position should map to screen center
    const screen = worldToScreenPoint(pose, pose, size, metersAcross);
    expect(screen.x).toBeCloseTo(50, 5);
    expect(screen.y).toBeCloseTo(50, 5);

    // Inverse: screen center → world pose position
    const world = screenToWorldPoint({ x: 50, y: 50 }, pose, size, metersAcross);
    expect(world.x).toBeCloseTo(pose.x, 5);
    expect(world.y).toBeCloseTo(pose.y, 5);
  });
});
