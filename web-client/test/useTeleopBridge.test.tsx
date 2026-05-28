import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTeleopBridge, type TeleopBridge } from '../src/hooks/useTeleopBridge.js';
import type { TeleopClientOptions } from '../src/teleop_client.js';

// Fake TeleopClient for testing
class FakeTeleopClient {
  twists: number[][] = [];
  opts: TeleopClientOptions;

  constructor(opts: TeleopClientOptions = {}) {
    this.opts = opts;
  }

  connect(_url: string) {}
  disconnect() {}

  sendTwist(lx: number, ly: number, az: number) {
    this.twists.push([lx, ly, az]);
  }

  setGamepadProfile() {}
  setGamepadEnabled() {}

  // Test helpers
  triggerStatus(connected: boolean, robotType = '', robotName = '', robotNamespace = '') {
    this.opts.onStatus?.(connected, robotType, robotName, robotNamespace);
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

  it('eStop sends zero twist unconditionally', () => {
    const { result } = renderHook(() =>
      useTeleopBridge({
        url: 'ws://localhost/ws',
        TeleopClientCtor: (opts) => { fakeClient.opts = opts; return fakeClient; },
      })
    );

    // eStop should work even when not connected
    expect(result.current.connected).toBe(false);

    act(() => {
      result.current.eStop();
    });

    expect(fakeClient.twists).toEqual([[0, 0, 0]]);
  });

  it('eStop always sends zero twist, even when connected', () => {
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

    expect(fakeClient.twists).toEqual([[0, 0, 0]]);
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
});
