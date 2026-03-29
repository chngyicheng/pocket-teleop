// Tracks which pointer IDs are currently owned by a TouchJoystick instance.
// Prevents two zones from claiming the same pointerId when a browser reuses IDs.
// Exported for test teardown only — do not use in production code.
export const _activeTouchIds = new Set<number>();

export interface TouchJoystickOptions {
  maxRadius: number;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}

export class TouchJoystick {
  private readonly container: HTMLElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private originX = 0;
  private originY = 0;
  private activePointerId: number | null = null;
  private readonly options: TouchJoystickOptions;

  constructor(container: HTMLElement, options: TouchJoystickOptions) {
    this.container = container;
    this.options = options;

    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.base.style.display = 'none';

    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    container.appendChild(this.base);

    // Listen on document rather than the container element.
    // This avoids setPointerCapture, which can cause Brave to route
    // a second finger's pointerdown to the capturing element — corrupting the
    // second joystick's origin.  Instead, onPointerDown uses e.target to route
    // each event to the correct zone, and _activeTouchIds prevents two zones
    // from claiming the same pointerId when a browser reuses IDs.
    document.addEventListener('pointerdown',   (e) => this.onPointerDown(e));
    document.addEventListener('pointermove',   (e) => this.onPointerMove(e));
    document.addEventListener('pointerup',     (e) => this.onPointerUp(e));
    document.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.activePointerId !== null) return;
    // Reject events whose target is not within this zone.
    if (!this.container.contains(e.target as Node)) return;
    // Reject a pointerId already owned by another zone.
    if (_activeTouchIds.has(e.pointerId)) return;
    this.activePointerId = e.pointerId;
    _activeTouchIds.add(e.pointerId);
    const rect = this.container.getBoundingClientRect();
    this.originX = e.clientX - rect.left;
    this.originY = e.clientY - rect.top;
    this.base.style.display = 'block';
    this.base.style.position = 'absolute';
    this.base.style.left = `${this.originX}px`;
    this.base.style.top  = `${this.originY}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;
    const rect = this.container.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - this.originX;
    const dy = (e.clientY - rect.top)  - this.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = dist > this.options.maxRadius ? this.options.maxRadius / dist : 1;
    const cdx = dx * scale;
    const cdy = dy * scale;
    this.knob.style.transform = `translate(calc(-50% + ${cdx}px), calc(-50% + ${cdy}px))`;
    this.options.onMove(cdx / this.options.maxRadius, cdy / this.options.maxRadius);
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;
    _activeTouchIds.delete(e.pointerId);
    this.activePointerId = null;
    this.base.style.display = 'none';
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.options.onEnd();
  }
}
