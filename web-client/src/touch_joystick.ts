export interface TouchJoystickOptions {
  maxRadius: number;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}

export class TouchJoystick {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private originX = 0;
  private originY = 0;
  private activePointerId: number | null = null;
  private readonly options: TouchJoystickOptions;

  constructor(container: HTMLElement, options: TouchJoystickOptions) {
    this.options = options;

    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.base.style.display = 'none';

    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    container.appendChild(this.base);

    container.addEventListener('pointerdown',   (e) => this.onPointerDown(e));
    container.addEventListener('pointermove',   (e) => this.onPointerMove(e));
    container.addEventListener('pointerup',     (e) => this.onPointerUp(e));
    container.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    // Capture this pointer so pointermove/pointerup always arrive here even if
    // the finger drifts outside the element's bounds.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
    this.activePointerId = null;
    this.base.style.display = 'none';
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.options.onEnd();
  }
}
