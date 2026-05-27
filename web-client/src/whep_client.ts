/**
 * WhepClient — WebRTC-HTTP Egress Protocol (WHEP) client.
 *
 * Connects to a MediaMTX WHEP endpoint, establishes a WebRTC receive-only
 * peer connection, and delivers the media stream via onStream callback.
 *
 * Uses vanilla WHEP (gather-then-offer): all ICE candidates are gathered
 * locally before the SDP offer is sent. No STUN server is required on a
 * LAN where the robot's IP is directly reachable.
 *
 * Auto-retries with exponential back-off if the stream is unavailable or
 * the connection drops (e.g. video-bridge restarting).
 */
export type WhepState = 'connecting' | 'live' | 'retrying' | 'error';

export interface WhepCallbacks {
  onStream: (stream: MediaStream) => void;
  onError:  (msg: string) => void;
  onClose:  () => void;
  onStateChange?: (state: WhepState) => void;
}

const BASE_RETRY_MS  = 3_000;
const MAX_RETRY_MS   = 30_000;

export class WhepClient {
  private readonly url:       string;
  private readonly callbacks: WhepCallbacks;
  private pc:         RTCPeerConnection | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay  = BASE_RETRY_MS;
  private stopped     = false;

  constructor(url: string, callbacks: WhepCallbacks) {
    this.url       = url;
    this.callbacks = callbacks;
  }

  /** Begin connecting. Safe to call multiple times (stops any in-progress attempt first). */
  start(): void {
    this.stopped = false;
    this._connect();
  }

  /** Permanently stop — no further retries. */
  stop(): void {
    this.stopped = true;
    this._clearRetry();
    this._closePc();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async _connect(): Promise<void> {
    this._closePc();
    if (this.stopped) return;

    this.callbacks.onStateChange?.('connecting');

    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc   = pc;

    // Receive-only: one video track, no audio (video-bridge sends video only)
    pc.addTransceiver('video', { direction: 'recvonly' });

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        this.retryDelay = BASE_RETRY_MS; // reset back-off on success
        this.callbacks.onStateChange?.('live');
        this.callbacks.onStream(e.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.callbacks.onClose();
        this._scheduleRetry();
      }
    };

    try {
      const offer = await pc.createOffer();
      if (this.pc !== pc) return;
      await pc.setLocalDescription(offer);
      if (this.pc !== pc) return;

      // Wait for ICE gathering to complete before sending the offer.
      // On a LAN without STUN, gathering is fast (host candidates only).
      await this._waitForIceGathering(pc);
      if (this.pc !== pc) return;

      const res = await fetch(this.url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body:    pc.localDescription!.sdp,
      });
      if (this.pc !== pc) return;

      if (!res.ok) {
        // 404 = stream not yet published (video-bridge not started yet)
        // Other codes = MediaMTX error
        this.callbacks.onError(
          res.status === 404 ? 'stream not available' : `WHEP ${res.status}`
        );
        this.callbacks.onStateChange?.('error');
        this._scheduleRetry();
        return;
      }

      const sdp = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp });
      if (this.pc !== pc) return;
      // ontrack fires once remote description is set and ICE completes.

    } catch (e) {
      this.callbacks.onError((e as Error).message ?? 'connection error');
      this.callbacks.onStateChange?.('error');
      this._scheduleRetry();
    }
  }

  private _waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const timerId = setTimeout(resolve, 5_000);
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          clearTimeout(timerId);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  private _scheduleRetry(): void {
    if (this.stopped) return;
    this.callbacks.onStateChange?.('retrying');
    this._clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this._connect();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
  }

  private _clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private _closePc(): void {
    this.pc?.close();
    this.pc = null;
  }
}
