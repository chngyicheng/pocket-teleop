export interface GamepadHandlerOptions {
  intervalMs?: number;
  onTwist: (lx: number, ly: number, az: number) => void;
}

export class GamepadHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly onTwist: (lx: number, ly: number, az: number) => void;

  constructor(options: GamepadHandlerOptions) {
    this.intervalMs = options.intervalMs ?? 200;
    this.onTwist = options.onTwist;
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private poll(): void {
    // navigator is not available in Node.js (test environment) — no-op
    if (typeof navigator === 'undefined') return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads.find((g) => g !== null) ?? null;
    if (gp === null) return;

    // Axis mapping:
    //   linear_x  → left stick Y  (axis 1), inverted
    //   linear_y  → left stick X  (axis 0), inverted
    //   angular_z → right stick X (axis 2), inverted
    const lx = -(gp.axes[1] ?? 0);
    const ly = -(gp.axes[0] ?? 0);
    const az = -(gp.axes[2] ?? 0);

    this.onTwist(lx, ly, az);
  }
}
