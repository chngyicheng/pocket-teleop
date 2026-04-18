/**
 * VideoSourcePicker — runtime video source selection via MediaMTX config API.
 *
 * buildMtxSource  — pure function; maps (mode, url) → MediaMTX PATCH body.
 * VideoSourcePicker — stateful class; persists to localStorage, applies to API.
 */

export type VideoSourceType = 'rtsp' | 'udp' | 'srt' | 'mjpeg';
export type VideoSourceMode = 'ros2' | 'rtsp' | 'udp' | 'srt' | 'mjpeg' | 'disabled';

export interface MtxSourceBody {
  source: string;
  sourceRedirect?: string;
}

/** Maps a mode + optional URL to the MediaMTX path config PATCH body. */
export function buildMtxSource(mode: VideoSourceMode, url = ''): MtxSourceBody {
  if (mode === 'rtsp' || mode === 'udp' || mode === 'srt') return { source: url };
  if (mode === 'disabled') return { source: 'redirect', sourceRedirect: 'mediamtx-void' };
  /* ros2 */               return { source: 'publisher' };
}

const SOURCE_KEY    = 'video-source';
const RTSP_URL_KEY  = 'video-rtsp-url';
const MJPEG_URL_KEY = 'video-mjpeg-url';
const API_PATH      = '/mediamtx-api/config/paths/patch/teleop';

export interface VideoSourcePickerOptions {
  /** Override the PATCH URL — useful in tests. Default: API_PATH. */
  apiUrl?: string;
  /** Override fetch — useful in tests. Default: globalThis.fetch. */
  fetchFn?: typeof fetch;
  /** Called when MJPEG URL changes: string when active, null when cleared. */
  onMjpegUrl?: (url: string | null) => void;
}

export class VideoSourcePicker {
  private readonly apiUrl:     string;
  private readonly fetchFn:    typeof fetch;
  private readonly onMjpegUrl: ((url: string | null) => void) | undefined;

  constructor(options: VideoSourcePickerOptions = {}) {
    this.apiUrl     = options.apiUrl     ?? API_PATH;
    this.fetchFn    = options.fetchFn    ?? globalThis.fetch.bind(globalThis);
    this.onMjpegUrl = options.onMjpegUrl;
  }

  /** Load the saved source from localStorage (defaults to 'ros2'). */
  loadSaved(): { mode: VideoSourceMode; rtspUrl: string; mjpegUrl: string } {
    const mode     = (localStorage.getItem(SOURCE_KEY) ?? 'ros2') as VideoSourceMode;
    const rtspUrl  = localStorage.getItem(RTSP_URL_KEY)  ?? '';
    const mjpegUrl = localStorage.getItem(MJPEG_URL_KEY) ?? '';
    return { mode, rtspUrl, mjpegUrl };
  }

  /**
   * Validate mode + url before applying.
   * Returns null if valid, or a human-readable error string.
   */
  validate(mode: VideoSourceMode, url: string): string | null {
    if (mode === 'rtsp') {
      if (!url.trim()) return 'RTSP URL is required.';
      if (!url.trim().startsWith('rtsp://')) return 'RTSP URL must start with rtsp://';
    }
    if (mode === 'udp') {
      if (!url.trim()) return 'UDP URL is required.';
      if (!url.trim().startsWith('udp://')) return 'UDP URL must start with udp://';
    }
    if (mode === 'srt') {
      if (!url.trim()) return 'SRT URL is required.';
      if (!url.trim().startsWith('srt://')) return 'SRT URL must start with srt://';
    }
    if (mode === 'mjpeg') {
      if (!url.trim()) return 'MJPEG URL is required.';
      const t = url.trim();
      if (!t.startsWith('http://') && !t.startsWith('https://'))
        return 'MJPEG URL must start with http:// or https://';
    }
    return null;
  }

  /** Persist source to localStorage. */
  save(mode: VideoSourceMode, url: string): void {
    localStorage.setItem(SOURCE_KEY, mode);
    if (mode === 'rtsp' || mode === 'udp' || mode === 'srt')
                          localStorage.setItem(RTSP_URL_KEY, url);
    else                  localStorage.removeItem(RTSP_URL_KEY);
    if (mode === 'mjpeg') localStorage.setItem(MJPEG_URL_KEY, url);
    else                  localStorage.removeItem(MJPEG_URL_KEY);
  }

  /**
   * Apply a source mode. MJPEG bypasses MediaMTX and calls onMjpegUrl directly.
   * Non-MJPEG modes call onMjpegUrl(null) to clear any active MJPEG display.
   * Resolves with 'ok' | 'http-error:<status>' | 'network-error:<message>' | 'validation-error:<msg>'.
   */
  async apply(mode: VideoSourceMode, url = ''): Promise<string> {
    const err = this.validate(mode, url);
    if (err) return `validation-error:${err}`;

    if (mode === 'mjpeg') {
      this.save(mode, url);
      this.onMjpegUrl?.(url);
      return 'ok';
    }

    this.onMjpegUrl?.(null);

    const body = buildMtxSource(mode, url);
    try {
      const res = await this.fetchFn(this.apiUrl, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        this.save(mode, url);
        return 'ok';
      }
      return `http-error:${res.status}`;
    } catch (e) {
      return `network-error:${(e as Error).message}`;
    }
  }
}
