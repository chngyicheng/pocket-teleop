export interface MissionJoystickOptions {
  variant: 'classic' | 'edge' | 'zone';
  axes?: 'xy' | 'x' | 'y';     // default 'xy'
  size: number;                 // total zone size in px
  baseSize: number;             // base diameter in px (knob max distance = baseSize/2)
  knobSize: number;             // knob diameter in px
  baseColor?: string;
  ringColor?: string;
  knobColor?: string;
  label?: string;
  onMove: (x: number, y: number) => void;  // x, y in [-1, 1]
  onEnd: () => void;
}

export class MissionJoystick {
  private readonly container: HTMLElement;
  private readonly opts: MissionJoystickOptions;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly hint: HTMLDivElement | null;
  private readonly label: HTMLDivElement | null;
  private pointerIdRef: number | null = null;
  private active = false;
  private center = { x: 0, y: 0 };
  private knobPos = { x: 0, y: 0 };
  private onPointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private onPointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  private onPointerUpHandler: ((e: PointerEvent) => void) | null = null;

  constructor(container: HTMLElement, opts: MissionJoystickOptions) {
    this.container = container;
    this.opts = { axes: 'xy', ...opts };

    // Set container styles
    container.style.position = 'relative';
    container.style.width = `${opts.size}px`;
    container.style.height = `${opts.size}px`;
    container.style.touchAction = 'none';
    container.style.userSelect = 'none';

    // Initialize center position (will change for zone variant)
    this.center = { x: opts.size / 2, y: opts.size / 2 };

    // Create base element (class: mj-base)
    this.base = document.createElement('div');
    this.base.className = 'mj-base';
    this.base.style.position = 'absolute';
    this.base.style.width = `${opts.baseSize}px`;
    this.base.style.height = `${opts.baseSize}px`;
    this.base.style.borderRadius = '50%';
    this.base.style.background = opts.baseColor || 'rgba(255,255,255,0.06)';
    this.base.style.border = `2px solid ${opts.ringColor || 'rgba(255,255,255,0.25)'}`;
    this.base.style.pointerEvents = 'none';
    if (opts.variant === 'classic') {
      this.base.style.display = 'block';
    } else {
      this.base.style.display = 'none';
    }
    this.updateBasePosition();
    container.appendChild(this.base);

    // Create knob element (class: mj-knob)
    this.knob = document.createElement('div');
    this.knob.className = 'mj-knob';
    this.knob.style.position = 'absolute';
    this.knob.style.width = `${opts.knobSize}px`;
    this.knob.style.height = `${opts.knobSize}px`;
    this.knob.style.borderRadius = '50%';
    this.knob.style.background = opts.knobColor || 'rgba(255,255,255,0.55)';
    this.knob.style.pointerEvents = 'none';
    this.updateKnobPosition();
    this.base.appendChild(this.knob);

    // Create hint (only for edge/zone variants)
    if (opts.variant === 'edge' || opts.variant === 'zone') {
      this.hint = document.createElement('div');
      this.hint.className = 'mj-hint';
      this.hint.style.position = 'absolute';
      this.hint.style.left = '50%';
      this.hint.style.top = '50%';
      this.hint.style.width = '52px';
      this.hint.style.height = '52px';
      this.hint.style.borderRadius = '50%';
      this.hint.style.border = `2px solid ${opts.ringColor || 'rgba(255,255,255,0.25)'}`;
      this.hint.style.transform = 'translate(-50%, -50%)';
      this.hint.style.opacity = '0.5';
      this.hint.style.pointerEvents = 'none';
      this.hint.style.display = this.active ? 'none' : 'flex';
      this.hint.style.alignItems = 'center';
      this.hint.style.justifyContent = 'center';

      const dot = document.createElement('div');
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.style.borderRadius = '50%';
      dot.style.background = opts.ringColor || 'rgba(255,255,255,0.25)';
      dot.style.opacity = '0.7';
      this.hint.appendChild(dot);
      container.appendChild(this.hint);
    } else {
      this.hint = null;
    }

    // Create label (if provided)
    if (opts.label) {
      this.label = document.createElement('div');
      this.label.className = 'mj-label';
      this.label.textContent = opts.label;
      this.label.style.position = 'absolute';
      this.label.style.bottom = '6px';
      this.label.style.left = '0';
      this.label.style.right = '0';
      this.label.style.textAlign = 'center';
      this.label.style.fontSize = '9px';
      this.label.style.fontWeight = '600';
      this.label.style.color = opts.ringColor || 'rgba(255,255,255,0.25)';
      this.label.style.letterSpacing = '0.15em';
      this.label.style.textTransform = 'uppercase';
      this.label.style.opacity = this.active ? '0' : '0.6';
      this.label.style.pointerEvents = 'none';
      container.appendChild(this.label);
    } else {
      this.label = null;
    }

    // Attach pointer event listeners to container
    this.onPointerDownHandler = (e) => this.handlePointerDown(e);
    this.onPointerMoveHandler = (e) => this.handlePointerMove(e);
    this.onPointerUpHandler = (e) => this.handlePointerUp(e);

    container.addEventListener('pointerdown', this.onPointerDownHandler);
    container.addEventListener('pointermove', this.onPointerMoveHandler);
    container.addEventListener('pointerup', this.onPointerUpHandler);
    container.addEventListener('pointercancel', this.onPointerUpHandler);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.pointerIdRef !== null) return;

    e.preventDefault();

    try {
      this.container.setPointerCapture(e.pointerId);
    } catch (_) {
      // setPointerCapture may not be available in test environments
    }

    this.pointerIdRef = e.pointerId;
    this.active = true;
    this.updateVisibility();

    const rect = this.container.getBoundingClientRect();

    if (this.opts.variant === 'zone') {
      // Base spawns where finger lands (in local coords)
      const localX = ((e.clientX - rect.left) / rect.width) * this.opts.size;
      const localY = ((e.clientY - rect.top) / rect.height) * this.opts.size;
      this.center = { x: localX, y: localY };
      this.knobPos = { x: 0, y: 0 };
    } else {
      // Classic / edge: base centered
      this.center = { x: this.opts.size / 2, y: this.opts.size / 2 };
      this.updateKnobFromEvent(e);
    }

    this.updateBasePosition();
    this.updateKnobPosition();
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.pointerIdRef !== e.pointerId) return;
    this.updateKnobFromEvent(e);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.pointerIdRef !== e.pointerId) return;

    try {
      this.container.releasePointerCapture(e.pointerId);
    } catch (_) {
      // releasePointerCapture may not be available in test environments
    }

    this.pointerIdRef = null;
    this.active = false;
    this.knobPos = { x: 0, y: 0 };
    this.updateVisibility();
    this.updateKnobPosition();
    this.opts.onEnd();
  }

  private updateKnobFromEvent(e: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * this.opts.size;
    const localY = ((e.clientY - rect.top) / rect.height) * this.opts.size;

    const dx = localX - this.center.x;
    const dy = localY - this.center.y;
    const maxR = this.opts.baseSize / 2;
    const dist = Math.hypot(dx, dy);
    const clamp = dist > maxR ? maxR / dist : 1;

    let nx = (dx * clamp) / maxR;
    let ny = (dy * clamp) / maxR;

    if (this.opts.axes === 'x') ny = 0;
    if (this.opts.axes === 'y') nx = 0;

    this.knobPos = { x: nx, y: ny };
    this.updateKnobPosition();
    this.opts.onMove(nx, ny);
  }

  private updateBasePosition(): void {
    const baseRadius = this.opts.baseSize / 2;
    this.base.style.left = `${this.center.x - baseRadius}px`;
    this.base.style.top = `${this.center.y - baseRadius}px`;
  }

  private updateKnobPosition(): void {
    const baseRadius = this.opts.baseSize / 2;
    const offsetX = this.knobPos.x * baseRadius;
    const offsetY = this.knobPos.y * baseRadius;
    this.knob.style.left = `${this.center.x - this.opts.knobSize / 2 + offsetX}px`;
    this.knob.style.top = `${this.center.y - this.opts.knobSize / 2 + offsetY}px`;
  }

  private updateVisibility(): void {
    const showBase = this.opts.variant === 'classic' || this.active;
    this.base.style.display = showBase ? 'block' : 'none';
    this.knob.style.display = showBase ? 'block' : 'none';

    if (this.hint) {
      this.hint.style.display = this.active || this.opts.variant === 'classic' ? 'none' : 'flex';
    }

    if (this.label) {
      this.label.style.opacity = this.active || this.opts.variant === 'classic' ? '0' : '0.6';
    }
  }

  destroy(): void {
    // Remove event listeners
    if (this.onPointerDownHandler) {
      this.container.removeEventListener('pointerdown', this.onPointerDownHandler);
    }
    if (this.onPointerMoveHandler) {
      this.container.removeEventListener('pointermove', this.onPointerMoveHandler);
    }
    if (this.onPointerUpHandler) {
      this.container.removeEventListener('pointerup', this.onPointerUpHandler);
      this.container.removeEventListener('pointercancel', this.onPointerUpHandler);
    }

    // Release pointer capture if active
    if (this.pointerIdRef !== null) {
      try {
        this.container.releasePointerCapture(this.pointerIdRef);
      } catch (_) {
        // Ignore if not captured or not supported
      }
    }

    // Remove DOM children
    this.container.removeChild(this.base);
    if (this.hint) {
      this.container.removeChild(this.hint);
    }
    if (this.label) {
      this.container.removeChild(this.label);
    }

    // Clear references
    this.pointerIdRef = null;
    this.onPointerDownHandler = null;
    this.onPointerMoveHandler = null;
    this.onPointerUpHandler = null;
  }
}
