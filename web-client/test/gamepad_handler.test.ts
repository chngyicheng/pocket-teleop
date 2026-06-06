import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GamepadHandler } from '../src/gamepad_handler.js';
import { matchProfile } from '../src/gamepad_profiles.js';

describe('GamepadHandler.poll — axis remapping', () => {
  let onTwistSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onTwistSpy = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('remaps axes per STANDARD profile: az←axis0, ly←axis2, lx←axis1', () => {
    // Fake gamepad with known axis values
    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0.5, 0.6, 0.7, 0.8],
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    // Stub navigator.getGamepads to return the fake gamepad
    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    // Create handler with matched Xbox profile
    const handler = new GamepadHandler({
      onTwist: onTwistSpy,
      profile: matchProfile('Xbox 360 Controller'),
      intervalMs: 1000,
    });

    // Invoke poll directly (no timers needed)
    (handler as any).poll();

    // Assert: STANDARD mapping after fix:
    // - lx: axis 1, inverted → (axes[1] * -1) = (0.6 * -1) = -0.6
    // - ly: axis 2, inverted → (axes[2] * -1) = (0.7 * -1) = -0.7
    // - az: axis 0, inverted → (axes[0] * -1) = (0.5 * -1) = -0.5
    expect(onTwistSpy).toHaveBeenCalledOnce();
    const [lxArg, lyArg, azArg] = onTwistSpy.mock.calls[0]!;

    expect(lxArg).toBeCloseTo(-0.6, 6);  // forward/back on left-stick Y
    expect(lyArg).toBeCloseTo(-0.7, 6);  // strafe on right-stick X (was left-stick X)
    expect(azArg).toBeCloseTo(-0.5, 6);  // rotate on left-stick X (was right-stick X)
  });

  it('handles deadzone correctly with remapped axes', () => {
    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0.05, 0.05, 0.05, 0.05],  // All below 0.1 deadzone
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    const handler = new GamepadHandler({
      onTwist: onTwistSpy,
      profile: matchProfile('Xbox 360 Controller'),
      intervalMs: 1000,
    });

    (handler as any).poll();

    // Should still call onTwist even with small values (deadzone is in caller, not handler)
    expect(onTwistSpy).toHaveBeenCalledOnce();
  });

  describe('button rising-edge detection (estop on LB)', () => {
    it('detects rising edge: profile with estop:4, button goes false→true', () => {
      const onButtonSpy = vi.fn();
      const fakeGp = {
        id: 'Xbox 360 Controller',
        axes: [0, 0, 0, 0],
        buttons: [
          { pressed: false },
          { pressed: false },
          { pressed: false },
          { pressed: false },
          { pressed: true },   // button 4 (LB) pressed
        ],
        connected: true,
        mapping: 'standard',
        index: 0,
        timestamp: 0,
      };

      vi.stubGlobal('navigator', {
        getGamepads: () => [fakeGp],
      });

      const handler = new GamepadHandler({
        onTwist: vi.fn(),
        onButton: onButtonSpy,
        profile: matchProfile('Xbox 360 Controller'),
        intervalMs: 1000,
      });

      // First poll: button goes from undefined→true (rising edge)
      (handler as any).poll();
      expect(onButtonSpy).toHaveBeenCalledWith('estop');
    });

    it('no second call on same button press held down', () => {
      const onButtonSpy = vi.fn();
      const fakeGp = {
        id: 'Xbox 360 Controller',
        axes: [0, 0, 0, 0],
        buttons: [
          { pressed: false },
          { pressed: false },
          { pressed: false },
          { pressed: false },
          { pressed: true },   // button 4 (LB) held
        ],
        connected: true,
        mapping: 'standard',
        index: 0,
        timestamp: 0,
      };

      vi.stubGlobal('navigator', {
        getGamepads: () => [fakeGp],
      });

      const handler = new GamepadHandler({
        onTwist: vi.fn(),
        onButton: onButtonSpy,
        profile: matchProfile('Xbox 360 Controller'),
        intervalMs: 1000,
      });

      // First poll: rising edge
      (handler as any).poll();
      expect(onButtonSpy).toHaveBeenCalledTimes(1);

      // Second poll: button still pressed, no new rising edge
      (handler as any).poll();
      expect(onButtonSpy).toHaveBeenCalledTimes(1);
    });

    it('rising edge again after button released and re-pressed', () => {
      const onButtonSpy = vi.fn();
      const fakeGp = {
        id: 'Xbox 360 Controller',
        axes: [0, 0, 0, 0],
        buttons: [
          { pressed: false },
          { pressed: false },
          { pressed: false },
          { pressed: false },
          { pressed: true },   // initially pressed
        ],
        connected: true,
        mapping: 'standard',
        index: 0,
        timestamp: 0,
      };

      vi.stubGlobal('navigator', {
        getGamepads: () => [fakeGp],
      });

      const handler = new GamepadHandler({
        onTwist: vi.fn(),
        onButton: onButtonSpy,
        profile: matchProfile('Xbox 360 Controller'),
        intervalMs: 1000,
      });

      // First poll: rising edge
      (handler as any).poll();
      expect(onButtonSpy).toHaveBeenCalledTimes(1);

      // Release button
      fakeGp.buttons[4]!.pressed = false;
      (handler as any).poll();
      expect(onButtonSpy).toHaveBeenCalledTimes(1);  // No new call on release

      // Re-press
      fakeGp.buttons[4]!.pressed = true;
      (handler as any).poll();
      expect(onButtonSpy).toHaveBeenCalledTimes(2);  // Rising edge again
    });

    it('button-exists guard: skips missing button in profile', () => {
      const onButtonSpy = vi.fn();
      const fakeGp = {
        id: 'Xbox 360 Controller',
        axes: [0, 0, 0, 0],
        buttons: [],  // no buttons array, shorter than profile expects
        connected: true,
        mapping: 'standard',
        index: 0,
        timestamp: 0,
      };

      vi.stubGlobal('navigator', {
        getGamepads: () => [fakeGp],
      });

      const handler = new GamepadHandler({
        onTwist: vi.fn(),
        onButton: onButtonSpy,
        profile: matchProfile('Xbox 360 Controller'),
        intervalMs: 1000,
      });

      // Poll: profile has estop:4 but gamepad.buttons is empty
      (handler as any).poll();

      // onButton should NOT be called (guard prevents phantom press)
      expect(onButtonSpy).not.toHaveBeenCalledWith('estop');
    });
  });
});

describe('GamepadHandler — detection decouple: loop resilience + events + attach/detach', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  it('loop self-heals: poll() throw does not kill rAF loop', () => {
    const onTwistSpy = vi.fn();
    const onTwistFail = vi.fn(() => {
      throw new Error('onTwist failed');
    });

    // Use real timers but manually drive rAF via runAllTimers
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0.5, 0.6, 0.7, 0.8],
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    const handler = new GamepadHandler({
      onTwist: onTwistFail,  // Will throw on first poll
      profile: matchProfile('Xbox 360 Controller'),
      intervalMs: 50,
    });

    handler.start();

    // First tick: poll() fires and throws — rAF loop should still reschedule
    vi.advanceTimersByTime(50);
    expect(onTwistFail).toHaveBeenCalledTimes(1);

    // Change callback to working spy
    (handler as any).onTwist = onTwistSpy;

    // Second tick: loop continued despite throw
    vi.advanceTimersByTime(50);
    expect(onTwistSpy).toHaveBeenCalledTimes(1);  // Loop survived

    handler.stop();
    vi.useRealTimers();
  });

  it('gamepadconnected listener: event triggers profile match + starts loop', () => {
    const onTwistSpy = vi.fn();

    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0.5, 0, 0, 0],
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    // Stub getGamepads to return gamepad
    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    // Stub window to capture listeners
    const listeners: Record<string, Function[]> = {};
    vi.stubGlobal('window', {
      addEventListener: (event: string, callback: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
      },
      removeEventListener: vi.fn(),
    });

    const handler = new GamepadHandler({
      onTwist: onTwistSpy,
      intervalMs: 50,
    });

    handler.attach();

    // Verify listeners attached
    expect(listeners['gamepadconnected']).toBeDefined();
    expect(listeners['gamepaddisconnected']).toBeDefined();

    // Fire gamepadconnected event with fake gamepad
    const gamepadEvent = { gamepad: fakeGp } as any as GamepadEvent;
    listeners['gamepadconnected']?.[0]?.(gamepadEvent);

    // Handler should have matched profile and started loop
    expect((handler as any).profile).not.toBeNull();

    // Advance time to trigger poll
    vi.advanceTimersByTime(50);
    expect(onTwistSpy).toHaveBeenCalled();

    handler.detach();
    vi.useRealTimers();
  });

  it('gamepaddisconnected listener: clears prevButtons, does not throw', () => {
    const onTwistSpy = vi.fn();
    let addEventListenerCalls: Array<[string, Function]> = [];

    vi.useFakeTimers();

    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0, 0, 0, 0],
      buttons: [{ pressed: true }],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    const listeners: Record<string, Function[]> = {};
    vi.stubGlobal('window', {
      addEventListener: (event: string, callback: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
        addEventListenerCalls.push([event, callback]);
      },
      removeEventListener: vi.fn(),
    });

    const handler = new GamepadHandler({
      onTwist: onTwistSpy,
      onButton: vi.fn(),
      intervalMs: 50,
    });

    handler.attach();

    // Manually trigger a poll to populate prevButtons
    (handler as any).poll();

    // Verify prevButtons was set (indirectly by checking poll executed)
    expect(onTwistSpy).toHaveBeenCalled();

    // Fire gamepaddisconnected
    const gamepaddisconnectedListener = listeners['gamepaddisconnected']?.[0];
    expect(gamepaddisconnectedListener).toBeDefined();
    gamepaddisconnectedListener?.(new Event('gamepaddisconnected'));

    // After disconnect, prevButtons should be cleared (test verifies no throw)
    expect(() => {
      gamepaddisconnectedListener?.(new Event('gamepaddisconnected'));
    }).not.toThrow();

    handler.detach();
  });

  it('detach removes listeners and stops loop', () => {
    const onTwistSpy = vi.fn();
    let removeEventListenerCalls: Array<[string, Function]> = [];

    vi.useFakeTimers();

    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0.5, 0, 0, 0],
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    const listeners: Record<string, Function[]> = {};
    vi.stubGlobal('window', {
      addEventListener: (event: string, callback: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
      },
      removeEventListener: (event: string, callback: Function) => {
        removeEventListenerCalls.push([event, callback]);
      },
    });

    const handler = new GamepadHandler({
      onTwist: onTwistSpy,
      intervalMs: 50,
    });

    handler.attach();
    handler.start();

    // Verify listening
    expect(listeners['gamepadconnected']).toBeDefined();

    // Detach: should remove listeners + stop loop
    handler.detach();

    // Verify removeEventListener was called
    expect(removeEventListenerCalls.some(([e]) => e === 'gamepadconnected')).toBe(true);
    expect(removeEventListenerCalls.some(([e]) => e === 'gamepaddisconnected')).toBe(true);

    // Loop should be stopped; advance timers and verify no new polls
    const initialCallCount = onTwistSpy.mock.calls.length;
    vi.runOnlyPendingTimers();
    expect(onTwistSpy.mock.calls.length).toBe(initialCallCount);  // No new calls
  });

  it('enabled false: still calls onActivity but not onTwist/onButton', () => {
    const onTwistSpy = vi.fn();
    const onActivitySpy = vi.fn();

    vi.useFakeTimers();

    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0.5, 0, 0, 0],  // Axis activity
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    const handler = new GamepadHandler({
      onTwist: onTwistSpy,
      onActivity: onActivitySpy,
      profile: matchProfile('Xbox 360 Controller'),
      intervalMs: 1000,
    });

    handler.setEnabled(false);
    (handler as any).poll();

    // onActivity should fire (axis > 0.1)
    expect(onActivitySpy).toHaveBeenCalledTimes(1);

    // onTwist should NOT fire (disabled)
    expect(onTwistSpy).not.toHaveBeenCalled();
  });

  // NEW RED TEST 1: poll-path connection fire
  it('poll-path connection fire: no event, poll detects gamepad → onConnectionChange(true, id)', () => {
    const onConnectionChangeSpy = vi.fn();

    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0, 0, 0, 0],
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    vi.stubGlobal('navigator', {
      getGamepads: () => [fakeGp],
    });

    const handler = new GamepadHandler({
      onTwist: vi.fn(),
      onConnectionChange: onConnectionChangeSpy,
      profile: matchProfile('Xbox 360 Controller'),
      intervalMs: 1000,
    });

    // First poll: gp !== null, connectedId === null → fire connection change
    (handler as any).poll();
    expect(onConnectionChangeSpy).toHaveBeenCalledOnce();
    expect(onConnectionChangeSpy).toHaveBeenCalledWith(true, 'Xbox 360 Controller');

    // Verify isConnected
    expect(handler.isConnected()).toBe(true);

    // Second poll (same device): should NOT re-fire
    (handler as any).poll();
    expect(onConnectionChangeSpy).toHaveBeenCalledOnce();  // Still 1, not 2
  });

  // NEW RED TEST 2: poll-path disconnect fire
  it('poll-path disconnect fire: gp found, then getGamepads returns null → onConnectionChange(false, null)', () => {
    const onConnectionChangeSpy = vi.fn();

    const fakeGp = {
      id: 'Xbox 360 Controller',
      axes: [0, 0, 0, 0],
      buttons: [],
      connected: true,
      mapping: 'standard',
      index: 0,
      timestamp: 0,
    };

    let returnGp = true;
    vi.stubGlobal('navigator', {
      getGamepads: () => (returnGp ? [fakeGp] : [null]),
    });

    const handler = new GamepadHandler({
      onTwist: vi.fn(),
      onConnectionChange: onConnectionChangeSpy,
      profile: matchProfile('Xbox 360 Controller'),
      intervalMs: 1000,
    });

    // First poll: gp found → fire connect
    (handler as any).poll();
    expect(onConnectionChangeSpy).toHaveBeenCalledWith(true, 'Xbox 360 Controller');

    // Change getGamepads to return null
    returnGp = false;

    // Second poll: gp === null → fire disconnect
    (handler as any).poll();
    expect(onConnectionChangeSpy).toHaveBeenCalledWith(false, null);
    expect(onConnectionChangeSpy).toHaveBeenCalledTimes(2);

    // Verify isConnected
    expect(handler.isConnected()).toBe(false);

    // Third poll (still null): should NOT re-fire disconnect
    (handler as any).poll();
    expect(onConnectionChangeSpy).toHaveBeenCalledTimes(2);
  });

  // NEW RED TEST 3: attach idempotent
  it('attach idempotent: multiple calls do not re-register listeners', () => {
    let addEventListenerCount = 0;

    vi.stubGlobal('window', {
      addEventListener: (event: string) => {
        if (event === 'gamepadconnected') {
          addEventListenerCount++;
        }
      },
      removeEventListener: vi.fn(),
    });

    const handler = new GamepadHandler({
      onTwist: vi.fn(),
      intervalMs: 50,
    });

    // First attach
    handler.attach();
    expect(addEventListenerCount).toBe(1);

    // Second attach (should be no-op)
    handler.attach();
    expect(addEventListenerCount).toBe(1);  // Still 1, not 2

    // Third attach (should be no-op)
    handler.attach();
    expect(addEventListenerCount).toBe(1);  // Still 1, not 3
  });
});
