/**
 * teleop_client_gamepad_lifecycle.test.ts
 *
 * Hypothesis: Gamepad detection continues even when socket disconnects.
 *
 * The gamepad lifecycle was tied to socket (onClose/handlePongTimeout → stop(),
 * connect/reconnect → start()). If the socket died, the operator's next button
 * press would not activate because the poll loop was stopped.
 *
 * Fix: Gamepad detection (attach/start) runs from constructor, independent of
 * socket. Only the twist/button *transmission* is gated by connection state
 * (setEnabled(true) on connect, setEnabled(false) on close/timeout).
 *
 * Tests:
 * 1. Gamepad detection independent of socket — attach + start called in constructor.
 * 2. Gamepad disabled initially (setEnabled(false) in constructor).
 * 3. onClose does not stop poll loop (setEnabled(false) only).
 * 4. connect enables transmission (setEnabled(true)).
 * 5. handlePongTimeout disables transmission, not poll loop.
 * 6. disconnect calls detach (removes event listeners + stops loop only on explicit disconnect).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { GamepadHandler } from '../src/gamepad_handler.js';

// Mock GamepadHandler so we can spy on its lifecycle methods
let mockGamepadHandlerInstance: {
  attach: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setEnabled: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  setProfile: ReturnType<typeof vi.fn>;
};

let capturedSend: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedCallbacks: any;

vi.mock('../src/gamepad_handler.js', () => ({
  GamepadHandler: vi.fn().mockImplementation((options: any) => {
    mockGamepadHandlerInstance = {
      attach: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      setEnabled: vi.fn(),
      detach: vi.fn(),
      setProfile: vi.fn(),
    };
    // Store the options for later inspection if needed
    (mockGamepadHandlerInstance as any).options = options;
    return mockGamepadHandlerInstance;
  }),
}));

vi.mock('../src/connection.js', () => ({
  Connection: vi.fn().mockImplementation((callbacks: any) => {
    capturedSend = vi.fn();
    capturedCallbacks = callbacks;
    return {
      connect: vi.fn(() => callbacks.onOpen?.()),
      disconnect: vi.fn(() => callbacks.onClose?.(1000, 'client disconnect')),
      send: (...args: unknown[]) => capturedSend(...args),
    };
  }),
}));

describe('teleop_client_gamepad_lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should attach and start gamepad detection in constructor, then disable transmission', () => {
    const client = new TeleopClient();

    // Constructor must call attach(), start(), and setEnabled(false) immediately.
    expect(mockGamepadHandlerInstance.attach).toHaveBeenCalled();
    expect(mockGamepadHandlerInstance.start).toHaveBeenCalled();
    expect(mockGamepadHandlerInstance.setEnabled).toHaveBeenCalledWith(false);
  });

  it('should enable transmission on connect', () => {
    const client = new TeleopClient();

    // Reset the spy to clear constructor calls
    mockGamepadHandlerInstance.setEnabled.mockClear();

    client.connect('ws://localhost:9090/ws');

    // connect() should enable transmission
    expect(mockGamepadHandlerInstance.setEnabled).toHaveBeenCalledWith(true);
  });

  it('should disable transmission on socket close, but keep detection running', () => {
    const onClose = vi.fn();
    const client = new TeleopClient({ onClose });

    client.connect('ws://localhost:9090/ws');

    // Reset the spy to isolate the onClose effect
    mockGamepadHandlerInstance.setEnabled.mockClear();
    mockGamepadHandlerInstance.stop.mockClear();

    // Simulate socket close via the mocked connection callback
    capturedCallbacks.onClose?.(1000, 'server closed');

    // onClose should NOT call stop() — detection keeps running.
    expect(mockGamepadHandlerInstance.stop).not.toHaveBeenCalled();
    // But transmission should be disabled.
    expect(mockGamepadHandlerInstance.setEnabled).toHaveBeenCalledWith(false);
  });

  it('should disable transmission on pong timeout, but keep detection running', () => {
    const onClose = vi.fn();
    const client = new TeleopClient({
      keepaliveIntervalMs: 200,
      onClose,
    });

    client.connect('ws://localhost:9090/ws');

    // Reset the spy to isolate the pong timeout effect
    mockGamepadHandlerInstance.setEnabled.mockClear();
    mockGamepadHandlerInstance.stop.mockClear();

    // Trigger pong timeout by advancing time without replying to pings
    vi.advanceTimersByTime(1000);

    // handlePongTimeout should NOT call stop() — detection keeps running.
    expect(mockGamepadHandlerInstance.stop).not.toHaveBeenCalled();
    // But transmission should be disabled.
    expect(mockGamepadHandlerInstance.setEnabled).toHaveBeenCalledWith(false);
    // And onClose should fire to trigger reconnect
    expect(onClose).toHaveBeenCalled();
  });

  it('should ensure gamepad loop remains running across socket reconnects', () => {
    // This is a sanity check: after connect/disconnect/connect cycles,
    // the gamepad handler's attach() and start() should have been called
    // in constructor and remain active (setEnabled gates transmission, not loop).
    const client = new TeleopClient();

    // Verify constructor called attach() and start()
    expect(mockGamepadHandlerInstance.attach).toHaveBeenCalled();
    expect(mockGamepadHandlerInstance.start).toHaveBeenCalled();

    // connect() calls setEnabled(true)
    client.connect('ws://localhost:9090/ws');
    expect(mockGamepadHandlerInstance.setEnabled).toHaveBeenCalledWith(true);

    // Subsequent connect() also calls setEnabled(true)
    mockGamepadHandlerInstance.setEnabled.mockClear();
    client.connect('ws://localhost:9090/ws');
    expect(mockGamepadHandlerInstance.setEnabled).toHaveBeenCalledWith(true);
  });

  it('should detach gamepad on explicit disconnect', () => {
    const client = new TeleopClient();

    client.connect('ws://localhost:9090/ws');

    // Reset the spy to isolate the disconnect effect
    mockGamepadHandlerInstance.detach.mockClear();
    mockGamepadHandlerInstance.stop.mockClear();

    client.disconnect();

    // disconnect() should call detach (which internally calls stop)
    expect(mockGamepadHandlerInstance.detach).toHaveBeenCalled();
    // stop() should NOT be called directly anymore (detach handles it)
    // but detach calls stop internally, so we verify detach was called instead
  });
});
