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
    expect(picker.loadSaved()).toEqual({ mode: 'ros2', rtspUrl: '' });
  });

  it('returns stored mode and rtsp URL', () => {
    localStorage.setItem('video-source', 'rtsp');
    localStorage.setItem('video-rtsp-url', 'rtsp://cam:554/live');
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'rtsp', rtspUrl: 'rtsp://cam:554/live' });
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

  it('removes rtsp URL when mode is not rtsp', () => {
    localStorage.setItem('video-rtsp-url', 'rtsp://old:554/live');
    const picker = makePicker(vi.fn());
    picker.save('ros2', '');
    expect(localStorage.getItem('video-rtsp-url')).toBeNull();
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
});
