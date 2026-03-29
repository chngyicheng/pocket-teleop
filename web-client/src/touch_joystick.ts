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
  private activeTouchId: number | null = null;
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

    container.addEventListener('touchstart',  (e) => this.onTouchStart(e),  { passive: true });
    container.addEventListener('touchmove',   (e) => this.onTouchMove(e),   { passive: true });
    container.addEventListener('touchend',    (e) => this.onTouchEnd(e),    { passive: true });
    container.addEventListener('touchcancel', (e) => this.onTouchEnd(e),    { passive: true });
  }

  private onTouchStart(e: TouchEvent): void {
    if (this.activeTouchId !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    this.activeTouchId = touch.identifier;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.originX = touch.clientX - rect.left;
    this.originY = touch.clientY - rect.top;
    this.base.style.display = 'block';
    this.base.style.position = 'absolute';
    this.base.style.left = `${this.originX}px`;
    this.base.style.top  = `${this.originY}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private onTouchMove(e: TouchEvent): void {
    if (this.activeTouchId === null) return;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === this.activeTouchId);
    if (!touch) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = (touch.clientX - rect.left) - this.originX;
    const dy = (touch.clientY - rect.top)  - this.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = dist > this.options.maxRadius ? this.options.maxRadius / dist : 1;
    const cdx = dx * scale;
    const cdy = dy * scale;
    this.knob.style.transform = `translate(calc(-50% + ${cdx}px), calc(-50% + ${cdy}px))`;
    this.options.onMove(cdx / this.options.maxRadius, cdy / this.options.maxRadius);
  }

  private onTouchEnd(e: TouchEvent): void {
    if (this.activeTouchId === null) return;
    const ended = Array.from(e.changedTouches).find(t => t.identifier === this.activeTouchId);
    if (!ended) return;
    this.activeTouchId = null;
    this.base.style.display = 'none';
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.options.onEnd();
  }
}
