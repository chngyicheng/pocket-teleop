import { Connection } from './connection.js';
import { GamepadHandler } from './gamepad_handler.js';
import { buildPing, buildTwist, parseMessage } from './protocol.js';

export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
}

export class TeleopClient {
  private readonly connection: Connection;
  private readonly gamepadHandler: GamepadHandler;
  private keepaliveId: ReturnType<typeof setInterval> | null = null;
  private lastSentAt = 0;
  private readonly options: TeleopClientOptions;

  constructor(options: TeleopClientOptions = {}) {
    this.options = options;
    this.connection = new Connection({
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => {},
      onClose: (code, reason) => {
        this.stopKeepalive();
        this.gamepadHandler.stop();
        this.options.onClose?.(code, reason);
      },
      onError: (e) => {
        this.options.onError?.((e as ErrorEvent).message ?? 'connection error');
      },
    });
    this.gamepadHandler = new GamepadHandler({
      onTwist: (lx, ly, az) => this.sendTwist(lx, ly, az),
    });
  }

  connect(url: string): void {
    this.connection.connect(url);
    this.startKeepalive();
    this.gamepadHandler.start();
  }

  disconnect(): void {
    this.stopKeepalive();
    this.gamepadHandler.stop();
    this.connection.disconnect();
  }

  sendTwist(lx: number, ly: number, az: number): void {
    this.connection.send(buildTwist(lx, ly, az));
    this.lastSentAt = Date.now();
  }

  private handleMessage(raw: string): void {
    const msg = parseMessage(raw);
    if (msg.type === 'status') {
      this.options.onStatus?.(msg.connected, msg.robot_type);
    } else if (msg.type === 'error') {
      this.options.onError?.(msg.message);
    }
  }

  private startKeepalive(): void {
    this.lastSentAt = Date.now();
    this.keepaliveId = setInterval(() => {
      if (Date.now() - this.lastSentAt >= 200) {
        this.connection.send(buildPing());
        this.lastSentAt = Date.now();
      }
    }, 200);
  }

  private stopKeepalive(): void {
    if (this.keepaliveId !== null) {
      clearInterval(this.keepaliveId);
      this.keepaliveId = null;
    }
  }
}
