import { Connection } from './connection.js';
import { GamepadHandler } from './gamepad_handler.js';
import { KeyboardHandler } from './keyboard_handler.js';
import type { GamepadProfile } from './gamepad_profiles.js';
import { buildEstop, buildEstopReset, buildPing, buildTwist, parseMessage, type ScanPose } from './protocol.js';
import { shapeAxis } from './input_shaping.js';
import type { NetworkStats } from './network_quality.js';

/** Continuous publish rate: one packet every 50 ms → 20 Hz. */
const PUBLISH_INTERVAL_MS = 50;

/**
 * Velocity slew-rate (acceleration) limiter timings. The published command
 * steps toward the target each tick instead of jumping, so the robot never
 * jerks. Accel is gentle, decel is sharper (stops feel prompt + safer).
 *   ACCEL_TIME_MS — time to ramp an axis from 0 → full (0.1/tick at 20 Hz)
 *   DECEL_TIME_MS — time to ramp an axis from full → 0 (0.25/tick at 20 Hz)
 * E-STOP bypasses the limiter and zeroes instantly.
 */
const ACCEL_TIME_MS = 500;
const DECEL_TIME_MS = 200;

/** Input source types for arbitration */
export type InputSource = 'gamepad' | 'keyboard' | 'touch';

/** Ownership window: source must send input within this time to retain ownership */
const ACTIVE_WINDOW_MS = 400;

/** Priority mapping: higher value = higher priority */
const SOURCE_PRIORITY: Record<InputSource, number> = {
  gamepad: 3,
  keyboard: 2,
  touch: 1,
};

/** Get numeric priority for a source */
const priority = (source: InputSource): number => SOURCE_PRIORITY[source];

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
  onTwist?: (lx: number, ly: number, az: number, source: InputSource) => void;
  onInputSource?: (source: InputSource | 'idle') => void;
  /**
   * Fires every publisher tick with the actual slew-limited command being sent
   * (normalized, pre-scale) plus the source that owns control. The HUD reads
   * this to show real published cmd_vel for any source, including the ramp.
   */
  onPublish?: (lx: number, ly: number, az: number, source: InputSource | 'idle') => void;
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
  private readonly keyboardHandler: KeyboardHandler;
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

  // Slew-rate limiter per-tick steps (normalized units), derived from the tick rate.
  private readonly accelStep: number;
  private readonly decelStep: number;

  // Zombie-link detection: counts pings sent with no pong reply in between.
  private missedPongs = 0;

  // Network quality tracking
  private rttSamples: number[] = [];
  private pingWindow: boolean[] = [];

  // Speed scaling
  private maxLinear = 1.0;
  private maxAngular = 1.0;

  // Continuous-publish state (slew-rate limited)
  /** Desired command (shaped-normalized) the active source last requested. */
  private targetTwist = { lx: 0, ly: 0, az: 0 };
  /** Actual command being published, ramped toward targetTwist each tick. */
  private currentTwist = { lx: 0, ly: 0, az: 0 };

  /** True while e-stop is latched; sendTwist is a no-op in this state. */
  private estopEngaged = false;

  // Input arbitration state
  /** Currently active input source (holds ownership) */
  private activeSource: InputSource | null = null;
  /** Timestamp of last input from the active source */
  private lastActiveAt = 0;

  constructor(options: TeleopClientOptions = {}) {
    this.options = options;
    this.retryIntervalMs = options.retryIntervalMs ?? 5000;
    this.keepaliveIntervalMs = options.keepaliveIntervalMs ?? 200;
    this.publishIntervalMs = options.publishIntervalMs ?? PUBLISH_INTERVAL_MS;
    this.maxMissedPongs = options.maxMissedPongs ?? 3;
    this.accelStep = this.publishIntervalMs / ACCEL_TIME_MS;
    this.decelStep = this.publishIntervalMs / DECEL_TIME_MS;
    this.connection = new Connection({
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => { /* retryAttempt is reset in handleMessage on status */ },
      onClose: (code, reason) => {
        this.stopKeepalive();
        this.stopPublisher();
        this.gamepadHandler.setEnabled(false);
        this.keyboardHandler.setEnabled(false);
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
      onTwist:    (lx, ly, az) => this.sendTwist(lx, ly, az, 'gamepad'),
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
    this.keyboardHandler = new KeyboardHandler({
      onTwist: (lx, ly, az) => this.sendTwist(lx, ly, az, 'keyboard'),
    });
  }

  connect(url: string): void {
    this.url = url;
    this.intentionalDisconnect = false;
    this.retryAttempt = 0;
    this.retryPending = false;
    // Fresh/reconnected session must not blindly resume stale motion.
    this.targetTwist = { lx: 0, ly: 0, az: 0 };
    this.currentTwist = { lx: 0, ly: 0, az: 0 };
    this.estopEngaged = false;
    this.missedPongs = 0;
    this.pingSentAt = 0;
    this.rttSamples = [];
    this.pingWindow = [];
    // Reset arbitration state: do not resume stale ownership
    this.activeSource = null;
    this.lastActiveAt = 0;
    this.connection.connect(url);
    this.startKeepalive();
    this.startPublisher();
    this.gamepadHandler.setEnabled(true);
    this.keyboardHandler.start();
    this.keyboardHandler.setEnabled(true);
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
    this.keyboardHandler.stop();
    this.connection.disconnect();
  }

  resume(): void {
    if (this.intentionalDisconnect) {
      return;
    }

    // User-initiated resume (tab foregrounded): reset exponential backoff so any
    // reconnect — now, or one triggered by the probe ping below — starts fresh.
    // The automatic scheduleRetry path deliberately leaves retryAttempt growing.
    this.retryAttempt = 0;

    // If reconnect is scheduled but waiting in exponential backoff, skip the wait.
    if (this.retryTimeoutId !== null) {
      this.reconnectNow();
      return;
    }

    // If socket is still open, send a ping to quickly detect if the link is frozen.
    if (this.connection.isOpen()) {
      this.pingSentAt = Date.now();
      this.connection.send(buildPing());
      this.lastSentAt = Date.now();
      return;
    }

    // Socket is closed and no retry pending — reconnect now.
    this.reconnectNow();
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

  getNetworkStats(): NetworkStats {
    const n = this.rttSamples.length;
    const rtt = n > 0 ? this.rttSamples[n - 1] : 0;
    let jitter = 0;
    if (n >= 2) {
      let sum = 0;
      for (let i = 1; i < n; i++) {
        sum += Math.abs(this.rttSamples[i] - this.rttSamples[i - 1]);
      }
      jitter = sum / (n - 1);
    }
    const lossRate = this.pingWindow.length > 0
      ? this.pingWindow.filter((a) => !a).length / this.pingWindow.length
      : 0;
    return { rtt, jitter, lossRate };
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
    // E-STOP bypasses the slew limiter: force motion to zero instantly so there
    // is no decel ramp, and a later reset cannot resume stale motion.
    this.targetTwist = { lx: 0, ly: 0, az: 0 };
    this.currentTwist = { lx: 0, ly: 0, az: 0 };
    this.lastSentAt = Date.now();
  }

  resetEstop(): void {
    this.connection.send(buildEstopReset());
    this.estopEngaged = false;
    this.lastSentAt = Date.now();
  }

  sendTwist(lx: number, ly: number, az: number, source: InputSource = 'touch'): void {
    // While e-stop is latched, all motion commands are suppressed
    if (this.estopEngaged) {
      return;
    }

    // Record prior source state to detect changes
    const prevSource = this.activeSource;

    // ========== INPUT ARBITRATION ==========
    // Check if input is non-zero or zero from owner
    const isNonZeroInput = lx !== 0 || ly !== 0 || az !== 0;
    const now = Date.now();

    if (isNonZeroInput) {
      // Non-zero input: apply arbitration rules
      const owner = this.activeSource;
      const windowExpired = owner === null || now - this.lastActiveAt >= ACTIVE_WINDOW_MS;

      if (windowExpired) {
        // No current owner or window expired: this source acquires ownership
        this.activeSource = source;
        this.lastActiveAt = now;
      } else if (source === owner) {
        // Same source: continue and refresh window
        this.lastActiveAt = now;
      } else if (priority(source) >= priority(owner)) {
        // Higher (or equal) priority: seize ownership — last writer wins on ties
        this.activeSource = source;
        this.lastActiveAt = now;
      } else {
        // Lower priority and owner still active: reject this input
        return;
      }
    } else {
      // Zero input: only owner can send it; others rejected
      if (source !== this.activeSource) {
        return; // Non-owner zero is rejected
      }
      // Owner releasing: send zero and release ownership
      this.activeSource = null;
      this.lastActiveAt = 0;
    }

    // ========== SHAPE ==========
    // Shape all three axes: deadzone + cubic curve for fine control
    const shapedLx = shapeAxis(lx);
    const shapedLy = shapeAxis(ly);
    const shapedAz = shapeAxis(az);

    // Emit shaped-normalized (un-scaled) values to HUD, with source
    this.options.onTwist?.(shapedLx, shapedLy, shapedAz, source);

    // Fire onInputSource callback if activeSource changed
    if (this.activeSource !== prevSource) {
      this.options.onInputSource?.(this.activeSource ?? 'idle');
    }

    // Set the desired command; the publisher ramps currentTwist toward it each
    // tick (slew-rate limited). This is the single point all sources flow through,
    // so the limiter and the actual send live in startPublisher, not here. A
    // release (all-zero) simply sets the target to zero and the publisher
    // decelerates smoothly to a stop.
    this.targetTwist = { lx: shapedLx, ly: shapedLy, az: shapedAz };
  }

  /**
   * Step a single axis from its current value toward the target by one tick,
   * bounded by the accel or decel step. Accelerating = moving away from zero in
   * the same direction; everything else (slowing, or reversing through zero)
   * uses the sharper decel step.
   */
  private rampAxis(current: number, target: number): number {
    if (current === target) return current;
    const accelerating =
      current === 0 ||
      (Math.sign(target) === Math.sign(current) && Math.abs(target) > Math.abs(current));
    const step = accelerating ? this.accelStep : this.decelStep;
    if (current < target) return Math.min(current + step, target);
    return Math.max(current - step, target);
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
        const rtt = Date.now() - this.pingSentAt;
        this.options.onLatency?.(rtt);
        // Track RTT sample (cap 20)
        this.rttSamples.push(rtt);
        if (this.rttSamples.length > 20) {
          this.rttSamples.shift();
        }
        // Track ping window: pong answered (true)
        this.pingWindow.push(true);
        if (this.pingWindow.length > 20) {
          this.pingWindow.shift();
        }
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

  private reconnectNow(): void {
    // Reset publish state before reconnecting — do not resume stale motion.
    // NOTE: retryAttempt is intentionally NOT reset here — the scheduleRetry timer
    // calls this, and exponential backoff must keep growing across failed retries
    // (reset only on a successful 'status' message, or by user-initiated resume()).
    this.targetTwist = { lx: 0, ly: 0, az: 0 };
    this.currentTwist = { lx: 0, ly: 0, az: 0 };
    this.retryPending = false;
    this.missedPongs = 0;
    this.pingSentAt = 0;
    // Reset arbitration state: do not resume stale ownership
    this.activeSource = null;
    this.lastActiveAt = 0;
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.connection.connect(this.url);
    this.startKeepalive();
    this.startPublisher();
    this.gamepadHandler.setEnabled(true);
    this.keyboardHandler.start();
    this.keyboardHandler.setEnabled(true);
  }

  private scheduleRetry(): void {
    this.retryAttempt += 1;
    this.options.onReconnecting?.(this.retryAttempt);
    const delay = Math.min(this.retryIntervalMs * 2 ** (this.retryAttempt - 1), 30_000);
    this.retryTimeoutId = setTimeout(() => {
      this.reconnectNow();
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
          // Track ping window: ping lost (false)
          this.pingWindow.push(false);
          if (this.pingWindow.length > 20) {
            this.pingWindow.shift();
          }
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
    this.keyboardHandler.setEnabled(false);
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
   * Each tick ramps currentTwist toward targetTwist (slew-rate limited) and
   * publishes it. It keeps sending while moving, plus exactly one terminal zero
   * on the tick motion reaches rest (so the robot always receives a stop), then
   * goes silent. The decel ramp replaces the old fixed zero-burst.
   *
   * The publisher does NOT send pings; that remains the keepalive's job so
   * latency measurement continues to work independently.
   */
  private startPublisher(): void {
    this.stopPublisher();
    this.publishId = setInterval(() => {
      // E-STOP forced currentTwist to zero and suppresses motion entirely.
      if (this.estopEngaged) return;
      const wasNonZero = this.currentTwist.lx !== 0 || this.currentTwist.ly !== 0 || this.currentTwist.az !== 0;
      this.currentTwist = {
        lx: this.rampAxis(this.currentTwist.lx, this.targetTwist.lx),
        ly: this.rampAxis(this.currentTwist.ly, this.targetTwist.ly),
        az: this.rampAxis(this.currentTwist.az, this.targetTwist.az),
      };
      const isNonZero = this.currentTwist.lx !== 0 || this.currentTwist.ly !== 0 || this.currentTwist.az !== 0;
      // Send while moving, and once more on the tick we settle to rest (terminal
      // zero). When both are zero we are idle — stay silent; keepalive pings.
      if (isNonZero || wasNonZero) {
        this.sendScaledTwist(this.currentTwist.lx, this.currentTwist.ly, this.currentTwist.az);
        this.lastSentAt = Date.now();
        this.options.onPublish?.(this.currentTwist.lx, this.currentTwist.ly, this.currentTwist.az, this.activeSource ?? 'idle');
      }
    }, this.publishIntervalMs);
  }

  private stopPublisher(): void {
    if (this.publishId !== null) {
      clearInterval(this.publishId);
      this.publishId = null;
    }
  }
}
