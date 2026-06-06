import { matchProfile } from './gamepad_profiles.js';
import type { GamepadProfile } from './gamepad_profiles.js';

export type { GamepadProfile };

export interface GamepadHandlerOptions {
  intervalMs?: number;
  onTwist: (lx: number, ly: number, az: number) => void;
  profile?: GamepadProfile;
  onButton?: (action: string) => void;
  onActivity?: () => void;
  onConnectionChange?: (connected: boolean, id: string | null) => void;
}

export class GamepadHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private running = false;
  private lastPollAt = 0;
  private readonly intervalMs: number;
  private readonly onTwist: (lx: number, ly: number, az: number) => void;
  private readonly onButton: ((action: string) => void) | undefined;
  private readonly onActivity: (() => void) | undefined;
  private readonly onConnectionChange: ((connected: boolean, id: string | null) => void) | undefined;
  private profile: GamepadProfile | null;
  private prevButtons: boolean[] = [];
  private enabled = true;
  private connectedId: string | null = null;
  private listeners: Map<string, (e: Event) => void> = new Map();

  constructor(options: GamepadHandlerOptions) {
    this.intervalMs  = options.intervalMs ?? 50;
    this.onTwist     = options.onTwist;
    this.onButton    = options.onButton;
    this.onActivity  = options.onActivity;
    this.onConnectionChange = options.onConnectionChange;
    this.profile     = options.profile ?? null;
  }

  /**
   * Polling MUST be driven by requestAnimationFrame: Chrome only refreshes the
   * snapshots returned by navigator.getGamepads() in sync with the rAF/compositor
   * loop. Reading from a bare setInterval (off the rAF loop) returns STALE state —
   * a held, unchanging stick reads neutral, so motion only registers while the
   * stick is actively moving (the "wiggle to keep it alive" bug). The rAF loop
   * keeps the buffer fresh; we throttle the actual poll to intervalMs (~20 Hz).
   * setInterval is kept only as a fallback for environments without rAF.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastPollAt = 0;

    if (typeof requestAnimationFrame === 'function') {
      const loop = (): void => {
        try {
          if (!this.running) return;
          const now = Date.now();
          if (now - this.lastPollAt >= this.intervalMs) {
            this.lastPollAt = now;
            this.poll();
          }
        } catch (e) {
          console.error('GamepadHandler.poll() error:', e);
        } finally {
          if (this.running) {
            this.rafId = requestAnimationFrame(loop);
          }
        }
      };
      this.rafId = requestAnimationFrame(loop);
    } else {
      this.intervalId = setInterval(() => {
        try {
          this.poll();
        } catch (e) {
          console.error('GamepadHandler.poll() error:', e);
        }
      }, this.intervalMs);
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
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

  /**
   * Attach to window gamepadconnected/gamepaddisconnected events for automatic
   * profile detection and loop lifecycle. SSR-safe; no-op if window is undefined.
   * Idempotent: multiple calls do not re-register listeners.
   */
  attach(): void {
    if (typeof window === 'undefined') return;

    // Idempotent guard: if already attached, do not re-register listeners
    if (this.listeners.size > 0) return;

    const onConnected = (e: Event) => {
      const event = e as GamepadEvent;
      if (event.gamepad) {
        // Always match profile if null (may be called before first poll)
        if (this.profile === null) {
          this.profile = matchProfile(event.gamepad.id);
          console.log(`Gamepad detected: ${event.gamepad.id} → profile: ${this.profile.name}`);
        }
        // Update connection state; avoid redundant fire if already set to this id
        if (this.connectedId !== event.gamepad.id) {
          this.connectedId = event.gamepad.id;
          this.onConnectionChange?.(true, this.connectedId);
        }
      }
      if (!this.running) {
        this.start();
      }
    };

    const onDisconnected = (e: Event) => {
      const event = e as GamepadEvent;
      if (event.gamepad?.index === 0) {
        this.prevButtons = [];  // Clear state on disconnect
        this.connectedId = null;
        this.onConnectionChange?.(false, null);
      }
    };

    // Store listeners for cleanup
    this.listeners.set('gamepadconnected', onConnected);
    this.listeners.set('gamepaddisconnected', onDisconnected);

    window.addEventListener('gamepadconnected', onConnected);
    window.addEventListener('gamepaddisconnected', onDisconnected);
  }

  /**
   * Detach from window events and stop the poll loop.
   */
  detach(): void {
    if (typeof window === 'undefined') return;

    const onConnected = this.listeners.get('gamepadconnected');
    const onDisconnected = this.listeners.get('gamepaddisconnected');

    if (onConnected) {
      window.removeEventListener('gamepadconnected', onConnected);
    }
    if (onDisconnected) {
      window.removeEventListener('gamepaddisconnected', onDisconnected);
    }

    this.listeners.clear();
    this.stop();
  }

  /**
   * Query connection state.
   */
  isConnected(): boolean {
    return this.connectedId !== null;
  }

  private poll(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads.find((g) => g !== null) ?? null;

    // Centrally manage connection state via poll path:
    // - if gp !== null and connectedId changed, update connection state
    // - if gp === null and was previously connected, fire disconnect
    if (gp !== null) {
      if (this.connectedId !== gp.id) {
        this.connectedId = gp.id;
        this.onConnectionChange?.(true, gp.id);
      }
      // Lazy-init profile if not set (e.g., gp already attached before event fired)
      if (this.profile === null) {
        this.profile = matchProfile(gp.id);
        console.log(`Gamepad detected: ${gp.id} → profile: ${this.profile.name}`);
      }
    } else {
      // gp === null: device lost
      if (this.connectedId !== null) {
        this.connectedId = null;
        this.onConnectionChange?.(false, null);
        this.prevButtons = [];  // Clear button state on disconnect
      }
      return;
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
      // Skip buttons that don't exist on this gamepad (prevents phantom presses)
      if (gp.buttons[buttonIndex] === undefined) {
        continue;
      }
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
