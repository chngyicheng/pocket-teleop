// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';

describe('TeleopClient + KeyboardHandler integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', class MockWebSocket {
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keyboard DOM keydown reaches TeleopClient tagged source="keyboard" after connect', () => {
    // Proves the ctor wiring: KeyboardHandler.onTwist → sendTwist(..., 'keyboard').
    // Drives a real DOM event through a connected client, not a direct sendTwist call.
    const twistCalls: Array<{ lx: number; ly: number; az: number; source: string }> = [];
    const client = new TeleopClient({
      onTwist: (lx, ly, az, source) => twistCalls.push({ lx, ly, az, source }),
    });
    client.connect('ws://test'); // starts + enables the KeyboardHandler

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    vi.advanceTimersByTime(200); // KeyboardHandler poll → onTwist → sendTwist

    expect(twistCalls.length).toBeGreaterThan(0);
    const lastCall = twistCalls[twistCalls.length - 1];
    expect(lastCall.source).toBe('keyboard');
    expect(lastCall.lx).toBeGreaterThan(0); // 'w' → forward, shaped value
    client.disconnect();
  });

  it('gamepad input (priority 3) overrides keyboard (priority 2)', () => {
    const twistCalls: Array<{ lx: number; ly: number; az: number; source: string }> = [];
    const client = new TeleopClient({
      onTwist: (lx, ly, az, source) => twistCalls.push({ lx, ly, az, source }),
    });
    // Keyboard becomes active
    client.sendTwist(0.5, 0, 0, 'keyboard');
    expect(twistCalls[twistCalls.length - 1].source).toBe('keyboard');
    // Gamepad input arrives (higher priority)
    client.sendTwist(0.7, 0, 0, 'gamepad');
    // Arbitration accepts gamepad, rejects keyboard going forward
    expect(twistCalls[twistCalls.length - 1].source).toBe('gamepad');
    // Keyboard input while gamepad is active is rejected
    client.sendTwist(0.6, 0, 0, 'keyboard');
    // Last twist should still be from gamepad
    expect(twistCalls[twistCalls.length - 1].source).toBe('gamepad');
  });

  it('keyboard input (priority 2) overrides touch (priority 1)', () => {
    const twistCalls: Array<{ lx: number; ly: number; az: number; source: string }> = [];
    const client = new TeleopClient({
      onTwist: (lx, ly, az, source) => twistCalls.push({ lx, ly, az, source }),
    });
    // Touch becomes active
    client.sendTwist(0.5, 0, 0, 'touch');
    expect(twistCalls[twistCalls.length - 1].source).toBe('touch');
    // Keyboard input arrives (higher priority)
    client.sendTwist(0.7, 0, 0, 'keyboard');
    // Arbitration accepts keyboard
    expect(twistCalls[twistCalls.length - 1].source).toBe('keyboard');
    // Touch input while keyboard is active is rejected
    client.sendTwist(0.6, 0, 0, 'touch');
    // Last twist should still be from keyboard
    expect(twistCalls[twistCalls.length - 1].source).toBe('keyboard');
  });
});
