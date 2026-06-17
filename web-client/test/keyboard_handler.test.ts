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

  it('setEnabled(false) suppresses onActivity', () => {
    handler.setEnabled(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    expect(activityCount).toBe(0);
  });

  it('when disabled, neither onActivity nor onTwist fires for keydown or keyup', () => {
    handler.setEnabled(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    expect(activityCount).toBe(0);
    expect(twistCalls).toHaveLength(0);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
    expect(activityCount).toBe(0);
    expect(twistCalls).toHaveLength(0);
  });

  it('stop() detaches listeners — no events fire after stop', () => {
    handler.stop();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(twistCalls).toHaveLength(0);
    expect(activityCount).toBe(0);
  });

  it('fires zero twist immediately on last key-up (no poll wait)', () => {
    // vi.useFakeTimers() is active — no timer advance means no poll fires.
    // Any twist here comes exclusively from the key-up handler, not the poll.
    const twists: [number, number, number][] = [];
    const kh = new KeyboardHandler({ onTwist: (lx, ly, az) => twists.push([lx, ly, az]) });
    kh.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    expect(twists).toHaveLength(1);
    expect(twists[0]).toEqual([0, 0, 0]);
    kh.stop();
  });

  it('fires updated twist on key-up mid-combo (e.g. w+d, release w)', () => {
    const twists: [number, number, number][] = [];
    const kh = new KeyboardHandler({ velocity: 1, onTwist: (lx, ly, az) => twists.push([lx, ly, az]) });
    kh.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    twists.length = 0;
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    // w released, d still held: lx=0, az=-1
    expect(twists).toHaveLength(1);
    expect(twists[0]).toEqual([0, 0, -1]);
    kh.stop();
  });

  it('fires updated twist on key-up mid-combo (ly axis: ArrowRight+w, release ArrowRight)', () => {
    const twists: [number, number, number][] = [];
    const kh = new KeyboardHandler({ velocity: 1, onTwist: (lx, ly, az) => twists.push([lx, ly, az]) });
    kh.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    // ArrowRight released, w still held: lx=1, ly=0, az=0
    expect(twists).toHaveLength(1);
    expect(twists[0]).toEqual([1, 0, 0]);
    kh.stop();
  });

  it('does not fire on key-up when disabled', () => {
    const twists: [number, number, number][] = [];
    const kh = new KeyboardHandler({ onTwist: (lx, ly, az) => twists.push([lx, ly, az]) });
    kh.start();
    kh.setEnabled(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    twists.length = 0;
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    expect(twists).toHaveLength(0);
    kh.stop();
  });

  it('does not register key when input element is focused (editable-field guard)', () => {
    const twists: [number, number, number][] = [];
    const kh = new KeyboardHandler({ onTwist: (lx, ly, az) => twists.push([lx, ly, az]) });
    kh.start();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    // Poll fires and sends zero (because 'w' was not registered due to guard)
    expect(twists).toHaveLength(1);
    expect(twists[0]).toEqual([0, 0, 0]);
    document.body.removeChild(input);
    kh.stop();
  });

  it('does not register key when contentEditable element is focused', () => {
    const twists: [number, number, number][] = [];
    const kh = new KeyboardHandler({ onTwist: (lx, ly, az) => twists.push([lx, ly, az]) });
    kh.start();
    const div = document.createElement('div');
    // Set contentEditable via setAttribute to ensure it's properly recognized
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    vi.advanceTimersByTime(200);
    // Poll fires and sends zero (because 'w' was not registered due to guard)
    expect(twists).toHaveLength(1);
    expect(twists[0]).toEqual([0, 0, 0]);
    document.body.removeChild(div);
    kh.stop();
  });
});
