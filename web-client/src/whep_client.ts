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

/** Live decoded-video stats sampled from RTCPeerConnection.getStats(). */
export interface VideoStats {
  fps:    number | null;
  width:  number | null;
  height: number | null;
}

export interface WhepCallbacks {
  onStream: (stream: MediaStream) => void;
  onError:  (msg: string) => void;
  onClose:  () => void;
  onStateChange?: (state: WhepState) => void;
  /** Periodic decoded-video stats while the stream is live. */
  onStats?: (stats: VideoStats) => void;
}

const BASE_RETRY_MS  = 3_000;
const MAX_RETRY_MS   = 30_000;
const STATS_INTERVAL_MS = 1_000;
const DISCONNECT_GRACE_MS = 2_000;
const STALL_POLL_LIMIT = 3;

export class WhepClient {
  private readonly url:       string;
  private readonly callbacks: WhepCallbacks;
  private pc:         RTCPeerConnection | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay  = BASE_RETRY_MS;
  private stopped     = false;
  private lastFramesDecoded: number | null = null;
  private stallPolls = 0;

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
    this._clearStats();
    this._closePc();
  }

  /** Resume from suspend — rebuild PC and clear retry backoff. */
  resume(): void {
    if (this.stopped) {
      return;
    }
    this.retryDelay = BASE_RETRY_MS;
    this._clearRetry();
    void this._connect();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async _connect(): Promise<void> {
    this._closePc();
    this._clearDisconnectTimer();
    this.lastFramesDecoded = null;
    this.stallPolls = 0;
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
        this._startStats(pc);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._clearDisconnectTimer();
        this.callbacks.onClose();
        this._scheduleRetry();
      } else if (pc.connectionState === 'disconnected') {
        // Grace period: wait DISCONNECT_GRACE_MS before tearing down.
        // If reconnected within grace, cancel the timer.
        if (this.disconnectTimer === null) {
          this.disconnectTimer = setTimeout(() => {
            if (this.pc === pc && pc.connectionState !== 'connected' && pc.connectionState !== 'completed') {
              this._clearDisconnectTimer();
              this.callbacks.onClose();
              this._scheduleRetry();
            }
          }, DISCONNECT_GRACE_MS);
        }
      } else if (pc.connectionState === 'connected' || pc.connectionState === 'completed') {
        this._clearDisconnectTimer();
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

  private _clearDisconnectTimer(): void {
    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  // ── Live video stats ─────────────────────────────────────────────────────

  /** Begin sampling decoded-video stats once the track is live. */
  private _startStats(pc: RTCPeerConnection): void {
    this.lastFramesDecoded = null;
    this.stallPolls = 0;
    if (!this.callbacks.onStats) return;
    this._clearStats();
    this.statsTimer = setInterval(() => { void this._pollStats(pc); }, STATS_INTERVAL_MS);
  }

  /** Read one getStats() sample and report the inbound video stats, if any. */
  private async _pollStats(pc: RTCPeerConnection): Promise<void> {
    if (this.pc !== pc) { this._clearStats(); return; }
    try {
      const report = await pc.getStats();
      if (this.pc !== pc) return;
      let stats: VideoStats | null = null;
      let framesDecoded: number | null = null;
      report.forEach((r: Record<string, unknown>) => {
        const kind = r.kind ?? r.mediaType; // newer browsers expose `kind`
        if (r.type === 'inbound-rtp' && kind === 'video') {
          stats = {
            fps:    typeof r.framesPerSecond === 'number' ? r.framesPerSecond : null,
            width:  typeof r.frameWidth === 'number' ? r.frameWidth : null,
            height: typeof r.frameHeight === 'number' ? r.frameHeight : null,
          };
          if (typeof r.framesDecoded === 'number') {
            framesDecoded = r.framesDecoded;
          }
        }
      });
      if (stats) this.callbacks.onStats?.(stats);

      // fps-stall watchdog: if framesDecoded hasn't advanced, increment stall counter.
      if (framesDecoded !== null) {
        if (this.lastFramesDecoded !== null && framesDecoded === this.lastFramesDecoded) {
          this.stallPolls += 1;
          if (this.stallPolls >= STALL_POLL_LIMIT) {
            // Frames haven't advanced for STALL_POLL_LIMIT polls — rebuild.
            this.stallPolls = 0;
            this._clearStats();
            this.callbacks.onClose();
            this._scheduleRetry();
            return;
          }
        } else {
          this.stallPolls = 0;
        }
        this.lastFramesDecoded = framesDecoded;
      }
    } catch {
      // getStats can transiently reject while the pc is tearing down; ignore.
    }
  }

  private _clearStats(): void {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private _closePc(): void {
    this._clearStats();
    this._clearDisconnectTimer();
    this.pc?.close();
    this.pc = null;
  }
}
