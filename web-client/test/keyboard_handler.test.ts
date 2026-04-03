// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardHandler } from '../src/keyboard_handler.js';

describe('KeyboardHandler', () => {
  let twistCalls: Array<{ lx: number; ly: number; az: number }>;
  let activityCount: number;
  let handler: KeyboardHandler;

  beforeEach(() => {
    twistCalls = [];
    activityCount = 0;
    vi.useFakeTimers();
    handler = new KeyboardHandler({
      velocity: 0.5,
      onTwist: (lx, ly, az) => twistCalls.push({ lx, ly, az }),
      onActivity: () => { activityCount += 1; },
    });
    handler.start();
  });

  afterEach(() => {
    handler.stop();
    vi.useRealTimers();
  });

  it('W key produces positive lx', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls).toHaveLength(1);
    expect(twistCalls[0]).toEqual({ lx: 0.5, ly: 0, az: 0 });
  });

  it('S key produces negative lx', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[0]).toEqual({ lx: -0.5, ly: 0, az: 0 });
  });

  it('A key produces positive az (turn left = CCW)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[0]).toEqual({ lx: 0, ly: 0, az: 0.5 });
  });

  it('D key produces negative az (turn right = CW)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[0]).toEqual({ lx: 0, ly: 0, az: -0.5 });
  });

  it('ArrowLeft key produces negative ly (strafe left)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[0]).toEqual({ lx: 0, ly: -0.5, az: 0 });
  });

  it('ArrowRight key produces positive ly (strafe right)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[0]).toEqual({ lx: 0, ly: 0.5, az: 0 });
  });

  it('ArrowUp and ArrowDown are ignored', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[0]).toEqual({ lx: 0, ly: 0, az: 0 });
  });

  it('multiple keys held simultaneously combine axes', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[0]).toEqual({ lx: 0.5, ly: 0, az: -0.5 });
  });

  it('key release returns axis to zero', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls[1]).toEqual({ lx: 0, ly: 0, az: 0 });
  });

  it('setEnabled(false) suppresses onTwist', () => {
    handler.setEnabled(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls).toHaveLength(0);
  });

  it('setEnabled(false) does not suppress onActivity', () => {
    handler.setEnabled(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    expect(activityCount).toBe(1);
  });

  it('stop() detaches listeners — no events fire after stop', () => {
    handler.stop();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls).toHaveLength(0);
    expect(activityCount).toBe(0);
  });
});
