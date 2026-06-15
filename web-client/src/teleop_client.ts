import { Connection } from './connection.js';
import { GamepadHandler } from './gamepad_handler.js';
import type { GamepadProfile } from './gamepad_profiles.js';
import { buildEstop, buildEstopReset, buildPing, buildTwist, parseMessage, type ScanPose } from './protocol.js';
import { shapeAxis } from './input_shaping.js';

/** Continuous publish rate: one packet every 50 ms → 20 Hz. */
const PUBLISH_INTERVAL_MS = 50;

/**
 * Number of zero-twist frames sent after a joystick release before the
 * publisher goes silent.  10 × 50 ms = 500 ms of explicit stop.
 */
const STOP_REPEATS = 10;

export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string, robotName: string, robotNamespace: string, robotLength: number, robotWidth: number, disconnectAction: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
  retryIntervalMs?: number;
  onReconnecting?: (attempt: number) => void;
  onPong?: () => void;
  onLatency?: (ms: number) => void;
  onOdom?: (x: number, y: number, heading: number) => void;
  onPose?: (frame: 'map' | 'odom', x: number, y: number, heading: number) => void;
  onMap?: (map: { resolution: number; width: number; height: number; origin_x: number; origin_y: number; cells: string }) => void;
  onScan?: (scan: { angle_min: number; angle_increment: number; range_max: number; ranges: number[]; pose?: ScanPose }) => void;
  onBattery?: (battery: { percentage: number | null; voltage: number | null; current: number | null; charging: boolean }) => void;
  onButton?: (action: string) => void;
  onTwist?: (lx: number, ly: number, az: number) => void;
  onGamepadActivity?: () => void;
  onGamepadConnected?: (connected: boolean, id: string | null) => void;
  onEstopState?: (engaged: boolean) => void;
  keepaliveIntervalMs?: number;
  /** Override the continuous-publish tick rate (default: PUBLISH_INTERVAL_MS). */
  publishIntervalMs?: number;
  /**
   * Consecutive unanswered pings before the link is treated as a zombie and
   * torn down (onClose + reconnect). Default: 3.
   */
  maxMissedPongs?: number;
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
  private readonly maxMissedPongs: number;
  private readonly options: TeleopClientOptions;

  // Zombie-link detection: counts pings sent with no pong reply in between.
  private missedPongs = 0;

  // Speed scaling
  private maxLinear = 1.0;
  private maxAngular = 1.0;

  // Continuous-publish state
  /** Non-null while a joystick is held; the values to repeat each tick. */
  private repeatTwist: { lx: number; ly: number; az: number } | null = null;
  /** Counts down from STOP_REPEATS after a release, sending zeros each tick. */
  private zeroFramesLeft = 0;

  /** True while e-stop is latched; sendTwist is a no-op in this state. */
  private estopEngaged = false;

  constructor(options: TeleopClientOptions = {}) {
    this.options = options;
    this.retryIntervalMs = options.retryIntervalMs ?? 5000;
    this.keepaliveIntervalMs = options.keepaliveIntervalMs ?? 200;
    this.publishIntervalMs = options.publishIntervalMs ?? PUBLISH_INTERVAL_MS;
    this.maxMissedPongs = options.maxMissedPongs ?? 3;
    this.connection = new Connection({
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => { /* retryAttempt is reset in handleMessage on status */ },
      onClose: (code, reason) => {
        this.stopKeepalive();
        this.stopPublisher();
        this.gamepadHandler.setEnabled(false);
        if (this.intentionalDisconnect) {
          this.options.onClose?.(code, reason);
          return;
        }
        // Session expired (4001): operator's session timed out. Logout without retry.
        // The operator must re-authenticate; a reconnect would fail 401 anyway.
        if (code === 4001) {
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
      onButton:   (action) => this.handleGamepadButton(action),
      onActivity: () => this.options.onGamepadActivity?.(),
      onConnectionChange: (connected, id) => this.options.onGamepadConnected?.(connected, id),
    });
    // Gamepad detection (attach/start) runs immediately, independent of socket.
    // Detection loop polls for controller activity; actual twist/button transmission
    // is gated by setEnabled(). This ensures operator can always reconnect by pressing
    // a button, even if the socket is down.
    this.gamepadHandler.attach();
    this.gamepadHandler.start();
    this.gamepadHandler.setEnabled(false);
  }

  connect(url: string): void {
    this.url = url;
    this.intentionalDisconnect = false;
    this.retryAttempt = 0;
    this.retryPending = false;
    // Fresh/reconnected session must not blindly resume stale motion.
    this.repeatTwist = null;
    this.zeroFramesLeft = 0;
    this.estopEngaged = false;
    this.missedPongs = 0;
    this.pingSentAt = 0;
    this.connection.connect(url);
    this.startKeepalive();
    this.startPublisher();
    this.gamepadHandler.setEnabled(true);
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.stopKeepalive();
    this.stopPublisher();
    this.gamepadHandler.detach();
    this.connection.disconnect();
  }

  setGamepadProfile(profile: GamepadProfile): void {
    this.gamepadHandler.setProfile(profile);
  }

  setGamepadEnabled(enabled: boolean): void {
    this.gamepadHandler.setEnabled(enabled);
  }

  setMaxSpeed(maxLinear: number, maxAngular: number): void {
    this.maxLinear = maxLinear;
    this.maxAngular = maxAngular;
  }

  private sendScaledTwist(lx: number, ly: number, az: number): void {
    this.connection.send(buildTwist(lx * this.maxLinear, ly * this.maxLinear, az * this.maxAngular));
  }

  private handleGamepadButton(action: string): void {
    if (action === 'estop') {
      // Cross-source toggle: LB engages if released, resets if already engaged.
      // estopEngaged is the shared latch (also synced by server estop_state), so
      // touch/UI/Space and gamepad never lock each other out.
      if (this.estopEngaged) {
        this.resetEstop();
      } else {
        this.engageEstop();
      }
    }
    this.options.onButton?.(action);
  }

  engageEstop(): void {
    this.connection.send(buildEstop());
    this.estopEngaged = true;
    // Clear publisher motion state so the continuous publisher stops sending
    this.repeatTwist = null;
    this.zeroFramesLeft = 0;
    this.lastSentAt = Date.now();
  }

  resetEstop(): void {
    this.connection.send(buildEstopReset());
    this.estopEngaged = false;
    this.lastSentAt = Date.now();
  }

  sendTwist(lx: number, ly: number, az: number): void {
    // While e-stop is latched, all motion commands are suppressed
    if (this.estopEngaged) {
      return;
    }

    // Shape all three axes: deadzone + cubic curve for fine control
    const shapedLx = shapeAxis(lx);
    const shapedLy = shapeAxis(ly);
    const shapedAz = shapeAxis(az);

    // Immediate one-shot send with scaling applied
    this.sendScaledTwist(shapedLx, shapedLy, shapedAz);
    this.lastSentAt = Date.now();
    // Emit shaped-normalized (un-scaled) values to HUD
    this.options.onTwist?.(shapedLx, shapedLy, shapedAz);

    // Update continuous-publish state (store shaped-normalized, not pre-scaled)
    if (shapedLx !== 0 || shapedLy !== 0 || shapedAz !== 0) {
      // Joystick held: repeat this command on every publisher tick
      this.repeatTwist = { lx: shapedLx, ly: shapedLy, az: shapedAz };
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
      this.options.onStatus?.(msg.connected, msg.robot_type, msg.robot_name, msg.robot_namespace, msg.robot_length, msg.robot_width, msg.disconnect_action);
    } else if (msg.type === 'error') {
      this.options.onError?.(msg.message);
    } else if (msg.type === 'pong') {
      if (this.pingSentAt > 0) {
        this.options.onLatency?.(Date.now() - this.pingSentAt);
        this.pingSentAt = 0;
      }
      this.missedPongs = 0; // live link — clear the zombie counter
      this.options.onPong?.();
    } else if (msg.type === 'odom') {
      this.options.onOdom?.(msg.x, msg.y, msg.heading);
    } else if (msg.type === 'estop_state') {
      this.estopEngaged = msg.engaged;
      this.options.onEstopState?.(msg.engaged);
    } else if (msg.type === 'map') {
      this.options.onMap?.({
        resolution: msg.resolution,
        width: msg.width,
        height: msg.height,
        origin_x: msg.origin_x,
        origin_y: msg.origin_y,
        cells: msg.cells,
      });
    } else if (msg.type === 'pose') {
      const frame = msg.frame === 'map' || msg.frame === 'odom' ? msg.frame : 'odom';
      this.options.onPose?.(frame, msg.x, msg.y, msg.heading);
    } else if (msg.type === 'scan') {
      const scanData: { angle_min: number; angle_increment: number; range_max: number; ranges: number[]; pose?: ScanPose } = {
        angle_min: msg.angle_min,
        angle_increment: msg.angle_increment,
        range_max: msg.range_max,
        ranges: msg.ranges,
      };
      if (msg.pose !== undefined) {
        scanData.pose = msg.pose;
      }
      this.options.onScan?.(scanData);
    } else if (msg.type === 'battery') {
      this.options.onBattery?.({
        percentage: msg.percentage,
        voltage: msg.voltage,
        current: msg.current,
        charging: msg.charging,
      });
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
      this.gamepadHandler.setEnabled(true);
    }, delay);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.lastSentAt = Date.now();
    this.keepaliveId = setInterval(() => {
      if (Date.now() - this.lastSentAt >= 200) {
        // A still-pending pingSentAt means the previous ping was never answered.
        if (this.pingSentAt > 0) {
          this.missedPongs += 1;
          if (this.missedPongs >= this.maxMissedPongs) {
            this.handlePongTimeout();
            return;
          }
        }
        this.pingSentAt = Date.now();
        this.connection.send(buildPing());
        this.lastSentAt = Date.now();
      }
    }, this.keepaliveIntervalMs);
  }

  /**
   * The server stopped answering pings: the socket is a zombie (open but dead).
   * Tear down the keepalive/publisher, notify via onClose, and reconnect so the
   * operator regains a live link instead of silently steering a stale stream.
   */
  private handlePongTimeout(): void {
    this.stopKeepalive();
    this.stopPublisher();
    this.gamepadHandler.setEnabled(false);
    this.pingSentAt = 0;
    this.missedPongs = 0;
    this.options.onClose?.(4000, 'pong timeout');
    if (!this.intentionalDisconnect && !this.retryPending) {
      this.retryPending = true;
      this.scheduleRetry();
    }
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
        this.sendScaledTwist(lx, ly, az);
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
