import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest globals are off, so RTL auto-cleanup must be wired explicitly.
// Without this, render() calls accumulate in document.body across tests,
// causing getByLabelText / getByRole queries to find duplicates.
afterEach(cleanup);

// jsdom does not provide MediaStream; useWhepStream tests construct one.
if (typeof globalThis.MediaStream === 'undefined') {
  (globalThis as { MediaStream?: unknown }).MediaStream = class MediaStream {
    getTracks() { return []; }
    getVideoTracks() { return []; }
    getAudioTracks() { return []; }
  };
}

// jsdom does not provide PointerEvent; Joystick zone-variant tests dispatch
// pointer events. Polyfill with a MouseEvent subclass that carries pointerId.
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  };
}

// jsdom does no layout: getBoundingClientRect() returns all-zero, which makes
// Joystick math (clientX / rect.width * size) blow up to Infinity / NaN.
// Derive a rect from the element's inline style.width/height so tests can
// exercise pointer math against realistic dimensions.
if (typeof Element !== 'undefined') {
  const origGetRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const el = this as HTMLElement;
    const w = parseFloat(el.style?.width ?? '') || 0;
    const h = parseFloat(el.style?.height ?? '') || 0;
    if (w > 0 || h > 0) {
      return {
        x: 0, y: 0, top: 0, left: 0, right: w, bottom: h,
        width: w, height: h,
        toJSON() { return {}; },
      } as DOMRect;
    }
    return origGetRect.call(this);
  };
}

// jsdom does not implement Element.setPointerCapture / releasePointerCapture.
// Joystick onPointerDown calls setPointerCapture, which would throw and abort
// the handler before it can set base position. Stub them to no-ops.
if (typeof Element !== 'undefined') {
  const proto = Element.prototype as Element & {
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
    hasPointerCapture?: (id: number) => boolean;
  };
  if (typeof proto.setPointerCapture !== 'function') {
    proto.setPointerCapture = function () {};
  }
  if (typeof proto.releasePointerCapture !== 'function') {
    proto.releasePointerCapture = function () {};
  }
  if (typeof proto.hasPointerCapture !== 'function') {
    proto.hasPointerCapture = function () { return false; };
  }
}
