// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { TouchJoystick } from '../src/touch_joystick.js';

// jsdom 24 exposes TouchEvent but not the Touch constructor — shim it.
if (typeof globalThis.Touch === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).Touch = class Touch {
    identifier: number; target: EventTarget; clientX: number; clientY: number;
    pageX: number; pageY: number; screenX: number; screenY: number;
    radiusX: number; radiusY: number; rotationAngle: number; force: number;
    constructor(init: TouchInit) { Object.assign(this, init); }
  };
}

function makeTouch(target: HTMLElement, clientX: number, clientY: number): Touch {
  return new Touch({ identifier: 1, target, clientX, clientY,
    pageX: clientX, pageY: clientY, screenX: clientX, screenY: clientY,
    radiusX: 0, radiusY: 0, rotationAngle: 0, force: 1 });
}

function fire(el: HTMLElement, type: string, clientX: number, clientY: number): void {
  const touch = makeTouch(el, clientX, clientY);
  el.dispatchEvent(new TouchEvent(type, {
    touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
    changedTouches: [touch],
    bubbles: true,
  }));
}

describe('TouchJoystick', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('joystick base is hidden on init', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('touchstart shows the joystick base', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('block');
  });

  it('onMove fires with normalised values', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchmove', 150, 100); // dx=50, dy=0 → x=1.0, y=0.0
    expect(moves.length).toBe(1);
    expect(moves[0][0]).toBeCloseTo(1.0);
    expect(moves[0][1]).toBeCloseTo(0.0);
  });

  it('values clamp to -1..1 at max radius', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 0, 0);
    fire(container, 'touchmove', 200, 0); // dx=200 >> maxRadius=50 → clamp to x=1.0
    expect(moves[0][0]).toBeCloseTo(1.0);
  });

  it('onEnd fires when finger lifts', () => {
    let ended = false;
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => { ended = true; } });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchend', 100, 100);
    expect(ended).toBe(true);
  });

  it('joystick hides on touchend', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchend', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('joystick hides on touchcancel', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchcancel', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('onMove fires normalised Y values', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchmove', 100, 150); // dx=0, dy=50 → x=0.0, y=1.0
    expect(moves[0][0]).toBeCloseTo(0.0);
    expect(moves[0][1]).toBeCloseTo(1.0);
  });

  it('onMove fires negative normalised values', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchmove', 50, 100); // dx=-50, dy=0 → x=-1.0, y=0.0
    expect(moves[0][0]).toBeCloseTo(-1.0);
    expect(moves[0][1]).toBeCloseTo(0.0);
  });

  it('second touchstart updates origin', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 0, 0);
    fire(container, 'touchend', 0, 0);
    // New origin at (200, 200)
    fire(container, 'touchstart', 200, 200);
    fire(container, 'touchmove', 250, 200); // dx=50 → x=1.0
    expect(moves[0][0]).toBeCloseTo(1.0);
  });
});
