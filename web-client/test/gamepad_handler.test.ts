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
});
