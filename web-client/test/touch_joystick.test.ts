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

  it('tracks its own touch by identifier when multiple touches are active', () => {
    const containerLeft = document.createElement('div');
    const containerRight = document.createElement('div');
    document.body.appendChild(containerLeft);
    document.body.appendChild(containerRight);

    const movesLeft: [number, number][] = [];
    new TouchJoystick(containerLeft,  { maxRadius: 50, onMove: (x, y) => movesLeft.push([x, y]), onEnd: () => {} });
    new TouchJoystick(containerRight, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });

    // Left finger starts at (100, 100) — identifier 1
    const t1s = new Touch({ identifier: 1, target: containerLeft,
      clientX: 100, clientY: 100, pageX: 100, pageY: 100,
      screenX: 100, screenY: 100, radiusX: 0, radiusY: 0, rotationAngle: 0, force: 1 });
    containerLeft.dispatchEvent(new TouchEvent('touchstart',
      { touches: [t1s], changedTouches: [t1s], bubbles: true }));

    // Right finger starts at (300, 300) — identifier 2
    const t2s = new Touch({ identifier: 2, target: containerRight,
      clientX: 300, clientY: 300, pageX: 300, pageY: 300,
      screenX: 300, screenY: 300, radiusX: 0, radiusY: 0, rotationAngle: 0, force: 1 });
    containerRight.dispatchEvent(new TouchEvent('touchstart',
      { touches: [t1s, t2s], changedTouches: [t2s], bubbles: true }));

    // Left finger moves to (150, 100) — dx=50 → x=1.0
    // t2 is first in touches[] to expose the [0] bug
    const t1m = new Touch({ identifier: 1, target: containerLeft,
      clientX: 150, clientY: 100, pageX: 150, pageY: 100,
      screenX: 150, screenY: 100, radiusX: 0, radiusY: 0, rotationAngle: 0, force: 1 });
    containerLeft.dispatchEvent(new TouchEvent('touchmove',
      { touches: [t2s, t1m], changedTouches: [t1m], bubbles: true }));

    expect(movesLeft.length).toBe(1);
    expect(movesLeft[0][0]).toBeCloseTo(1.0);
    expect(movesLeft[0][1]).toBeCloseTo(0.0);
  });

  it('ignores touchend for a different touch identifier', () => {
    let ended = false;
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => { ended = true; } });

    const t1 = new Touch({ identifier: 1, target: container,
      clientX: 100, clientY: 100, pageX: 100, pageY: 100,
      screenX: 100, screenY: 100, radiusX: 0, radiusY: 0, rotationAngle: 0, force: 1 });
    container.dispatchEvent(new TouchEvent('touchstart',
      { touches: [t1], changedTouches: [t1], bubbles: true }));

    // A different finger lifts — identifier 2
    const t2 = new Touch({ identifier: 2, target: container,
      clientX: 200, clientY: 200, pageX: 200, pageY: 200,
      screenX: 200, screenY: 200, radiusX: 0, radiusY: 0, rotationAngle: 0, force: 1 });
    container.dispatchEvent(new TouchEvent('touchend',
      { touches: [t1], changedTouches: [t2], bubbles: true }));

    expect(ended).toBe(false);
  });
});
