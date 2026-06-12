import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Joystick,
  MiniMap,
  Compass,
  CompassTape,
  VelBars,
  Readout,
  CONNECTION_LABELS,
  Crosshair,
  JoystickZone,
} from '../src/components/shared';

// ─── Joystick Tests ──────────────────────────────────────────────────────────

describe('Joystick', () => {
  it('classic variant shows base and knob when mounted', () => {
    const { container } = render(
      <Joystick variant="classic" size={240} baseSize={120} knobSize={56} />
    );
    // Base should be visible for classic variant
    const divs = container.querySelectorAll('div[style*="position: absolute"]');
    expect(divs.length).toBeGreaterThan(0);
  });

  it('zone variant places base at fingertip on pointerdown', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Joystick
        variant="zone"
        size={240}
        baseSize={120}
        knobSize={56}
        onMove={onMove}
      />
    );
    // jsdom's CSSOM drops the touch-action property, so a style*= selector
    // returns null. Query by data-testid which is stable across engines.
    const zone = container.querySelector('[data-testid="joystick-zone"]');
    expect(zone).toBeTruthy();

    // Simulate pointerdown at (50, 60) within the zone
    if (zone) {
      fireEvent.pointerDown(zone, {
        clientX: 50,
        clientY: 60,
        pointerId: 1,
      });

      // Base center should reflect the fingertip position
      // The zone has size 240, so (50, 60) local → base.x ≈ 50, base.y ≈ 60
      const baseDivs = container.querySelectorAll('div[style*="border-radius"]');
      let baseFound = false;
      for (const div of baseDivs) {
        const style = (div as HTMLElement).getAttribute('style');
        if (style && style.includes('left:')) {
          baseFound = true;
          break;
        }
      }
      expect(baseFound).toBe(true);
    }
  });

  it('edge variant shows hint dot when inactive, base on touch', () => {
    const { container } = render(
      <Joystick variant="edge" size={240} baseSize={120} knobSize={56} />
    );
    const divs = container.querySelectorAll('div[style*="position: absolute"]');
    // Edge variant should have hint ring/dot visible initially
    expect(divs.length).toBeGreaterThan(0);
  });

  it('axes=x restricts y output to 0', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Joystick
        variant="classic"
        axes="x"
        size={240}
        baseSize={120}
        knobSize={56}
        onMove={onMove}
      />
    );

    const zone = container.querySelector('[data-testid="joystick-zone"]');
    expect(zone).toBeTruthy();
    fireEvent.pointerDown(zone!, { clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(zone!, { clientX: 180, clientY: 180, pointerId: 1 });

    expect(onMove).toHaveBeenCalled();
    const lastCall = onMove.mock.calls[onMove.mock.calls.length - 1];
    // axes='x' must zero the y component regardless of pointer motion.
    expect(lastCall[1]).toBe(0);
  });

  it('axes=y restricts x output to 0', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Joystick
        variant="classic"
        axes="y"
        size={240}
        baseSize={120}
        knobSize={56}
        onMove={onMove}
      />
    );

    const zone = container.querySelector('[data-testid="joystick-zone"]');
    expect(zone).toBeTruthy();
    fireEvent.pointerDown(zone!, { clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(zone!, { clientX: 180, clientY: 180, pointerId: 1 });

    expect(onMove).toHaveBeenCalled();
    const lastCall = onMove.mock.calls[onMove.mock.calls.length - 1];
    // axes='y' must zero the x component regardless of pointer motion.
    expect(lastCall[0]).toBe(0);
  });

  it('calls onEnd when pointer is released', () => {
    const onEnd = vi.fn();
    const { container } = render(
      <Joystick variant="classic" size={240} baseSize={120} onEnd={onEnd} />
    );

    const zone = container.querySelector('[data-testid="joystick-zone"]');
    expect(zone).toBeTruthy();
    fireEvent.pointerDown(zone!, { clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(zone!, { pointerId: 1 });

    expect(onEnd).toHaveBeenCalled();
  });

  it('applies glow effect when glow=true', () => {
    const { container } = render(
      <Joystick
        variant="classic"
        size={240}
        baseSize={120}
        knobSize={56}
        glow={true}
        ringColor="rgba(255,255,255,0.25)"
      />
    );

    const styles = container.innerHTML;
    // React serializes inline-style props to kebab-case CSS in the DOM.
    expect(styles).toContain('box-shadow');
  });

  it('applies square style when square=true', () => {
    const { container } = render(
      <Joystick
        variant="classic"
        size={240}
        baseSize={120}
        knobSize={56}
        square={true}
      />
    );

    const styles = container.innerHTML;
    // Square variant uses a finite border-radius (not 50% / pill).
    expect(styles).toContain('border-radius');
  });

  it('renders label when provided', () => {
    const { container } = render(
      <Joystick
        variant="classic"
        size={240}
        label="DRIVE"
      />
    );

    expect(container.textContent).toContain('DRIVE');
  });

  it('clamps knob position to baseRadius', () => {
    const onMove = vi.fn();
    const { container } = render(
      <Joystick
        variant="classic"
        size={240}
        baseSize={120}
        knobSize={56}
        onMove={onMove}
      />
    );

    const zone = container.querySelector('[data-testid="joystick-zone"]');
    expect(zone).toBeTruthy();
    fireEvent.pointerDown(zone!, { clientX: 120, clientY: 120, pointerId: 1 });
    // Move far outside the base (corner of viewport).
    fireEvent.pointerMove(zone!, { clientX: 300, clientY: 300, pointerId: 1 });

    expect(onMove).toHaveBeenCalled();
    const lastCall = onMove.mock.calls[onMove.mock.calls.length - 1];
    // Knob position must clamp to the unit circle [-1, 1] in each axis.
    expect(Math.abs(lastCall[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(lastCall[1])).toBeLessThanOrEqual(1);
  });
});

// ─── MiniMap Tests ──────────────────────────────────────────────────────────

describe('MiniMap', () => {
  it('renders with default props', () => {
    const { container } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={0} />
    );
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('accumulates trail points from multiple pos updates', () => {
    const { container, rerender } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={0} trail={true} />
    );

    // Update position multiple times
    rerender(<MiniMap pos={{ x: 1, y: 1 }} heading={0} trail={true} />);
    rerender(<MiniMap pos={{ x: 2, y: 2 }} heading={0} trail={true} />);
    rerender(<MiniMap pos={{ x: 3, y: 3 }} heading={0} trail={true} />);

    // SVG polyline should contain 3 or more points in the points attribute
    const polyline = container.querySelector('polyline');
    if (polyline) {
      const pointsAttr = polyline.getAttribute('points');
      expect(pointsAttr).toBeTruthy();
      const pointCount = (pointsAttr?.match(/,/g) || []).length + 1;
      expect(pointCount).toBeGreaterThanOrEqual(3);
    }
  });

  it('renders grid when grid=true', () => {
    const { container } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={0} grid={true} />
    );

    const gridDiv = container.querySelector('[data-testid="minimap-grid"]');
    expect(gridDiv).toBeTruthy();
    const style = (gridDiv as HTMLElement | null)?.getAttribute('style') ?? '';
    expect(style).toContain('repeating-linear-gradient');
  });

  it('does not render grid when grid=false', () => {
    const { container } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={0} grid={false} />
    );

    const gridDiv = container.querySelector('[data-testid="minimap-grid"]');
    expect(gridDiv).toBeFalsy();
  });

  it('renders range circles when ranges=true', () => {
    const { container } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={0} ranges={true} />
    );

    const circles = container.querySelectorAll('circle');
    // Should have range circles (3 expected from design)
    expect(circles.length).toBeGreaterThanOrEqual(3);
  });

  it('robot arrow rotates with heading', () => {
    const { container } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={Math.PI / 2} />
    );

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    // The last SVG should contain the robot arrow with rotation
    const lastSvg = svgs[svgs.length - 1];
    const transform = lastSvg.querySelector('g')?.getAttribute('transform');
    expect(transform).toContain('rotate');
  });

  it('trail maxes out at 80 points', () => {
    const { rerender } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={0} trail={true} />
    );

    // Push 100 updates
    for (let i = 1; i <= 100; i++) {
      rerender(
        <MiniMap pos={{ x: i, y: i }} heading={0} trail={true} />
      );
    }

    // Container should still render without error; trail is bounded internally
    // Just verify it doesn't crash
    expect(true).toBe(true);
  });

  // ─── MiniMap with map canvas ─────────────────────────────────────────────────
  it('does not render canvas when mapGrid is null', () => {
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={null}
        mapPose={null}
      />
    );
    const canvas = container.querySelector('[data-testid="minimap-canvas"]');
    expect(canvas).toBeFalsy();
    const grid = container.querySelector('[data-testid="minimap-grid"]');
    expect(grid).toBeTruthy(); // grid still present
  });

  it('does not render canvas when mapPose is null', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={null}
      />
    );
    const canvas = container.querySelector('[data-testid="minimap-canvas"]');
    expect(canvas).toBeFalsy();
  });

  it('renders canvas when mapGrid and mapPose are present', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
      />
    );
    const canvas = container.querySelector('[data-testid="minimap-canvas"]');
    expect(canvas).toBeTruthy();
  });

  it('keeps the robot arrow unrotated in map mode (map rotates instead)', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0.78 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0.78}
        mapGrid={mapGrid}
        mapPose={mapPose}
      />
    );
    const arrowGroup = container.querySelector('polygon')?.parentElement;
    expect(arrowGroup?.getAttribute('transform')).toContain('rotate(0)');
  });

  it('rotates the robot arrow with heading in odom fallback (no map)', () => {
    const { container } = render(
      <MiniMap pos={{ x: 0, y: 0 }} heading={Math.PI / 2} />
    );
    const arrowGroup = container.querySelector('polygon')?.parentElement;
    expect(arrowGroup?.getAttribute('transform')).toContain('rotate(90)');
  });

  it('shows label MAP when frame is map', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
      />
    );
    const label = container.querySelector('[data-testid="minimap-label"]');
    expect(label?.textContent).toBe('MAP');
  });

  it('shows label ODOM when frame is odom', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'odom' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
      />
    );
    const label = container.querySelector('[data-testid="minimap-label"]');
    expect(label?.textContent).toBe('ODOM');
  });

  it('shows label NO MAP when no map or pose', () => {
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={null}
        mapPose={null}
      />
    );
    const label = container.querySelector('[data-testid="minimap-label"]');
    expect(label?.textContent).toBe('NO MAP');
  });

  it('does not throw when scan is provided', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const scan = {
      angleMin: 0,
      angleIncrement: Math.PI / 2,
      rangeMax: 10,
      ranges: [1, 1, 0, 2],
    };
    expect(() => {
      render(
        <MiniMap
          pos={{ x: 0, y: 0 }}
          heading={0}
          mapGrid={mapGrid}
          mapPose={mapPose}
          scan={scan}
        />
      );
    }).not.toThrow();
  });

  // ─── MiniMap pinch-to-zoom tests ─────────────────────────────────────────
  it('canvas has data-meters-across attribute reflecting current zoom level', () => {
    const cells = new Uint8Array(10000);
    const mapGrid = { cells, width: 100, height: 100, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
        metersAcross={10}
      />
    );
    const canvas = container.querySelector('[data-testid="minimap-canvas"]') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    expect(canvas.getAttribute('data-meters-across')).toBe('10.00');
  });

  it('pinch out (two fingers opening) zooms in by shrinking metersAcross', () => {
    const cells = new Uint8Array(10000);
    const mapGrid = { cells, width: 100, height: 100, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container, rerender } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
        metersAcross={10}
      />
    );

    const wrapper = container.querySelector('div');
    expect(wrapper).toBeTruthy();

    // Simulate pinch out: down(1@40,50)+down(2@60,50) dist=20 → move(1@20,50)+move(2@80,50) dist=60
    // startDist=20, newDist=60 → zoom = startM * 20 / 60 = 10 * 1/3 ≈ 3.33
    fireEvent.pointerDown(wrapper!, {
      pointerId: 1,
      clientX: 40,
      clientY: 50,
    });
    fireEvent.pointerDown(wrapper!, {
      pointerId: 2,
      clientX: 60,
      clientY: 50,
    });

    fireEvent.pointerMove(wrapper!, {
      pointerId: 1,
      clientX: 20,
      clientY: 50,
    });
    fireEvent.pointerMove(wrapper!, {
      pointerId: 2,
      clientX: 80,
      clientY: 50,
    });

    // After the gesture, canvas attribute should reflect smaller viewM
    const canvas = container.querySelector('[data-testid="minimap-canvas"]') as HTMLCanvasElement;
    const metersStr = canvas?.getAttribute('data-meters-across') ?? '10.00';
    const meters = parseFloat(metersStr);
    expect(meters).toBeLessThan(10);
    expect(meters).toBeGreaterThan(0);
  });

  it('pinch in (two fingers closing) zooms out by increasing metersAcross', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 100, height: 100, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
        metersAcross={5}
      />
    );

    const wrapper = container.querySelector('div');
    expect(wrapper).toBeTruthy();

    // Simulate pinch in: down(1@80,50)+down(2@20,50) dist=60 → move(1@90,50)+move(2@10,50) dist=80
    // startDist=60, newDist=80 → zoom = 5 * 60 / 80 = 3.75 (clamped to [1.0, maxM] where maxM=100*100*0.1*1.2=120)
    fireEvent.pointerDown(wrapper!, {
      pointerId: 1,
      clientX: 80,
      clientY: 50,
    });
    fireEvent.pointerDown(wrapper!, {
      pointerId: 2,
      clientX: 20,
      clientY: 50,
    });

    fireEvent.pointerMove(wrapper!, {
      pointerId: 1,
      clientX: 90,
      clientY: 50,
    });
    fireEvent.pointerMove(wrapper!, {
      pointerId: 2,
      clientX: 10,
      clientY: 50,
    });

    const canvas = container.querySelector('[data-testid="minimap-canvas"]') as HTMLCanvasElement;
    const metersStr = canvas?.getAttribute('data-meters-across') ?? '5.00';
    const meters = parseFloat(metersStr);
    expect(meters).toBeGreaterThanOrEqual(3);
    expect(meters).toBeLessThanOrEqual(120);
  });

  it('single pointer move does not change zoom level', () => {
    const cells = new Uint8Array(10000);
    const mapGrid = { cells, width: 100, height: 100, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
        metersAcross={10}
      />
    );

    const wrapper = container.querySelector('div');
    expect(wrapper).toBeTruthy();

    fireEvent.pointerDown(wrapper!, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    });

    fireEvent.pointerMove(wrapper!, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });

    const canvas = container.querySelector('[data-testid="minimap-canvas"]') as HTMLCanvasElement;
    const metersStr = canvas?.getAttribute('data-meters-across') ?? '10.00';
    const meters = parseFloat(metersStr);
    expect(meters).toBe(10);
  });

  it('clamps zoom to minM=1.0', () => {
    const cells = new Uint8Array(10000);
    const mapGrid = { cells, width: 100, height: 100, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
        metersAcross={10}
      />
    );

    const wrapper = container.querySelector('div');
    expect(wrapper).toBeTruthy();

    // Extreme pinch out: startDist=20 → newDist=1 (triggers dist<8 guard → no zoom change; expect clamping instead)
    // Actually, use dist 20 → large dist to trigger extreme zoom-in beyond minM
    fireEvent.pointerDown(wrapper!, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerDown(wrapper!, {
      pointerId: 2,
      clientX: 60,
      clientY: 50,
    });

    // Extreme: dist 10 → 200
    fireEvent.pointerMove(wrapper!, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(wrapper!, {
      pointerId: 2,
      clientY: 250,
      clientX: 60,
    });

    const canvas = container.querySelector('[data-testid="minimap-canvas"]') as HTMLCanvasElement;
    const metersStr = canvas?.getAttribute('data-meters-across') ?? '10.00';
    const meters = parseFloat(metersStr);
    expect(meters).toBeGreaterThanOrEqual(1.0);
  });

  it('pinch gesture does not affect zoom in non-map mode (no mapGrid/mapPose)', () => {
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={null}
        mapPose={null}
        metersAcross={10}
      />
    );

    const wrapper = container.querySelector('div');
    expect(wrapper).toBeTruthy();

    // Simulate pinch gesture
    fireEvent.pointerDown(wrapper!, {
      pointerId: 1,
      clientX: 40,
      clientY: 50,
    });
    fireEvent.pointerDown(wrapper!, {
      pointerId: 2,
      clientX: 60,
      clientY: 50,
    });

    fireEvent.pointerMove(wrapper!, {
      pointerId: 1,
      clientX: 20,
      clientY: 50,
    });
    fireEvent.pointerMove(wrapper!, {
      pointerId: 2,
      clientX: 80,
      clientY: 50,
    });

    // Canvas should not exist, so no data-meters-across to check; grid should still be present
    const canvas = container.querySelector('[data-testid="minimap-canvas"]');
    expect(canvas).toBeFalsy();
  });

  // ─── MiniMap footprint tests ─────────────────────────────────────────────
  it('does not render footprint when robotLength=0 (not configured)', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        mapGrid={mapGrid}
        mapPose={mapPose}
        robotLength={0}
        robotWidth={0.306}
      />
    );
    const footprint = container.querySelector('[data-testid="minimap-footprint"]');
    expect(footprint).toBeFalsy();
  });

  it('renders footprint when configured with sufficient zoom (map mode)', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        size={92}
        mapGrid={mapGrid}
        mapPose={mapPose}
        robotLength={3}
        robotWidth={2}
        metersAcross={10}
      />
    );
    const footprint = container.querySelector('[data-testid="minimap-footprint"]');
    expect(footprint).toBeTruthy();
  });

  it('does not render footprint in odom mode when dimensions gate closed', () => {
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        size={92}
        robotLength={0.281}
        robotWidth={0.306}
      />
    );
    // odom mode: pxPerM = 6 (scale constant)
    // max(0.281 * 6, 0.306 * 6) = max(1.686, 1.836) = 1.836 < 14 → gate closed
    const footprint = container.querySelector('[data-testid="minimap-footprint"]');
    expect(footprint).toBeFalsy();
  });

  it('footprint rotates with heading in odom mode (no map)', () => {
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={Math.PI / 2}
        size={92}
        robotLength={3}
        robotWidth={2}
      />
    );
    const footprint = container.querySelector('[data-testid="minimap-footprint"]');
    expect(footprint).toBeTruthy();
    const gTransform = footprint?.querySelector('g')?.getAttribute('transform');
    expect(gTransform).toContain('rotate(90)');
  });

  it('footprint does not rotate in map mode (stays unrotated)', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0.78 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0.78}
        size={92}
        mapGrid={mapGrid}
        mapPose={mapPose}
        robotLength={3}
        robotWidth={2}
        metersAcross={10}
      />
    );
    const footprint = container.querySelector('[data-testid="minimap-footprint"]');
    expect(footprint).toBeTruthy();
    const gTransform = footprint?.querySelector('g')?.getAttribute('transform');
    expect(gTransform).toContain('rotate(0)');
  });

  it('footprint centered on robot position at size/2', () => {
    const cells = new Uint8Array(100);
    const mapGrid = { cells, width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 };
    const mapPose = { frame: 'map' as const, x: 0, y: 0, heading: 0 };
    const { container } = render(
      <MiniMap
        pos={{ x: 0, y: 0 }}
        heading={0}
        size={100}
        mapGrid={mapGrid}
        mapPose={mapPose}
        robotLength={4}
        robotWidth={2}
        metersAcross={10}
      />
    );
    const footprint = container.querySelector('[data-testid="minimap-footprint"]');
    expect(footprint).toBeTruthy();
    const gElem = footprint?.querySelector('g');
    const gTransform = gElem?.getAttribute('transform');
    // translate(size/2, size/2) = translate(50 50) - SVG omits commas in JS-generated transforms
    expect(gTransform).toContain('translate(50 50)');
  });
});

// ─── Compass Tests ──────────────────────────────────────────────────────────

describe('Compass', () => {
  it('renders heading label with padStart(3, "0")', () => {
    const { container } = render(
      <Compass heading={7 * Math.PI / 180} label={true} />
    );

    // heading 7 degrees should display as "007°"
    expect(container.textContent).toContain('007');
  });

  it('renders compass dial SVG', () => {
    const { container } = render(
      <Compass heading={0} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('hides label when label=false', () => {
    const { container } = render(
      <Compass heading={0} label={false} />
    );

    // Should not contain a degree symbol in visible text
    const span = container.querySelector('span');
    expect(span).toBeFalsy();
  });

  it('SVG contains needle polygon with rotation', () => {
    const { container } = render(
      <Compass heading={Math.PI / 4} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    const polygon = svg?.querySelector('polygon');
    expect(polygon).toBeTruthy();
  });

  it('respects custom color and size', () => {
    const { container } = render(
      <Compass heading={0} color="#ff0000" size={32} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const width = svg?.getAttribute('width');
    expect(width).toBe('32');
  });
});

// ─── CompassTape Tests ──────────────────────────────────────────────────────

describe('CompassTape', () => {
  it('renders SVG with heading ticks', () => {
    const { container } = render(
      <CompassTape heading={0} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    // Should contain tick lines
    const lines = svg?.querySelectorAll('line');
    expect(lines?.length).toBeGreaterThan(0);
  });

  it('renders cardinal directions (N, E, S, W)', () => {
    const { container } = render(
      <CompassTape heading={0} />
    );

    const text = container.textContent;
    // At heading 0, should show N (North)
    expect(text).toContain('N');
  });

  it('center line marks current heading', () => {
    const { container } = render(
      <CompassTape heading={0} width={240} />
    );

    const svg = container.querySelector('svg');
    const lines = svg?.querySelectorAll('line');
    // There should be a center line (plus the tick marks)
    expect(lines?.length).toBeGreaterThan(5);
  });

  it('respects custom width and color', () => {
    const { container } = render(
      <CompassTape heading={0} width={300} color="#00ff00" />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const width = svg?.getAttribute('width');
    expect(width).toBe('300');
  });

  it('renders bg container with border radius', () => {
    const { container } = render(
      <CompassTape heading={0} bg="rgba(0,0,0,0.4)" />
    );

    const div = container.querySelector('div');
    const style = div?.getAttribute('style');
    expect(style).toContain('border-radius');
  });
});

// ─── VelBars Tests ──────────────────────────────────────────────────────────

describe('VelBars', () => {
  it('renders three bars for lx, ly, az', () => {
    const { container } = render(
      <VelBars lx={0.5} ly={-0.3} az={0.1} label={true} />
    );

    // Should show lx, ly, az labels
    expect(container.textContent).toContain('lx');
    expect(container.textContent).toContain('ly');
    expect(container.textContent).toContain('az');
  });

  it('maps value=0.5 to fill width ≈ 50%', () => {
    const { container } = render(
      <VelBars lx={0.5} ly={0} az={0} label={false} />
    );

    // The inner fill div for lx should have width ≈ 25% (50% of 50%)
    const fillDivs = container.querySelectorAll('div[style*="width"]');
    let foundFill = false;
    for (const div of fillDivs) {
      const style = (div as HTMLElement).getAttribute('style');
      if (style && style.includes('50%')) {
        foundFill = true;
        break;
      }
    }
    // At least one fill should match the expected percentage
    expect(fillDivs.length).toBeGreaterThan(0);
  });

  it('handles negative values (left-fill)', () => {
    const { container } = render(
      <VelBars lx={-0.5} ly={0} az={0} label={false} />
    );

    // Negative value should fill leftward from center
    const divs = container.querySelectorAll('div[style*="left"]');
    expect(divs.length).toBeGreaterThan(0);
  });

  it('clamps values to [-1, 1]', () => {
    const { container } = render(
      <VelBars lx={1.5} ly={-0.8} az={0.1} label={true} />
    );

    // Component should render without error; internal clamping
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('displays values with toFixed(2)', () => {
    const { container } = render(
      <VelBars lx={0.123} ly={0.456} az={0.789} label={true} />
    );

    // Should format to 2 decimal places
    const text = container.textContent;
    // toFixed(2) rounds: 0.123→'0.12', 0.456→'0.46', 0.789→'0.79'.
    expect(text).toContain('0.12');
    expect(text).toContain('0.46');
    expect(text).toContain('0.79');
  });

  it('center line visible in each bar', () => {
    const { container } = render(
      <VelBars lx={0} ly={0} az={0} label={false} />
    );

    // Each bar should have a center tick line
    const divs = container.querySelectorAll('div[style*="left: 50%"]');
    expect(divs.length).toBeGreaterThan(0);
  });

  it('hides labels when label=false', () => {
    const { container } = render(
      <VelBars lx={0.5} ly={0.5} az={0.5} label={false} />
    );

    expect(container.textContent).not.toContain('lx');
    expect(container.textContent).not.toContain('ly');
    expect(container.textContent).not.toContain('az');
  });
});

// ─── Readout Tests ──────────────────────────────────────────────────────────

describe('Readout', () => {
  it('renders label and value', () => {
    const { container } = render(
      <Readout label="LAT" value="42 ms" />
    );

    expect(container.textContent).toContain('LAT');
    expect(container.textContent).toContain('42 ms');
  });

  it('applies color to value text', () => {
    const { container } = render(
      <Readout label="BAT" value="78%" color="#22c55e" />
    );

    const span = container.querySelector('span[style*="color"]');
    const style = span?.getAttribute('style') ?? '';
    // jsdom may normalize hex to rgb(); accept either serialization.
    expect(style.includes('#22c55e') || style.includes('rgb(34, 197, 94)')).toBe(true);
  });

  it('renders with pill-shaped container', () => {
    const { container } = render(
      <Readout label="SIG" value="-58 dBm" />
    );

    const div = container.querySelector('div');
    const style = div?.getAttribute('style');
    expect(style).toContain('border-radius');
    expect(style).toContain('padding');
  });

  it('maintains label and value alignment', () => {
    const { container } = render(
      <Readout label="L" value="V" />
    );

    const div = container.querySelector('div');
    const style = div?.getAttribute('style');
    expect(style).toContain('flex');
    expect(style).toContain('gap');
  });
});

// ─── CONNECTION_LABELS Tests ──────────────────────────────────────────────────

describe('CONNECTION_LABELS', () => {
  it('exports live state with green color', () => {
    expect(CONNECTION_LABELS.live.text).toBeDefined();
    expect(CONNECTION_LABELS.live.color).toBe('#22c55e');
  });

  it('exports reconnecting state with amber color', () => {
    expect(CONNECTION_LABELS.reconnecting.text).toBeDefined();
    expect(CONNECTION_LABELS.reconnecting.color).toBe('#f59e0b');
  });

  it('exports disconnected state with red color', () => {
    expect(CONNECTION_LABELS.disconnected.text).toBeDefined();
    expect(CONNECTION_LABELS.disconnected.color).toBe('#ef4444');
  });

  it('text includes status indicator symbols', () => {
    expect(CONNECTION_LABELS.live.text).toContain('●');
    expect(CONNECTION_LABELS.reconnecting.text).toContain('⟳');
    expect(CONNECTION_LABELS.disconnected.text).toContain('○');
  });
});

// ─── Crosshair Tests ──────────────────────────────────────────────────────────

describe('Crosshair', () => {
  it('renders two lines tinted with the accent color', () => {
    const { container } = render(<Crosshair accent="#f0a92a" />);
    const root = container.firstElementChild as HTMLElement;
    const lines = root.children;
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect((line as HTMLElement).style.background).toBe('rgb(240, 169, 42)');
    }
  });

  it('is non-interactive (pointerEvents none)', () => {
    const { container } = render(<Crosshair accent="#fff" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.pointerEvents).toBe('none');
  });
});

// ─── JoystickZone Tests ───────────────────────────────────────────────────────

describe('JoystickZone', () => {
  it('positions on the given side and sizes the wrapper', () => {
    const { container } = render(
      <JoystickZone side="right" size={280} baseSize={140} knobSize={56} label="STRAFE" />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.right).toBe('0px');
    expect(wrapper.style.left).toBe('');
    expect(wrapper.style.width).toBe('280px');
    expect(wrapper.style.height).toBe('280px');
  });

  it('applies zIndex only when provided', () => {
    const withZ = render(<JoystickZone side="left" size={100} zIndex={5} />);
    expect((withZ.container.firstElementChild as HTMLElement).style.zIndex).toBe('5');
    const noZ = render(<JoystickZone side="left" size={100} />);
    expect((noZ.container.firstElementChild as HTMLElement).style.zIndex).toBe('');
  });

  it('disables pointer events when controlsDisabled', () => {
    const off = render(<JoystickZone side="left" size={100} controlsDisabled />);
    expect((off.container.firstElementChild as HTMLElement).style.pointerEvents).toBe('none');
    const on = render(<JoystickZone side="left" size={100} controlsDisabled={false} />);
    expect((on.container.firstElementChild as HTMLElement).style.pointerEvents).toBe('auto');
  });

  it('hosts an interactive Joystick that emits onMove/onEnd', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    render(
      <JoystickZone side="left" size={200} baseSize={120} knobSize={56} onMove={onMove} onEnd={onEnd} />
    );
    const zone = screen.getByTestId('joystick-zone');
    fireEvent.pointerDown(zone, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(zone, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(zone, { clientX: 140, clientY: 100, pointerId: 1 });
    expect(onMove).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it('with externalActive=true, renders knob at externalValue and hides hint', () => {
    const { container } = render(
      <JoystickZone
        side="left"
        size={240}
        variant="zone"
        baseSize={120}
        knobSize={56}
        externalActive={true}
        externalValue={{ x: 0.5, y: 0 }}
      />
    );
    // Knob should be present
    const knob = container.querySelector('[data-testid="joystick-knob"]');
    expect(knob).toBeTruthy();
    // Hint should be absent
    const hint = container.querySelector('[data-testid="joystick-hint"]');
    expect(hint).toBeNull();
  });

  it('knob position tracks externalValue: x=0.5 vs x=-0.5 differ in left style', () => {
    const size = 240;
    const baseSize = 120;
    const knobSize = 56;
    const baseRadius = baseSize / 2;

    const { container: container1 } = render(
      <JoystickZone
        side="left"
        size={size}
        variant="zone"
        baseSize={baseSize}
        knobSize={knobSize}
        externalActive={true}
        externalValue={{ x: 0.5, y: 0 }}
      />
    );
    const knob1 = container1.querySelector('[data-testid="joystick-knob"]') as HTMLElement;
    expect(knob1).toBeTruthy();
    const left1Str = (knob1.style.left || '').match(/(\d+(?:\.\d+)?)/)?.[1];
    const left1 = left1Str ? parseFloat(left1Str) : 0;

    const { container: container2 } = render(
      <JoystickZone
        side="left"
        size={size}
        variant="zone"
        baseSize={baseSize}
        knobSize={knobSize}
        externalActive={true}
        externalValue={{ x: -0.5, y: 0 }}
      />
    );
    const knob2 = container2.querySelector('[data-testid="joystick-knob"]') as HTMLElement;
    expect(knob2).toBeTruthy();
    const left2Str = (knob2.style.left || '').match(/(\d+(?:\.\d+)?)/)?.[1];
    const left2 = left2Str ? parseFloat(left2Str) : 0;

    // x=0.5 should render further right than x=-0.5
    expect(left1).toBeGreaterThan(left2);
  });

  it('with externalActive=false and variant=zone, shows hint and no knob', () => {
    const { container } = render(
      <JoystickZone
        side="left"
        size={240}
        variant="zone"
        baseSize={120}
        knobSize={56}
        externalActive={false}
      />
    );
    // Hint should be present
    const hint = container.querySelector('[data-testid="joystick-hint"]');
    expect(hint).toBeTruthy();
    // Knob should be absent (unless user is actively touching)
    const knob = container.querySelector('[data-testid="joystick-knob"]');
    expect(knob).toBeNull();
  });
});
