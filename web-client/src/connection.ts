export interface ConnectionCallbacks {
  onMessage: (raw: string) => void;
  onOpen: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (event: Event) => void;
}

export class Connection {
  private ws: WebSocket | null = null;
  private readonly callbacks: ConnectionCallbacks;

  constructor(callbacks: ConnectionCallbacks) {
    this.callbacks = callbacks;
  }

  connect(url: string): void {
    // Use globalThis.WebSocket so this works in both browser and Node.js 20+
    this.ws = new globalThis.WebSocket(url);
    this.ws.onmessage = (e: MessageEvent) => this.callbacks.onMessage(e.data as string);
    this.ws.onopen = () => this.callbacks.onOpen();
    this.ws.onclose = (e: CloseEvent) => this.callbacks.onClose(e.code, e.reason);
    this.ws.onerror = (e: Event) => this.callbacks.onError(e);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  send(msg: string): void {
    if (this.ws !== null && this.ws.readyState === 1) {
      this.ws.send(msg);
    }
  }
}
