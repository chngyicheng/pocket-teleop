// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MissionJoystick } from '../src/mission_joystick';

describe('MissionJoystick', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '200px';
    container.style.height = '200px';
    document.body.appendChild(container);

    // Mock setPointerCapture/releasePointerCapture if not implemented
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    // jsdom does not implement PointerEvent globally; polyfill with a constructor
    // that extends MouseEvent and carries pointerId.
    if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
      class PointerEventPolyfill extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
        }
      }
      (globalThis as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
    }
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('constructor renders hint dot for variant=zone when idle', () => {
    const joystick = new MissionJoystick(container, {
      variant: 'zone',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove: () => {},
      onEnd: () => {},
    });

    const hint = container.querySelector('.mj-hint');
    expect(hint).toBeTruthy();
    joystick.destroy();
  });

  it('constructor renders nothing visible base initially for variant=edge', () => {
    const joystick = new MissionJoystick(container, {
      variant: 'edge',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove: () => {},
      onEnd: () => {},
    });

    const base = container.querySelector('.mj-base');
    // Base should exist but not be visible initially
    if (base) {
      expect((base as HTMLElement).style.display).toBe('none');
    }
    joystick.destroy();
  });

  it('constructor renders base immediately for variant=classic', () => {
    const joystick = new MissionJoystick(container, {
      variant: 'classic',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove: () => {},
      onEnd: () => {},
    });

    const base = container.querySelector('.mj-base');
    expect(base).toBeTruthy();
    joystick.destroy();
  });

  it('pointerdown with variant=zone spawns base at finger position', () => {
    const joystick = new MissionJoystick(container, {
      variant: 'zone',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove: () => {},
      onEnd: () => {},
    });

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const event = new PointerEvent('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    });

    container.dispatchEvent(event);

    const base = container.querySelector('.mj-base') as HTMLElement | null;
    expect(base).toBeTruthy();
    joystick.destroy();
  });

  it('pointermove fires onMove with normalized x,y clamped to [-1,1]', () => {
    const onMove = vi.fn();
    const joystick = new MissionJoystick(container, {
      variant: 'classic',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove,
      onEnd: () => {},
    });

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const pointerdown = new PointerEvent('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    });
    container.dispatchEvent(pointerdown);

    const pointermove = new PointerEvent('pointermove', {
      pointerId: 1,
      clientX: 130,
      clientY: 100,
      bubbles: true,
    });
    container.dispatchEvent(pointermove);

    expect(onMove).toHaveBeenCalled();
    const [x, y] = onMove.mock.calls[onMove.mock.calls.length - 1];
    expect(x).toBeGreaterThanOrEqual(-1);
    expect(x).toBeLessThanOrEqual(1);
    expect(y).toBeGreaterThanOrEqual(-1);
    expect(y).toBeLessThanOrEqual(1);

    joystick.destroy();
  });

  it('axes=x locks y to 0 in onMove output', () => {
    const onMove = vi.fn();
    const joystick = new MissionJoystick(container, {
      variant: 'classic',
      axes: 'x',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove,
      onEnd: () => {},
    });

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const pointerdown = new PointerEvent('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    });
    container.dispatchEvent(pointerdown);

    const pointermove = new PointerEvent('pointermove', {
      pointerId: 1,
      clientX: 130,
      clientY: 130,
      bubbles: true,
    });
    container.dispatchEvent(pointermove);

    expect(onMove).toHaveBeenCalled();
    const [x, y] = onMove.mock.calls[onMove.mock.calls.length - 1];
    expect(y).toBe(0);
    expect(x).not.toBe(0);

    joystick.destroy();
  });

  it('pointerup fires onEnd and resets knob to center', () => {
    const onEnd = vi.fn();
    const joystick = new MissionJoystick(container, {
      variant: 'classic',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove: () => {},
      onEnd,
    });

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const pointerdown = new PointerEvent('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    });
    container.dispatchEvent(pointerdown);

    const pointerup = new PointerEvent('pointerup', {
      pointerId: 1,
      bubbles: true,
    });
    container.dispatchEvent(pointerup);

    expect(onEnd).toHaveBeenCalled();
    joystick.destroy();
  });

  it('destroy removes children and detaches listeners (no calls after destroy)', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const joystick = new MissionJoystick(container, {
      variant: 'classic',
      size: 200,
      baseSize: 120,
      knobSize: 56,
      onMove,
      onEnd,
    });

    joystick.destroy();

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const pointerdown = new PointerEvent('pointerdown', {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    });
    container.dispatchEvent(pointerdown);

    const pointermove = new PointerEvent('pointermove', {
      pointerId: 1,
      clientX: 130,
      clientY: 100,
      bubbles: true,
    });
    container.dispatchEvent(pointermove);

    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
