/**
 * VideoSourcePicker — runtime video source selection via MediaMTX config API.
 *
 * buildMtxSource  — pure function; maps (mode, rtspUrl) → MediaMTX PATCH body.
 * VideoSourcePicker — stateful class; persists to localStorage, applies to API.
 */

export type VideoSourceMode = 'ros2' | 'rtsp' | 'disabled';

export interface MtxSourceBody {
  source: string;
  sourceRedirect?: string;
}

/** Maps a mode + optional RTSP URL to the MediaMTX path config PATCH body. */
export function buildMtxSource(mode: VideoSourceMode, rtspUrl = ''): MtxSourceBody {
  if (mode === 'rtsp')      return { source: rtspUrl };
  if (mode === 'disabled')  return { source: 'redirect', sourceRedirect: 'mediamtx-void' };
  /* ros2 */                return { source: 'publisher' };
}

const SOURCE_KEY   = 'video-source';
const RTSP_URL_KEY = 'video-rtsp-url';
const API_PATH     = '/mediamtx-api/config/paths/patch/teleop';

export interface VideoSourcePickerOptions {
  /** Override the PATCH URL — useful in tests. Default: API_PATH. */
  apiUrl?: string;
  /** Override fetch — useful in tests. Default: globalThis.fetch. */
  fetchFn?: typeof fetch;
}

export class VideoSourcePicker {
  private readonly apiUrl:  string;
  private readonly fetchFn: typeof fetch;

  constructor(options: VideoSourcePickerOptions = {}) {
    this.apiUrl  = options.apiUrl  ?? API_PATH;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /** Load the saved source from localStorage (defaults to 'ros2'). */
  loadSaved(): { mode: VideoSourceMode; rtspUrl: string } {
    const mode    = (localStorage.getItem(SOURCE_KEY) ?? 'ros2') as VideoSourceMode;
    const rtspUrl = localStorage.getItem(RTSP_URL_KEY) ?? '';
    return { mode, rtspUrl };
  }

  /**
   * Validate mode + rtspUrl before applying.
   * Returns null if valid, or a human-readable error string.
   */
  validate(mode: VideoSourceMode, rtspUrl: string): string | null {
    if (mode === 'rtsp') {
      if (!rtspUrl.trim()) return 'RTSP URL is required.';
      if (!rtspUrl.trim().startsWith('rtsp://')) return 'RTSP URL must start with rtsp://';
    }
    return null;
  }

  /** Persist source to localStorage. */
  save(mode: VideoSourceMode, rtspUrl: string): void {
    localStorage.setItem(SOURCE_KEY, mode);
    if (mode === 'rtsp') localStorage.setItem(RTSP_URL_KEY, rtspUrl);
    else                 localStorage.removeItem(RTSP_URL_KEY);
  }

  /**
   * Send PATCH to MediaMTX config API and persist on success.
   * Resolves with 'ok' | 'http-error:<status>' | 'network-error:<message>'.
   */
  async apply(mode: VideoSourceMode, rtspUrl = ''): Promise<string> {
    const err = this.validate(mode, rtspUrl);
    if (err) return `validation-error:${err}`;
    const body = buildMtxSource(mode, rtspUrl);
    try {
      const res = await this.fetchFn(this.apiUrl, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        this.save(mode, rtspUrl);
        return 'ok';
      }
      return `http-error:${res.status}`;
    } catch (e) {
      return `network-error:${(e as Error).message}`;
    }
  }
}
