import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/connection.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
  })),
}));

import { TeleopClient } from '../src/teleop_client.js';

describe('TeleopClient nav methods (estop gating + always-send)', () => {
  let client: TeleopClient;
  let capturedSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new TeleopClient();
    capturedSend = (client as any).connection.send;
    capturedSend.mockClear();
  });

  describe('sendNavGoal', () => {
    it('sends nav_goal and returns true when estop not engaged', () => {
      const result = client.sendNavGoal(10, 20, 1.57);

      expect(result).toBe(true);
      expect(capturedSend).toHaveBeenCalled();
      const call = capturedSend.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      const msg = JSON.parse(call);
      expect(msg.type).toBe('nav_goal');
      expect(msg.x).toBe(10);
      expect(msg.y).toBe(20);
      expect(msg.heading).toBe(1.57);
    });

    it('does not send nav_goal and returns false when estop engaged', () => {
      (client as any).estopEngaged = true;
      capturedSend.mockClear();

      // Suppress console.warn for test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = client.sendNavGoal(10, 20, 1.57);

      expect(result).toBe(false);
      expect(capturedSend).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith('sendNavGoal blocked: estop engaged');

      warnSpy.mockRestore();
    });
  });

  describe('sendNavPause', () => {
    it('always sends nav_pause (even when estop engaged)', () => {
      (client as any).estopEngaged = true;
      capturedSend.mockClear();

      client.sendNavPause();

      expect(capturedSend).toHaveBeenCalled();
      const call = capturedSend.mock.calls[0]?.[0];
      const msg = JSON.parse(call);
      expect(msg.type).toBe('nav_pause');
    });

    it('sends nav_pause when estop not engaged', () => {
      client.sendNavPause();

      expect(capturedSend).toHaveBeenCalled();
      const call = capturedSend.mock.calls[0]?.[0];
      const msg = JSON.parse(call);
      expect(msg.type).toBe('nav_pause');
    });
  });

  describe('sendNavResume', () => {
    it('sends nav_resume when estop not engaged', () => {
      client.sendNavResume();

      expect(capturedSend).toHaveBeenCalled();
      const call = capturedSend.mock.calls[0]?.[0];
      const msg = JSON.parse(call);
      expect(msg.type).toBe('nav_resume');
    });

    it('does not send nav_resume when estop engaged', () => {
      (client as any).estopEngaged = true;
      capturedSend.mockClear();

      client.sendNavResume();

      expect(capturedSend).not.toHaveBeenCalled();
    });
  });

  describe('sendNavCancel', () => {
    it('always sends nav_cancel (even when estop engaged)', () => {
      (client as any).estopEngaged = true;
      capturedSend.mockClear();

      client.sendNavCancel();

      expect(capturedSend).toHaveBeenCalled();
      const call = capturedSend.mock.calls[0]?.[0];
      const msg = JSON.parse(call);
      expect(msg.type).toBe('nav_cancel');
    });

    it('sends nav_cancel when estop not engaged', () => {
      client.sendNavCancel();

      expect(capturedSend).toHaveBeenCalled();
      const call = capturedSend.mock.calls[0]?.[0];
      const msg = JSON.parse(call);
      expect(msg.type).toBe('nav_cancel');
    });
  });

  describe('handleMessage nav_state callback', () => {
    it('fires onNavState with idle', () => {
      const onNavStateSpy = vi.fn();
      const clientWithCallback = new TeleopClient({ onNavState: onNavStateSpy });

      (clientWithCallback as any).handleMessage('{"type":"nav_state","state":"idle"}');

      expect(onNavStateSpy).toHaveBeenCalledWith('idle');
    });

    it('fires onNavState with active', () => {
      const onNavStateSpy = vi.fn();
      const clientWithCallback = new TeleopClient({ onNavState: onNavStateSpy });

      (clientWithCallback as any).handleMessage('{"type":"nav_state","state":"active"}');

      expect(onNavStateSpy).toHaveBeenCalledWith('active');
    });

    it('fires onNavState with paused', () => {
      const onNavStateSpy = vi.fn();
      const clientWithCallback = new TeleopClient({ onNavState: onNavStateSpy });

      (clientWithCallback as any).handleMessage('{"type":"nav_state","state":"paused"}');

      expect(onNavStateSpy).toHaveBeenCalledWith('paused');
    });

    it('fires onNavState with succeeded', () => {
      const onNavStateSpy = vi.fn();
      const clientWithCallback = new TeleopClient({ onNavState: onNavStateSpy });

      (clientWithCallback as any).handleMessage('{"type":"nav_state","state":"succeeded"}');

      expect(onNavStateSpy).toHaveBeenCalledWith('succeeded');
    });

    it('fires onNavState with failed', () => {
      const onNavStateSpy = vi.fn();
      const clientWithCallback = new TeleopClient({ onNavState: onNavStateSpy });

      (clientWithCallback as any).handleMessage('{"type":"nav_state","state":"failed"}');

      expect(onNavStateSpy).toHaveBeenCalledWith('failed');
    });
  });

  describe('handleMessage nav_path callback', () => {
    it('fires onNavPath with points', () => {
      const onNavPathSpy = vi.fn();
      const clientWithCallback = new TeleopClient({ onNavPath: onNavPathSpy });

      (clientWithCallback as any).handleMessage('{"type":"nav_path","points":[[1.0,2.0],[3.5,4.5]]}');

      expect(onNavPathSpy).toHaveBeenCalledWith([
        [1.0, 2.0],
        [3.5, 4.5],
      ]);
    });

    it('fires onNavPath with empty array', () => {
      const onNavPathSpy = vi.fn();
      const clientWithCallback = new TeleopClient({ onNavPath: onNavPathSpy });

      (clientWithCallback as any).handleMessage('{"type":"nav_path","points":[]}');

      expect(onNavPathSpy).toHaveBeenCalledWith([]);
    });
  });
});
