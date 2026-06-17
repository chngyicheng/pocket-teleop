import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';

describe('TeleopClient input arbitration', () => {
  let client: TeleopClient;
  let onTwistSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Stub WebSocket
    vi.stubGlobal('WebSocket', class MockWebSocket {
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    });

    onTwistSpy = vi.fn();
    client = new TeleopClient({
      onTwist: onTwistSpy,
      publishIntervalMs: 50,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('priority: gamepad(3) > keyboard(2) > touch(1)', () => {
    it('gamepad non-zero accepted when touch already moving', () => {
      // Touch sends first
      client['sendTwist'](0.5, 0.0, 0.0, 'touch');
      expect(onTwistSpy).toHaveBeenCalledOnce();
      expect(onTwistSpy).toHaveBeenCalledWith(expect.any(Number), 0, 0, 'touch');

      onTwistSpy.mockClear();

      // Gamepad interrupts with higher priority
      client['sendTwist'](0.3, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).toHaveBeenCalledOnce();
      expect(onTwistSpy).toHaveBeenCalledWith(expect.any(Number), 0, 0, 'gamepad');
    });

    it('touch non-zero rejected when gamepad already moving', () => {
      // Gamepad sends first
      client['sendTwist'](0.5, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).toHaveBeenCalledOnce();

      onTwistSpy.mockClear();

      // Touch tries to interrupt but is rejected
      client['sendTwist'](0.3, 0.0, 0.0, 'touch');
      expect(onTwistSpy).not.toHaveBeenCalled();
    });

    it('keyboard seizes control from touch', () => {
      // Touch sends first
      client['sendTwist'](0.5, 0.0, 0.0, 'touch');
      expect(onTwistSpy).toHaveBeenCalledOnce();

      onTwistSpy.mockClear();

      // Keyboard (priority 2) interrupts touch (priority 1)
      client['sendTwist'](0.3, 0.0, 0.0, 'keyboard');
      expect(onTwistSpy).toHaveBeenCalledOnce();
      expect(onTwistSpy).toHaveBeenCalledWith(expect.any(Number), 0, 0, 'keyboard');
    });

    it('gamepad seizes control from keyboard', () => {
      // Keyboard sends first
      client['sendTwist'](0.5, 0.0, 0.0, 'keyboard');
      expect(onTwistSpy).toHaveBeenCalledOnce();

      onTwistSpy.mockClear();

      // Gamepad (priority 3) interrupts keyboard (priority 2)
      client['sendTwist'](0.3, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).toHaveBeenCalledOnce();
      expect(onTwistSpy).toHaveBeenCalledWith(expect.any(Number), 0, 0, 'gamepad');
    });
  });

  describe('ownership window and timeout', () => {
    it('same source continues control (within 400ms window)', () => {
      // Touch acquires
      client['sendTwist'](0.5, 0.0, 0.0, 'touch');
      expect(onTwistSpy).toHaveBeenCalledOnce();

      onTwistSpy.mockClear();

      // Touch continues (same source, refreshes window)
      client['sendTwist'](0.6, 0.0, 0.0, 'touch');
      expect(onTwistSpy).toHaveBeenCalledOnce();

      onTwistSpy.mockClear();

      // Touch again
      client['sendTwist'](0.7, 0.0, 0.0, 'touch');
      expect(onTwistSpy).toHaveBeenCalledOnce();
    });

    it('lower source gains control after window expires (>400ms)', () => {
      vi.useFakeTimers();
      try {
        // Gamepad acquires
        vi.setSystemTime(0);
        client['sendTwist'](0.5, 0.0, 0.0, 'gamepad');
        expect(onTwistSpy).toHaveBeenCalledOnce();

        onTwistSpy.mockClear();

        // Advance past 400ms window
        vi.setSystemTime(450);

        // Touch can now acquire (gamepad window expired)
        client['sendTwist'](0.3, 0.0, 0.0, 'touch');
        expect(onTwistSpy).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('release: zero-input from owner', () => {
    it('owner sending zero releases control, allows lower source', () => {
      // Gamepad acquires
      client['sendTwist'](0.5, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).toHaveBeenCalledOnce();

      onTwistSpy.mockClear();

      // Gamepad sends zero (release)
      client['sendTwist'](0.0, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).toHaveBeenCalledOnce(); // Accepted, triggers zero burst

      onTwistSpy.mockClear();

      // Now touch can acquire
      client['sendTwist'](0.3, 0.0, 0.0, 'touch');
      expect(onTwistSpy).toHaveBeenCalledOnce();
      expect(onTwistSpy).toHaveBeenCalledWith(expect.any(Number), 0, 0, 'touch');
    });

    it('non-owner zero input is rejected', () => {
      // Gamepad acquires
      client['sendTwist'](0.5, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).toHaveBeenCalledOnce();

      onTwistSpy.mockClear();

      // Touch tries to send zero (should not stop gamepad)
      client['sendTwist'](0.0, 0.0, 0.0, 'touch');
      expect(onTwistSpy).not.toHaveBeenCalled(); // Rejected

      onTwistSpy.mockClear();

      // Gamepad still active
      client['sendTwist'](0.4, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).toHaveBeenCalledOnce();
    });
  });

  describe('e-stop interaction', () => {
    it('e-stop suppresses all motion regardless of source', () => {
      client['engageEstop']();

      // Gamepad try send motion
      client['sendTwist'](0.5, 0.0, 0.0, 'gamepad');
      expect(onTwistSpy).not.toHaveBeenCalled();

      // Touch try send motion
      client['sendTwist'](0.3, 0.0, 0.0, 'touch');
      expect(onTwistSpy).not.toHaveBeenCalled();
    });
  });

  describe('connect() resets arbitration state', () => {
    it('new connection clears ownership', () => {
      vi.useFakeTimers();
      try {
        // Gamepad acquires
        vi.setSystemTime(0);
        client['sendTwist'](0.5, 0.0, 0.0, 'gamepad');
        expect(onTwistSpy).toHaveBeenCalledOnce();

        onTwistSpy.mockClear();

        // Simulate reconnect
        client['connect']('ws://test');

        // After reconnect, gamepad window is cleared
        // Touch should be able to acquire immediately
        client['sendTwist'](0.3, 0.0, 0.0, 'touch');
        expect(onTwistSpy).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('default source parameter', () => {
    it('sendTwist with no source arg defaults to touch', () => {
      // Call without source parameter (backward compat)
      (client as any).sendTwist(0.5, 0.0, 0.0);
      expect(onTwistSpy).toHaveBeenCalledOnce();
      // Should default to touch and be accepted
      expect(onTwistSpy).toHaveBeenCalledWith(expect.any(Number), 0, 0, 'touch');
    });
  });
});
