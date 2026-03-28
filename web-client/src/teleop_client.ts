import { Connection } from './connection.js';
import { GamepadHandler } from './gamepad_handler.js';
import type { GamepadProfile } from './gamepad_profiles.js';
import { buildPing, buildTwist, parseMessage } from './protocol.js';

export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
  onReconnecting?: (attempt: number, maxAttempts: number, delayMs: number) => void;
  onButton?: (action: string) => void;
  onTwist?: (lx: number, ly: number, az: number) => void;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  keepaliveIntervalMs?: number;
}

export class TeleopClient {
  private readonly connection: Connection;
  private readonly gamepadHandler: GamepadHandler;
  private keepaliveId: ReturnType<typeof setInterval> | null = null;
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;
  private url = '';
  private intentionalDisconnect = false;
  private retryAttempt = 0;
  // Prevents double-scheduling when both onerror and onclose fire (browser behaviour).
  // Node.js 22 native WebSocket only fires onerror for rejected connections, not onclose.
  private retryPending = false;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly keepaliveIntervalMs: number;
  private readonly options: TeleopClientOptions;

  constructor(options: TeleopClientOptions = {}) {
    this.options = options;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 2000;
    this.keepaliveIntervalMs = options.keepaliveIntervalMs ?? 200;
    this.connection = new Connection({
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => { /* retryAttempt is reset in handleMessage on status */ },
      onClose: (code, reason) => {
        this.stopKeepalive();
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
      onTwist: (lx, ly, az) => this.sendTwist(lx, ly, az),
      onButton: (action) => this.options.onButton?.(action),
    });
  }

  connect(url: string): void {
    this.url = url;
    this.intentionalDisconnect = false;
    this.retryAttempt = 0;
    this.retryPending = false;
    this.connection.connect(url);
    this.startKeepalive();
    this.gamepadHandler.start();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.stopKeepalive();
    this.gamepadHandler.stop();
    this.connection.disconnect();
  }

  setGamepadProfile(profile: GamepadProfile): void {
    this.gamepadHandler.setProfile(profile);
  }

  sendTwist(lx: number, ly: number, az: number): void {
    this.connection.send(buildTwist(lx, ly, az));
    this.lastSentAt = Date.now();
    this.options.onTwist?.(lx, ly, az);
  }

  private handleMessage(raw: string): void {
    const msg = parseMessage(raw);
    if (msg.type === 'status') {
      this.retryAttempt = 0; // fully connected; reset exponential backoff counter
      this.options.onStatus?.(msg.connected, msg.robot_type);
    } else if (msg.type === 'error') {
      this.options.onError?.(msg.message);
    }
  }

  private scheduleRetry(): void {
    this.retryAttempt += 1;
    if (this.retryAttempt > this.maxRetries) {
      this.options.onClose?.(0, 'max retries exceeded');
      return;
    }
    const delayMs = this.retryBaseDelayMs * Math.pow(2, this.retryAttempt - 1);
    this.options.onReconnecting?.(this.retryAttempt, this.maxRetries, delayMs);
    this.retryTimeoutId = setTimeout(() => {
      this.retryTimeoutId = null;
      this.retryPending = false; // allow next close/error to schedule a retry
      this.connection.connect(this.url);
      this.startKeepalive();
      this.gamepadHandler.start();
    }, delayMs);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.lastSentAt = Date.now();
    this.keepaliveId = setInterval(() => {
      if (Date.now() - this.lastSentAt >= 200) {
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
}
