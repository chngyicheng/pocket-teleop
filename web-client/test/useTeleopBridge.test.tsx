import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTeleopBridge, type TeleopBridge } from '../src/hooks/useTeleopBridge.js';
import type { TeleopClientOptions } from '../src/teleop_client.js';

// Fake TeleopClient for testing
class FakeTeleopClient {
  twists: number[][] = [];
  engageEstopCalls = 0;
  resetEstopCalls = 0;
  maxLinear = 1.0;
  maxAngular = 1.0;
  opts: TeleopClientOptions;

  constructor(opts: TeleopClientOptions = {}) {
    this.opts = opts;
  }

  connect(_url: string) {}
  disconnect() {}

  sendTwist(lx: number, ly: number, az: number) {
    this.twists.push([lx, ly, az]);
  }

  engageEstop() {
    this.engageEstopCalls += 1;
  }

  resetEstop() {
    this.resetEstopCalls += 1;
  }

  setMaxSpeed(maxLinear: number, maxAngular: number) {
    this.maxLinear = maxLinear;
    this.maxAngular = maxAngular;
  }

  setGamepadProfile() {}
  setGamepadEnabled() {}

  // Test helpers
  triggerStatus(connected: boolean, robotType = '', robotName = '', robotNamespace = '', robotLength = 0, robotWidth = 0) {
    this.opts.onStatus?.(connected, robotType, robotName, robotNamespace, robotLength, robotWidth);
  }

  triggerReconnecting(attempt: number) {
    this.opts.onReconnecting?.(attempt);
  }

  triggerLatency(ms: number) {
    this.opts.onLatency?.(ms);
  }

  triggerOdom(x: number, y: number, heading: number) {
    this.opts.onOdom?.(x, y, heading);
  }

  triggerEstopState(engaged: boolean) {
    this.opts.onEstopState?.(engaged);
  }

  triggerMap(resolution: number, width: number, height: number, origin_x: number, origin_y: number, cells: string) {
    this.opts.onMap?.({
      resolution,
      width,
      height,
      origin_x,
      origin_y,
      cells,
    });
  }

  triggerPose(frame: 'map' | 'odom', x: number, y: number, heading: number) {
    this.opts.onPose?.(frame, x, y, heading);
  }

  triggerScan(angle_min: number, angle_increment: number, range_max: number, ranges: number[]) {
    this.opts.onScan?.({
      angle_min,
      angle_increment,
      range_max,
      ranges,
    });
  }

  triggerClose(code: number, reason: string) {
    this.opts.onClose?.(code, reason);
  }

  triggerError(msg: string) {
    this.opts.onError?.(msg);
  }
}

describe('useTeleopBridge', () => {
  let fakeClient: FakeTeleopClient;

  beforeEach(() => {
    fakeClient = new FakeTeleopClient();
  });

  it('initializes with default disconnected state', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    expect(result.current.connected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.retryCount).toBe(0);
    expect(result.current.latencyMs).toBeNull();
    expect(result.current.odom).toBeNull();
    expect(result.current.robotName).toBe('');
    expect(result.current.robotNamespace).toBe('');
    expect(result.current.robotType).toBe('');
  });

  it('onStatus update sets connected and robot info', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerStatus(true, 'differential', 'robot1', '/namespace');
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.connectionState).toBe('live');
    expect(result.current.robotType).toBe('differential');
    expect(result.current.robotName).toBe('robot1');
    expect(result.current.robotNamespace).toBe('/namespace');
  });

  it('onStatus with connected=false sets disconnected state', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerStatus(true, 'diff', 'r1', '/ns');
    });

    expect(result.current.connected).toBe(true);

    act(() => {
      fakeClient.triggerStatus(false, '', '', '');
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('onReconnecting sets reconnecting state and increments retry count', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerReconnecting(1);
    });

    expect(result.current.connectionState).toBe('reconnecting');
    expect(result.current.retryCount).toBe(1);

    act(() => {
      fakeClient.triggerReconnecting(2);
    });

    expect(result.current.retryCount).toBe(2);
  });

  it('onLatency sets latencyMs', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerLatency(42);
    });

    expect(result.current.latencyMs).toBe(42);
  });

  it('onOdom sets odometry data', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerOdom(1.5, 2.5, 0.3);
    });

    expect(result.current.odom).toEqual({ x: 1.5, y: 2.5, heading: 0.3 });
  });

  it('sendTwist calls client.sendTwist', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      result.current.sendTwist(0.1, 0.2, 0.3);
    });

    expect(fakeClient.twists).toEqual([[0.1, 0.2, 0.3]]);
  });

  it('eStop calls client.engageEstop (not sendTwist)', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      result.current.eStop();
    });

    expect(fakeClient.engageEstopCalls).toBe(1);
    // Must NOT send a twist
    expect(fakeClient.twists).toEqual([]);
  });

  it('eStop calls client.engageEstop even when connected', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerStatus(true, 'diff', 'r1', '/ns');
    });

    expect(result.current.connected).toBe(true);

    act(() => {
      result.current.eStop();
    });

    expect(fakeClient.engageEstopCalls).toBe(1);
    expect(fakeClient.twists).toEqual([]);
  });

  it('resetEstop calls client.resetEstop', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      result.current.resetEstop();
    });

    expect(fakeClient.resetEstopCalls).toBe(1);
  });

  it('onEstopState(true) flips estopEngaged to true', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    expect(result.current.estopEngaged).toBe(false);

    act(() => {
      fakeClient.triggerEstopState(true);
    });

    expect(result.current.estopEngaged).toBe(true);
  });

  it('onEstopState(false) flips estopEngaged back to false', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerEstopState(true);
    });
    expect(result.current.estopEngaged).toBe(true);

    act(() => {
      fakeClient.triggerEstopState(false);
    });
    expect(result.current.estopEngaged).toBe(false);
  });

  it('disconnects on unmount', () => {
    const disconnectSpy = { called: false };
    const FakeClientWithSpy = class extends FakeTeleopClient {
      disconnect() {
        disconnectSpy.called = true;
      }
    };

    const { unmount } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: () => new FakeClientWithSpy(),
      })
    );

    unmount();

    expect(disconnectSpy.called).toBe(true);
  });

  it('initializes gamepadTwist and inputSource with defaults', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    expect(result.current.gamepadTwist).toEqual({ lx: 0, ly: 0, az: 0 });
    expect(result.current.inputSource).toBe('idle');
  });

  it('onGamepadActivity + onTwist updates gamepadTwist and inputSource', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.opts.onGamepadActivity?.();
      fakeClient.opts.onTwist?.(0.5, 0, 0.3);
    });

    expect(result.current.gamepadTwist).toEqual({ lx: 0.5, ly: 0, az: 0.3 });
    expect(result.current.inputSource).toBe('gamepad');
  });

  it('sendTwist (touch) sets inputSource to touch and does NOT overwrite gamepadTwist', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.opts.onGamepadActivity?.();
      fakeClient.opts.onTwist?.(0.5, 0, 0.3);
    });

    expect(result.current.gamepadTwist).toEqual({ lx: 0.5, ly: 0, az: 0.3 });
    expect(result.current.inputSource).toBe('gamepad');

    act(() => {
      result.current.sendTwist(0.2, 0, 0);
    });

    expect(result.current.inputSource).toBe('touch');
    expect(result.current.gamepadTwist).toEqual({ lx: 0.5, ly: 0, az: 0.3 });
  });

  it('inputSource reverts to idle after IDLE_MS with no activity', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    // Enable fake timers
    vi.useFakeTimers();

    try {
      act(() => {
        fakeClient.opts.onGamepadActivity?.();
        fakeClient.opts.onTwist?.(0.5, 0, 0.3);
      });

      expect(result.current.inputSource).toBe('gamepad');

      // Advance time past IDLE_MS (400 ms) + interval check (~150 ms) = 600 ms
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(result.current.inputSource).toBe('idle');
      expect(result.current.gamepadTwist).toEqual({ lx: 0.5, ly: 0, az: 0.3 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('initializes maxLinear and maxAngular to 1.0 by default', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    expect(result.current.maxLinear).toBe(1.0);
    expect(result.current.maxAngular).toBe(1.0);
  });

  it('setMaxLinear updates maxLinear state and calls client.setMaxSpeed', () => {
    const fc = new FakeTeleopClient();
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fc.opts = opts; return fc; },
      })
    );

    act(() => {
      result.current.setMaxLinear(0.5);
    });

    expect(result.current.maxLinear).toBe(0.5);
    expect(fc.maxLinear).toBe(0.5);
    expect(fc.maxAngular).toBe(1.0);
  });

  it('setMaxAngular updates maxAngular state and calls client.setMaxSpeed', () => {
    // Clear localStorage before this test to avoid cross-contamination from previous tests
    try {
      localStorage.removeItem('pocket-teleop.max-speed');
    } catch {
      // localStorage unavailable
    }

    const fc = new FakeTeleopClient();
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fc.opts = opts; return fc; },
      })
    );

    act(() => {
      result.current.setMaxAngular(2.0);
    });

    expect(result.current.maxAngular).toBe(2.0);
    expect(fc.maxAngular).toBe(2.0);
    expect(fc.maxLinear).toBe(1.0);
  });

  it('setMaxLinear clamps values to [0.1, 2.0]', () => {
    const fc = new FakeTeleopClient();
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fc.opts = opts; return fc; },
      })
    );

    act(() => {
      result.current.setMaxLinear(3.0); // exceeds max
    });

    expect(result.current.maxLinear).toBe(2.0);

    act(() => {
      result.current.setMaxLinear(0.05); // below min
    });

    expect(result.current.maxLinear).toBe(0.1);
  });

  it('setMaxAngular clamps values to [0.1, 3.0]', () => {
    const fc = new FakeTeleopClient();
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fc.opts = opts; return fc; },
      })
    );

    act(() => {
      result.current.setMaxAngular(4.0); // exceeds max
    });

    expect(result.current.maxAngular).toBe(3.0);

    act(() => {
      result.current.setMaxAngular(0.05); // below min
    });

    expect(result.current.maxAngular).toBe(0.1);
  });

  it('initializes mapGrid, mapPose, and scan to null', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    expect(result.current.mapGrid).toBeNull();
    expect(result.current.mapPose).toBeNull();
    expect(result.current.scan).toBeNull();
  });

  it('onMap decodes RLE and updates mapGrid', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      // "u10" = 10 cells of CELL_UNKNOWN (server token format: letter + run length)
      fakeClient.triggerMap(0.05, 10, 1, -0.25, -0.0, 'u10');
    });

    expect(result.current.mapGrid).not.toBeNull();
    expect(result.current.mapGrid!.cells.length).toBe(10);
    expect(result.current.mapGrid!.width).toBe(10);
    expect(result.current.mapGrid!.height).toBe(1);
    expect(result.current.mapGrid!.resolution).toBe(0.05);
    expect(result.current.mapGrid!.originX).toBe(-0.25);
    expect(result.current.mapGrid!.originY).toBe(-0.0);
    // All cells should be 0 (UNKNOWN)
    for (let i = 0; i < 10; i++) {
      expect(result.current.mapGrid!.cells[i]).toBe(0);
    }
  });

  it('onMap with malformed RLE keeps previous mapGrid', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    // First valid map
    act(() => {
      fakeClient.triggerMap(0.05, 10, 1, -0.25, -0.0, 'u10');
    });

    const firstMapGrid = result.current.mapGrid;
    expect(firstMapGrid).not.toBeNull();

    // Second map with invalid RLE (run sum 9 != 10 cells)
    act(() => {
      fakeClient.triggerMap(0.05, 10, 1, -0.25, -0.0, 'u9');
    });

    // mapGrid should be unchanged
    expect(result.current.mapGrid).toBe(firstMapGrid);
  });

  it('onPose sets mapPose with correct frame', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerPose('map', 1.5, 2.3, 0.785);
    });

    expect(result.current.mapPose).not.toBeNull();
    expect(result.current.mapPose!.frame).toBe('map');
    expect(result.current.mapPose!.x).toBe(1.5);
    expect(result.current.mapPose!.y).toBe(2.3);
    expect(result.current.mapPose!.heading).toBe(0.785);
  });

  it('onPose with odom frame', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerPose('odom', 0.5, -0.1, 1.57);
    });

    expect(result.current.mapPose).not.toBeNull();
    expect(result.current.mapPose!.frame).toBe('odom');
    expect(result.current.mapPose!.x).toBe(0.5);
    expect(result.current.mapPose!.y).toBe(-0.1);
    expect(result.current.mapPose!.heading).toBe(1.57);
  });

  it('onScan sets scan data', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    const ranges = [1.0, 1.5, 2.0, Infinity];
    act(() => {
      fakeClient.triggerScan(-1.57, 0.01, 5.0, ranges);
    });

    expect(result.current.scan).not.toBeNull();
    expect(result.current.scan!.angleMin).toBe(-1.57);
    expect(result.current.scan!.angleIncrement).toBe(0.01);
    expect(result.current.scan!.rangeMax).toBe(5.0);
    expect(result.current.scan!.ranges).toEqual(ranges);
  });

  it('multiple onMap updates replace previous mapGrid', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    // First map: 10x1 grid, all unknown
    act(() => {
      fakeClient.triggerMap(0.05, 10, 1, -0.25, -0.0, 'u10');
    });

    expect(result.current.mapGrid!.width).toBe(10);

    // Second map: 20x2 = 40 cells — 15 free, 15 occupied, 10 unknown
    act(() => {
      fakeClient.triggerMap(0.1, 20, 2, -1.0, -1.0, 'f15o15u10');
    });

    expect(result.current.mapGrid!.width).toBe(20);
    expect(result.current.mapGrid!.height).toBe(2);
    expect(result.current.mapGrid!.resolution).toBe(0.1);
  });

  it('multiple onPose updates replace previous mapPose', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerPose('map', 1.5, 2.3, 0.785);
    });

    expect(result.current.mapPose!.x).toBe(1.5);

    act(() => {
      fakeClient.triggerPose('odom', 5.0, 6.0, 3.14);
    });

    expect(result.current.mapPose!.frame).toBe('odom');
    expect(result.current.mapPose!.x).toBe(5.0);
    expect(result.current.mapPose!.y).toBe(6.0);
    expect(result.current.mapPose!.heading).toBe(3.14);
  });

  it('multiple onScan updates replace previous scan', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerScan(-1.57, 0.01, 5.0, [1.0, 1.5, 2.0]);
    });

    expect(result.current.scan!.ranges.length).toBe(3);

    act(() => {
      fakeClient.triggerScan(-3.14, 0.02, 10.0, [2.0, 3.0, 4.0, 5.0]);
    });

    expect(result.current.scan!.angleMin).toBe(-3.14);
    expect(result.current.scan!.ranges.length).toBe(4);
  });

  it('onClose with code 4001 (session expired) triggers logout', () => {
    const originalWindowLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: {
        ...originalWindowLocation,
        replace: vi.fn(),
      },
      writable: true,
    });

    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    // Set connected state first
    act(() => {
      fakeClient.triggerStatus(true, 'diff', 'r1', '/ns');
    });

    expect(result.current.connected).toBe(true);

    // Trigger session expired close
    act(() => {
      fakeClient.triggerClose(4001, 'session expired');
    });

    // Should have redirected to login
    expect(window.location.replace).toHaveBeenCalledWith('/auth/login');
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.connected).toBe(false);

    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalWindowLocation,
      writable: true,
    });
  });

  it('initializes robotLength and robotWidth to 0 by default', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    expect(result.current.robotLength).toBe(0);
    expect(result.current.robotWidth).toBe(0);
  });

  it('onStatus update sets robotLength and robotWidth', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerStatus(true, 'differential', 'robot1', '/namespace', 0.281, 0.306);
    });

    expect(result.current.robotLength).toBe(0.281);
    expect(result.current.robotWidth).toBe(0.306);
  });

  it('onStatus with missing dimensions defaults to 0', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    act(() => {
      fakeClient.triggerStatus(true, 'differential', 'robot1', '/namespace');
    });

    expect(result.current.robotLength).toBe(0);
    expect(result.current.robotWidth).toBe(0);
  });

  it('onGamepadConnected triggers setGamepadConnected', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    expect(result.current.gamepadConnected).toBe(false);

    act(() => {
      fakeClient.opts.onGamepadConnected?.(true, 'Wireless Gamepad X');
    });

    expect(result.current.gamepadConnected).toBe(true);

    act(() => {
      fakeClient.opts.onGamepadConnected?.(false, null);
    });

    expect(result.current.gamepadConnected).toBe(false);
  });
});
