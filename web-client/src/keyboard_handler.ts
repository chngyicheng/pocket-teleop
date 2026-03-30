// Maps WASD + arrow keys to robot velocity axes.
// WASD: left joystick (lx = forward/back, az = rotate).
// ArrowLeft/Right: right joystick (ly = strafe).
// ArrowUp/Down: unused.
export interface KeyboardHandlerOptions {
  velocity?: number;        // constant value emitted while key held (default 0.5)
  onTwist: (lx: number, ly: number, az: number) => void;
  onActivity?: () => void;  // fires on any keydown, regardless of enabled state
}

export class KeyboardHandler {
  private readonly velocity: number;
  private readonly onTwistCb: (lx: number, ly: number, az: number) => void;
  private readonly onActivityCb: (() => void) | undefined;
  private readonly keysDown = new Set<string>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private enabled = true;
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp:   (e: KeyboardEvent) => void;

  constructor(options: KeyboardHandlerOptions) {
    this.velocity    = options.velocity ?? 0.5;
    this.onTwistCb   = options.onTwist;
    this.onActivityCb = options.onActivity;

    this.boundKeyDown = (e: KeyboardEvent) => {
      this.keysDown.add(e.key);
      this.onActivityCb?.();
    };
    this.boundKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.key);
    };
  }

  start(): void {
    if (this.intervalId !== null) return;
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup',   this.boundKeyUp);
    this.intervalId = setInterval(() => this.poll(), 200);
  }

  stop(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.boundKeyDown);
      document.removeEventListener('keyup',   this.boundKeyUp);
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.keysDown.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private poll(): void {
    if (!this.enabled) return;
    const v  = this.velocity;
    const lx = this.keysDown.has('w') ? v : this.keysDown.has('s') ? -v : 0;
    const az = this.keysDown.has('a') ? v : this.keysDown.has('d') ? -v : 0;
    const ly = this.keysDown.has('ArrowRight') ? v : this.keysDown.has('ArrowLeft') ? -v : 0;
    this.onTwistCb(lx, ly, az);
  }
}
