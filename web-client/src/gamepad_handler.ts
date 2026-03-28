import { matchProfile } from './gamepad_profiles.js';
import type { GamepadProfile } from './gamepad_profiles.js';

export type { GamepadProfile };

export interface GamepadHandlerOptions {
  intervalMs?: number;
  onTwist: (lx: number, ly: number, az: number) => void;
  profile?: GamepadProfile;
  onButton?: (action: string) => void;
  onActivity?: () => void;
}

export class GamepadHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly onTwist: (lx: number, ly: number, az: number) => void;
  private readonly onButton: ((action: string) => void) | undefined;
  private readonly onActivity: (() => void) | undefined;
  private profile: GamepadProfile | null;
  private prevButtons: boolean[] = [];
  private enabled = true;

  constructor(options: GamepadHandlerOptions) {
    this.intervalMs  = options.intervalMs ?? 200;
    this.onTwist     = options.onTwist;
    this.onButton    = options.onButton;
    this.onActivity  = options.onActivity;
    this.profile     = options.profile ?? null;
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

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setProfile(profile: GamepadProfile): void {
    this.profile = profile;
  }

  private poll(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads.find((g) => g !== null) ?? null;
    if (gp === null) return;

    if (this.profile === null) {
      this.profile = matchProfile(gp.id);
      console.log(`Gamepad detected: ${gp.id} → profile: ${this.profile.name}`);
    }

    const { lx, ly, az } = this.profile.mapping;
    const lxVal = (gp.axes[lx.axis] ?? 0) * (lx.invert ? -1 : 1);
    const lyVal = (gp.axes[ly.axis] ?? 0) * (ly.invert ? -1 : 1);
    const azVal = (gp.axes[az.axis] ?? 0) * (az.invert ? -1 : 1);

    // Track button rising edges and detect activity — regardless of enabled state.
    // This ensures a button press while touch is active still switches back to gamepad.
    let hasButtonActivity = false;
    const risingEdgeActions: string[] = [];
    for (const [action, buttonIndex] of Object.entries(this.profile.buttons)) {
      const pressed    = (gp.buttons[buttonIndex]?.pressed) ?? false;
      const wasPressed = this.prevButtons[buttonIndex] ?? false;
      if (pressed && !wasPressed) {
        hasButtonActivity = true;
        risingEdgeActions.push(action);
      }
      this.prevButtons[buttonIndex] = pressed;
    }

    const hasAxisActivity = Math.abs(lxVal) > 0.1 || Math.abs(lyVal) > 0.1 || Math.abs(azVal) > 0.1;
    if (hasAxisActivity || hasButtonActivity) this.onActivity?.();

    if (this.enabled) {
      this.onTwist(lxVal, lyVal, azVal);
      for (const action of risingEdgeActions) {
        this.onButton?.(action);
      }
    }
  }
}
