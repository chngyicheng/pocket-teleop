// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { TouchJoystick, _activeTouchIds } from '../src/touch_joystick.js';

// jsdom 24 does not expose PointerEvent as a global — shim it.
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).PointerEvent = class PointerEvent extends Event {
    pointerId:   number;
    clientX:     number;
    clientY:     number;
    pointerType: string;
    isPrimary:   boolean;
    constructor(type: string, init: PointerEventInit & EventInit = {}) {
      super(type, init);
      this.pointerId   = init.pointerId   ?? 0;
      this.clientX     = init.clientX     ?? 0;
      this.clientY     = init.clientY     ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.isPrimary   = init.isPrimary   ?? false;
    }
  };
}

function fire(el: HTMLElement, type: string, clientX: number, clientY: number, pointerId = 1): void {
  el.dispatchEvent(new PointerEvent(type, {
    pointerId,
    clientX,
    clientY,
    bubbles: true,
    pointerType: 'touch',
    isPrimary: pointerId === 1,
  }));
}

describe('TouchJoystick', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    _activeTouchIds.clear();
  });

  it('joystick base is hidden on init', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('pointerdown shows the joystick base', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'pointerdown', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('block');
  });

  it('onMove fires with normalised values', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'pointerdown', 100, 100);
    fire(container, 'pointermove', 150, 100); // dx=50, dy=0 → x=1.0, y=0.0
    expect(moves.length).toBe(1);
    expect(moves[0][0]).toBeCloseTo(1.0);
    expect(moves[0][1]).toBeCloseTo(0.0);
  });

  it('values clamp to -1..1 at max radius', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'pointerdown', 0, 0);
    fire(container, 'pointermove', 200, 0); // dx=200 >> maxRadius=50 → clamp to x=1.0
    expect(moves[0][0]).toBeCloseTo(1.0);
  });

  it('onEnd fires when finger lifts', () => {
    let ended = false;
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => { ended = true; } });
    fire(container, 'pointerdown', 100, 100);
    fire(container, 'pointerup',   100, 100);
    expect(ended).toBe(true);
  });

  it('joystick hides on pointerup', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'pointerdown', 100, 100);
    fire(container, 'pointerup',   100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('joystick hides on pointercancel', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'pointerdown',   100, 100);
    fire(container, 'pointercancel', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('onMove fires normalised Y values', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'pointerdown', 100, 100);
    fire(container, 'pointermove', 100, 150); // dx=0, dy=50 → x=0.0, y=1.0
    expect(moves[0][0]).toBeCloseTo(0.0);
    expect(moves[0][1]).toBeCloseTo(1.0);
  });

  it('onMove fires negative normalised values', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'pointerdown', 100, 100);
    fire(container, 'pointermove',  50, 100); // dx=-50, dy=0 → x=-1.0, y=0.0
    expect(moves[0][0]).toBeCloseTo(-1.0);
    expect(moves[0][1]).toBeCloseTo(0.0);
  });

  it('second pointerdown updates origin', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'pointerdown', 0, 0);
    fire(container, 'pointerup',   0, 0);
    // New origin at (200, 200)
    fire(container, 'pointerdown', 200, 200);
    fire(container, 'pointermove', 250, 200); // dx=50 → x=1.0
    expect(moves[0][0]).toBeCloseTo(1.0);
  });

  it('each zone tracks its own pointer independently', () => {
    const containerLeft  = document.createElement('div');
    const containerRight = document.createElement('div');
    document.body.appendChild(containerLeft);
    document.body.appendChild(containerRight);

    const movesLeft: [number, number][] = [];
    new TouchJoystick(containerLeft,  { maxRadius: 50, onMove: (x, y) => movesLeft.push([x, y]), onEnd: () => {} });
    new TouchJoystick(containerRight, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });

    // Each zone receives its own pointerdown with a distinct pointerId.
    fire(containerLeft,  'pointerdown', 100, 100, 1);
    fire(containerRight, 'pointerdown', 300, 300, 2);

    // Left finger moves dx=50 → x=1.0; right joystick must not fire.
    fire(containerLeft, 'pointermove', 150, 100, 1);

    expect(movesLeft.length).toBe(1);
    expect(movesLeft[0][0]).toBeCloseTo(1.0);
    expect(movesLeft[0][1]).toBeCloseTo(0.0);
  });

  it('ignores pointerup for a different pointer identifier', () => {
    let ended = false;
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => { ended = true; } });
    fire(container, 'pointerdown', 100, 100, 1);
    fire(container, 'pointerup',   100, 100, 2); // different pointerId — must be ignored
    expect(ended).toBe(false);
  });

  it('ignores pointerdown fired on an element outside the container', () => {
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    outside.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 1, clientX: 100, clientY: 100, bubbles: true, pointerType: 'touch',
    }));
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('second zone rejects same pointerId already claimed by first zone', () => {
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.appendChild(containerA);
    document.body.appendChild(containerB);
    let activatedB = false;
    new TouchJoystick(containerA, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    new TouchJoystick(containerB, { maxRadius: 50, onMove: () => { activatedB = true; }, onEnd: () => {} });
    fire(containerA, 'pointerdown', 100, 100, 1); // zone A claims pointer 1
    fire(containerB, 'pointerdown', 300, 300, 1); // zone B must reject same pointerId
    fire(containerB, 'pointermove', 350, 300, 1);
    expect(activatedB).toBe(false);
  });
});
