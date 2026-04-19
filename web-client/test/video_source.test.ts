// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMtxSource, VideoSourcePicker, type VideoSourceMode } from '../src/video_source.js';

// ── buildMtxSource ────────────────────────────────────────────────────────────

describe('buildMtxSource', () => {
  it('ros2 → publisher', () => {
    expect(buildMtxSource('ros2')).toEqual({ source: 'publisher' });
  });

  it('disabled → redirect to void path', () => {
    expect(buildMtxSource('disabled')).toEqual({
      source: 'redirect',
      sourceRedirect: 'mediamtx-void',
    });
  });

  it('rtsp → source is the RTSP URL', () => {
    expect(buildMtxSource('rtsp', 'rtsp://192.168.1.200:554/stream')).toEqual({
      source: 'rtsp://192.168.1.200:554/stream',
    });
  });

  it('rtsp with empty URL → source is empty string (caller must validate)', () => {
    expect(buildMtxSource('rtsp', '')).toEqual({ source: '' });
  });

  it('udp → source is the UDP URL', () => {
    expect(buildMtxSource('udp', 'udp://192.168.1.10:1234')).toEqual({ source: 'udp://192.168.1.10:1234' });
  });

  it('srt → source is the SRT URL', () => {
    expect(buildMtxSource('srt', 'srt://192.168.1.10:8890')).toEqual({ source: 'srt://192.168.1.10:8890' });
  });
});

// ── VideoSourcePicker ─────────────────────────────────────────────────────────

const TEST_API = 'http://robot.local/mediamtx-api/config/paths/patch/teleop';

function makePicker(fetchFn: typeof fetch) {
  return new VideoSourcePicker({ apiUrl: TEST_API, fetchFn });
}

function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

function errResponse(status: number): Response {
  return { ok: false, status } as Response;
}

beforeEach(() => {
  localStorage.clear();
});

describe('VideoSourcePicker.loadSaved', () => {
  it('defaults to ros2 when nothing stored', () => {
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'ros2', streamUrl: '', mjpegUrl: '' });
  });

  it('returns stored mode and rtsp URL', () => {
    localStorage.setItem('video-source', 'rtsp');
    localStorage.setItem('video-rtsp-url', 'rtsp://cam:554/live');
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'rtsp', streamUrl: 'rtsp://cam:554/live', mjpegUrl: '' });
  });

  it('returns stored mjpeg URL', () => {
    localStorage.setItem('video-source', 'mjpeg');
    localStorage.setItem('video-mjpeg-url', 'http://cam/feed');
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'mjpeg', streamUrl: '', mjpegUrl: 'http://cam/feed' });
  });

  it('returns stored URL for udp mode', () => {
    localStorage.setItem('video-source', 'udp');
    localStorage.setItem('video-rtsp-url', 'udp://192.168.1.10:1234');
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'udp', streamUrl: 'udp://192.168.1.10:1234', mjpegUrl: '' });
  });

  it('returns stored URL for srt mode', () => {
    localStorage.setItem('video-source', 'srt');
    localStorage.setItem('video-rtsp-url', 'srt://192.168.1.10:8890');
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'srt', streamUrl: 'srt://192.168.1.10:8890', mjpegUrl: '' });
  });
});

describe('VideoSourcePicker.save', () => {
  it('persists mode to localStorage', () => {
    const picker = makePicker(vi.fn());
    picker.save('disabled', '');
    expect(localStorage.getItem('video-source')).toBe('disabled');
  });

  it('persists rtsp URL when mode is rtsp', () => {
    const picker = makePicker(vi.fn());
    picker.save('rtsp', 'rtsp://cam:554/live');
    expect(localStorage.getItem('video-rtsp-url')).toBe('rtsp://cam:554/live');
  });

  it('persists URL when mode is udp', () => {
    const picker = makePicker(vi.fn());
    picker.save('udp', 'udp://192.168.1.10:1234');
    expect(localStorage.getItem('video-rtsp-url')).toBe('udp://192.168.1.10:1234');
  });

  it('persists URL when mode is srt', () => {
    const picker = makePicker(vi.fn());
    picker.save('srt', 'srt://192.168.1.10:8890');
    expect(localStorage.getItem('video-rtsp-url')).toBe('srt://192.168.1.10:8890');
  });

  it('persists mjpeg URL when mode is mjpeg', () => {
    const picker = makePicker(vi.fn());
    picker.save('mjpeg', 'http://cam/feed');
    expect(localStorage.getItem('video-mjpeg-url')).toBe('http://cam/feed');
  });

  it('removes rtsp URL when mode is not a stream type', () => {
    localStorage.setItem('video-rtsp-url', 'rtsp://old:554/live');
    const picker = makePicker(vi.fn());
    picker.save('ros2', '');
    expect(localStorage.getItem('video-rtsp-url')).toBeNull();
  });

  it('removes mjpeg URL when switching to non-mjpeg mode', () => {
    localStorage.setItem('video-mjpeg-url', 'http://old/feed');
    const picker = makePicker(vi.fn());
    picker.save('rtsp', 'rtsp://cam:554/live');
    expect(localStorage.getItem('video-mjpeg-url')).toBeNull();
  });
});

describe('VideoSourcePicker.validate', () => {
  it('returns null for ros2', () => {
    expect(new VideoSourcePicker().validate('ros2', '')).toBeNull();
  });

  it('returns null for disabled', () => {
    expect(new VideoSourcePicker().validate('disabled', '')).toBeNull();
  });

  it('returns null for valid rtsp URL', () => {
    expect(new VideoSourcePicker().validate('rtsp', 'rtsp://192.168.1.1:554/live')).toBeNull();
  });

  it('returns error for empty rtsp URL', () => {
    expect(new VideoSourcePicker().validate('rtsp', '')).toBe('RTSP URL is required.');
  });

  it('returns error for whitespace-only rtsp URL', () => {
    expect(new VideoSourcePicker().validate('rtsp', '   ')).toBe('RTSP URL is required.');
  });

  it('returns error for rtsp URL without rtsp:// prefix', () => {
    expect(new VideoSourcePicker().validate('rtsp', 'http://cam/live')).toBe('RTSP URL must start with rtsp://');
  });

  it('returns null for valid udp URL', () => {
    expect(new VideoSourcePicker().validate('udp', 'udp://192.168.1.10:1234')).toBeNull();
  });

  it('returns error for empty udp URL', () => {
    expect(new VideoSourcePicker().validate('udp', '')).toBe('UDP URL is required.');
  });

  it('returns error for whitespace-only udp URL', () => {
    expect(new VideoSourcePicker().validate('udp', '   ')).toBe('UDP URL is required.');
  });

  it('returns error for udp URL with wrong scheme', () => {
    expect(new VideoSourcePicker().validate('udp', 'rtsp://cam')).toBe('UDP URL must start with udp://');
  });

  it('returns null for valid srt URL', () => {
    expect(new VideoSourcePicker().validate('srt', 'srt://192.168.1.10:8890')).toBeNull();
  });

  it('returns error for empty srt URL', () => {
    expect(new VideoSourcePicker().validate('srt', '')).toBe('SRT URL is required.');
  });

  it('returns error for whitespace-only srt URL', () => {
    expect(new VideoSourcePicker().validate('srt', '   ')).toBe('SRT URL is required.');
  });

  it('returns error for srt URL with wrong scheme', () => {
    expect(new VideoSourcePicker().validate('srt', 'http://cam')).toBe('SRT URL must start with srt://');
  });

  it('returns null for valid mjpeg http URL', () => {
    expect(new VideoSourcePicker().validate('mjpeg', 'http://cam/feed')).toBeNull();
  });

  it('returns null for valid mjpeg https URL', () => {
    expect(new VideoSourcePicker().validate('mjpeg', 'https://cam/feed')).toBeNull();
  });

  it('returns error for empty mjpeg URL', () => {
    expect(new VideoSourcePicker().validate('mjpeg', '')).toBe('MJPEG URL is required.');
  });

  it('returns error for whitespace-only mjpeg URL', () => {
    expect(new VideoSourcePicker().validate('mjpeg', '   ')).toBe('MJPEG URL is required.');
  });

  it('returns error for mjpeg URL with wrong scheme', () => {
    expect(new VideoSourcePicker().validate('mjpeg', 'rtsp://cam')).toBe('MJPEG URL must start with http:// or https://');
  });
});

describe('VideoSourcePicker.apply — validation short-circuit', () => {
  it('returns validation-error without calling fetch for empty rtsp URL', async () => {
    const fetchFn = vi.fn();
    const picker = makePicker(fetchFn as unknown as typeof fetch);
    const result = await picker.apply('rtsp', '');
    expect(result).toBe('validation-error:RTSP URL is required.');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns validation-error without calling fetch for bad rtsp prefix', async () => {
    const fetchFn = vi.fn();
    const picker = makePicker(fetchFn as unknown as typeof fetch);
    const result = await picker.apply('rtsp', 'http://cam/live');
    expect(result).toMatch(/^validation-error:/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('VideoSourcePicker.apply — url trimming', () => {
  it('trims whitespace from url before saving', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('rtsp', '  rtsp://cam:554/live  ');
    expect(localStorage.getItem('video-rtsp-url')).toBe('rtsp://cam:554/live');
  });

  it('trims whitespace from url before sending to MediaMTX', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('rtsp', '  rtsp://cam:554/live  ');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      body: JSON.stringify({ source: 'rtsp://cam:554/live' }),
    }));
  });
});

describe('VideoSourcePicker.apply', () => {
  it('sends PATCH with correct body for ros2', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('ros2');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'publisher' }),
    }));
  });

  it('sends PATCH with RTSP URL as source', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('rtsp', 'rtsp://cam:554/live');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      body: JSON.stringify({ source: 'rtsp://cam:554/live' }),
    }));
  });

  it('returns "ok" and persists on success', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    const result = await picker.apply('disabled');
    expect(result).toBe('ok');
    expect(localStorage.getItem('video-source')).toBe('disabled');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      body: JSON.stringify({ source: 'redirect', sourceRedirect: 'mediamtx-void' }),
    }));
  });

  it('returns "http-error:<status>" without persisting on HTTP error', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(errResponse(500));
    const picker = makePicker(fetchFn);
    const result = await picker.apply('ros2');
    expect(result).toBe('http-error:500');
    expect(localStorage.getItem('video-source')).toBeNull();
  });

  it('returns "network-error:<msg>" without persisting on fetch throw', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockRejectedValue(new Error('Failed to fetch'));
    const picker = makePicker(fetchFn);
    const result = await picker.apply('ros2');
    expect(result).toBe('network-error:Failed to fetch');
    expect(localStorage.getItem('video-source')).toBeNull();
  });

  it('sends PATCH with UDP URL as source', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('udp', 'udp://192.168.1.10:1234');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      body: JSON.stringify({ source: 'udp://192.168.1.10:1234' }),
    }));
  });

  it('sends PATCH with SRT URL as source', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('srt', 'srt://192.168.1.10:8890');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      body: JSON.stringify({ source: 'srt://192.168.1.10:8890' }),
    }));
  });

  it('persists udp URL to localStorage on success', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('udp', 'udp://192.168.1.10:1234');
    expect(localStorage.getItem('video-source')).toBe('udp');
    expect(localStorage.getItem('video-rtsp-url')).toBe('udp://192.168.1.10:1234');
  });

  it('persists srt URL to localStorage on success', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('srt', 'srt://192.168.1.10:8890');
    expect(localStorage.getItem('video-source')).toBe('srt');
    expect(localStorage.getItem('video-rtsp-url')).toBe('srt://192.168.1.10:8890');
  });

  it('apply udp success removes video-mjpeg-url from localStorage', async () => {
    localStorage.setItem('video-mjpeg-url', 'http://old/feed');
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('udp', 'udp://192.168.1.10:1234');
    expect(localStorage.getItem('video-mjpeg-url')).toBeNull();
  });

  it('switching from mjpeg to ros2 removes video-mjpeg-url from localStorage', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn, onMjpegUrl: vi.fn() });
    await picker.apply('mjpeg', 'http://cam/feed');
    expect(localStorage.getItem('video-mjpeg-url')).toBe('http://cam/feed');
    await picker.apply('ros2');
    expect(localStorage.getItem('video-mjpeg-url')).toBeNull();
  });
});

// ── MJPEG apply ───────────────────────────────────────────────────────────────

describe('VideoSourcePicker.apply — mjpeg', () => {
  it('does not call fetch; calls onMjpegUrl with the URL', async () => {
    const fetchFn = vi.fn();
    const onMjpegUrl = vi.fn();
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn: fetchFn as unknown as typeof fetch, onMjpegUrl });
    const result = await picker.apply('mjpeg', 'http://cam/feed');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onMjpegUrl).toHaveBeenCalledWith('http://cam/feed');
    expect(result).toBe('ok');
  });

  it('persists mjpeg URL to localStorage on success', async () => {
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn: vi.fn() as unknown as typeof fetch, onMjpegUrl: vi.fn() });
    await picker.apply('mjpeg', 'http://cam/feed');
    expect(localStorage.getItem('video-mjpeg-url')).toBe('http://cam/feed');
    expect(localStorage.getItem('video-source')).toBe('mjpeg');
  });

  it('returns validation-error and does not call onMjpegUrl for invalid URL', async () => {
    const onMjpegUrl = vi.fn();
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn: vi.fn() as unknown as typeof fetch, onMjpegUrl });
    const result = await picker.apply('mjpeg', 'rtsp://bad');
    expect(result).toMatch(/^validation-error:/);
    expect(onMjpegUrl).not.toHaveBeenCalled();
  });

  it('apply mjpeg without onMjpegUrl callback returns ok and does not throw', async () => {
    const picker = makePicker(vi.fn() as unknown as typeof fetch);
    const result = await picker.apply('mjpeg', 'http://cam/feed');
    expect(result).toBe('ok');
  });

  it('calls onMjpegUrl(null) when switching away from mjpeg to another mode (on success)', async () => {
    const onMjpegUrl = vi.fn();
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(okResponse());
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn, onMjpegUrl });
    await picker.apply('ros2');
    expect(onMjpegUrl).toHaveBeenCalledWith(null);
  });

  it('does NOT call onMjpegUrl(null) when fetch returns HTTP error', async () => {
    const onMjpegUrl = vi.fn();
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(errResponse(500));
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn, onMjpegUrl });
    await picker.apply('ros2');
    expect(onMjpegUrl).not.toHaveBeenCalled();
  });

  it('does NOT call onMjpegUrl(null) on network error', async () => {
    const onMjpegUrl = vi.fn();
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockRejectedValue(new Error('Failed to fetch'));
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn, onMjpegUrl });
    await picker.apply('ros2');
    expect(onMjpegUrl).not.toHaveBeenCalled();
  });

  it('apply disabled calls onMjpegUrl(null) on success', async () => {
    const onMjpegUrl = vi.fn();
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(okResponse());
    const picker = new VideoSourcePicker({ apiUrl: TEST_API, fetchFn, onMjpegUrl });
    await picker.apply('disabled');
    expect(onMjpegUrl).toHaveBeenCalledWith(null);
  });
});
