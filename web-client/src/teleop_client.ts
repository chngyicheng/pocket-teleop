import { Connection } from './connection.js';
import { GamepadHandler } from './gamepad_handler.js';
import type { GamepadProfile } from './gamepad_profiles.js';
import { buildPing, buildTwist, parseMessage } from './protocol.js';

/** Continuous publish rate: one packet every 50 ms → 20 Hz. */
export const PUBLISH_INTERVAL_MS = 50;

/**
 * Number of zero-twist frames sent after a joystick release before the
 * publisher goes silent.  10 × 50 ms = 500 ms of explicit stop.
 */
export const STOP_REPEATS = 10;

export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string, robotName: string, robotNamespace: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
  retryIntervalMs?: number;
  onReconnecting?: (attempt: number) => void;
  onPong?: () => void;
  onLatency?: (ms: number) => void;
  onOdom?: (x: number, y: number, heading: number) => void;
  onButton?: (action: string) => void;
  onTwist?: (lx: number, ly: number, az: number) => void;
  onGamepadActivity?: () => void;
  keepaliveIntervalMs?: number;
  /** Override the continuous-publish tick rate (default: PUBLISH_INTERVAL_MS). */
  publishIntervalMs?: number;
}

export class TeleopClient {
  private readonly connection: Connection;
  private readonly gamepadHandler: GamepadHandler;
  private keepaliveId: ReturnType<typeof setInterval> | null = null;
  private publishId: ReturnType<typeof setInterval> | null = null;
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;
  private pingSentAt = 0;
  private url = '';
  private intentionalDisconnect = false;
  private retryAttempt = 0;
  // Prevents double-scheduling when both onerror and onclose fire (browser behaviour).
  // Node.js 22 native WebSocket only fires onerror for rejected connections, not onclose.
  private retryPending = false;
  private readonly retryIntervalMs: number;
  private readonly keepaliveIntervalMs: number;
  private readonly publishIntervalMs: number;
  private readonly options: TeleopClientOptions;

  // Continuous-publish state
  /** Non-null while a joystick is held; the values to repeat each tick. */
  private repeatTwist: { lx: number; ly: number; az: number } | null = null;
  /** Counts down from STOP_REPEATS after a release, sending zeros each tick. */
  private zeroFramesLeft = 0;

  constructor(options: TeleopClientOptions = {}) {
    this.options = options;
    this.retryIntervalMs = options.retryIntervalMs ?? 5000;
    this.keepaliveIntervalMs = options.keepaliveIntervalMs ?? 200;
    this.publishIntervalMs = options.publishIntervalMs ?? PUBLISH_INTERVAL_MS;
    this.connection = new Connection({
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => { /* retryAttempt is reset in handleMessage on status */ },
      onClose: (code, reason) => {
        this.stopKeepalive();
        this.stopPublisher();
        this.gamepadHandler.stop();
        if (this.intentionalDisconnect) {
          this.options.onClose?.(code, reason);
          return;
        }
        if (!this.retryPending) {
          this.retryPending = true;
          this.scheduleRetry();
        }
      },
      onError: (e) => {
        this.options.onError?.((e as ErrorEvent).message ?? 'connection error');
        // Node.js 22 fires only onerror (not onclose) for rejected connections,
        // so retry must also be triggered here.
        if (!this.intentionalDisconnect && !this.retryPending) {
          this.retryPending = true;
          this.scheduleRetry();
        }
      },
    });
    this.gamepadHandler = new GamepadHandler({
      onTwist:    (lx, ly, az) => this.sendTwist(lx, ly, az),
      onButton:   (action) => this.options.onButton?.(action),
      onActivity: () => this.options.onGamepadActivity?.(),
    });
  }

  connect(url: string): void {
    this.url = url;
    this.intentionalDisconnect = false;
    this.retryAttempt = 0;
    this.retryPending = false;
    // Fresh/reconnected session must not blindly resume stale motion.
    this.repeatTwist = null;
    this.zeroFramesLeft = 0;
    this.connection.connect(url);
    this.startKeepalive();
    this.startPublisher();
    this.gamepadHandler.start();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.stopKeepalive();
    this.stopPublisher();
    this.gamepadHandler.stop();
    this.connection.disconnect();
  }

  setGamepadProfile(profile: GamepadProfile): void {
    this.gamepadHandler.setProfile(profile);
  }

  setGamepadEnabled(enabled: boolean): void {
    this.gamepadHandler.setEnabled(enabled);
  }

  sendTwist(lx: number, ly: number, az: number): void {
    // Immediate one-shot send (existing behaviour, kept for responsiveness)
    this.connection.send(buildTwist(lx, ly, az));
    this.lastSentAt = Date.now();
    this.options.onTwist?.(lx, ly, az);

    // Update continuous-publish state
    if (lx !== 0 || ly !== 0 || az !== 0) {
      // Joystick held: repeat this command on every publisher tick
      this.repeatTwist = { lx, ly, az };
      this.zeroFramesLeft = 0;
    } else {
      // Joystick released: stop repeating and initiate stop burst
      this.repeatTwist = null;
      this.zeroFramesLeft = STOP_REPEATS;
    }
  }

  private handleMessage(raw: string): void {
    const msg = parseMessage(raw);
    if (msg.type === 'status') {
      this.retryAttempt = 0; // fully connected; reset exponential backoff counter
      this.options.onStatus?.(msg.connected, msg.robot_type, msg.robot_name, msg.robot_namespace);
    } else if (msg.type === 'error') {
      this.options.onError?.(msg.message);
    } else if (msg.type === 'pong') {
      if (this.pingSentAt > 0) {
        this.options.onLatency?.(Date.now() - this.pingSentAt);
        this.pingSentAt = 0;
      }
      this.options.onPong?.();
    } else if (msg.type === 'odom') {
      this.options.onOdom?.(msg.x, msg.y, msg.heading);
    }
  }

  private scheduleRetry(): void {
    this.retryAttempt += 1;
    this.options.onReconnecting?.(this.retryAttempt);
    const delay = Math.min(this.retryIntervalMs * 2 ** (this.retryAttempt - 1), 30_000);
    this.retryTimeoutId = setTimeout(() => {
      this.retryTimeoutId = null;
      this.retryPending = false;
      // Reset publish state before reconnecting — do not resume stale motion.
      this.repeatTwist = null;
      this.zeroFramesLeft = 0;
      this.connection.connect(this.url);
      this.startKeepalive();
      this.startPublisher();
      this.gamepadHandler.start();
    }, delay);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.lastSentAt = Date.now();
    this.keepaliveId = setInterval(() => {
      if (Date.now() - this.lastSentAt >= 200) {
        this.pingSentAt = Date.now();
        this.connection.send(buildPing());
        this.lastSentAt = Date.now();
      }
    }, this.keepaliveIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveId !== null) {
      clearInterval(this.keepaliveId);
      this.keepaliveId = null;
    }
  }

  /**
   * Publisher tick: runs every publishIntervalMs while connected.
   *
   * Priority:
   *   1. repeatTwist non-null → resend the held command (continuous 20 Hz)
   *   2. zeroFramesLeft > 0  → send explicit zero (stop burst)
   *   3. otherwise           → silent (keepalive ping still fires separately)
   *
   * The publisher does NOT send pings; that remains the keepalive's job so
   * latency measurement continues to work independently.
   */
  private startPublisher(): void {
    this.stopPublisher();
    this.publishId = setInterval(() => {
      if (this.repeatTwist !== null) {
        const { lx, ly, az } = this.repeatTwist;
        this.connection.send(buildTwist(lx, ly, az));
        this.lastSentAt = Date.now();
      } else if (this.zeroFramesLeft > 0) {
        this.connection.send(buildTwist(0, 0, 0));
        this.zeroFramesLeft -= 1;
        this.lastSentAt = Date.now();
      }
      // else: idle — publisher is silent; keepalive ping fires when needed.
    }, this.publishIntervalMs);
  }

  private stopPublisher(): void {
    if (this.publishId !== null) {
      clearInterval(this.publishId);
      this.publishId = null;
    }
  }
}
