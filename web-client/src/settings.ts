// Settings routing state and video URL persistence (localStorage).
const VIDEO_URL_KEY = 'pocket-teleop.video-url';
const MAX_SPEED_KEY = 'pocket-teleop.max-speed';
const GEOFENCES_KEY = 'pocket-teleop.geofences';

export type SettingsPage = 'gamepad' | 'video' | 'connection' | 'account';

export const SPEED_LIMITS = { linMin: 0.1, linMax: 2.0, angMin: 0.1, angMax: 3.0, step: 0.1 } as const;

export interface MaxSpeed {
  maxLinear: number;
  maxAngular: number;
}

export class SettingsRouter {
  activePage: SettingsPage = 'gamepad';
  onNavigate?: (page: SettingsPage) => void;

  navigate(page: SettingsPage): void {
    this.activePage = page;
    this.onNavigate?.(page);
  }
}

export function loadVideoUrl(): string | null {
  try {
    return localStorage.getItem(VIDEO_URL_KEY);
  } catch {
    return null;
  }
}

export function saveVideoUrl(url: string): void {
  try {
    localStorage.setItem(VIDEO_URL_KEY, url);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function clearVideoUrl(): void {
  try {
    localStorage.removeItem(VIDEO_URL_KEY);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function clampLinear(v: number): number {
  const clamped = Math.max(SPEED_LIMITS.linMin, Math.min(SPEED_LIMITS.linMax, v));
  return Math.round(clamped * 10) / 10;
}

export function clampAngular(v: number): number {
  const clamped = Math.max(SPEED_LIMITS.angMin, Math.min(SPEED_LIMITS.angMax, v));
  return Math.round(clamped * 10) / 10;
}

export function loadMaxSpeed(): MaxSpeed {
  try {
    const json = localStorage.getItem(MAX_SPEED_KEY);
    if (!json) {
      return { maxLinear: 1.0, maxAngular: 1.0 };
    }
    const parsed = JSON.parse(json) as { maxLinear?: unknown; maxAngular?: unknown };
    if (typeof parsed.maxLinear !== 'number' || typeof parsed.maxAngular !== 'number') {
      return { maxLinear: 1.0, maxAngular: 1.0 };
    }
    return {
      maxLinear: clampLinear(parsed.maxLinear),
      maxAngular: clampAngular(parsed.maxAngular),
    };
  } catch {
    return { maxLinear: 1.0, maxAngular: 1.0 };
  }
}

export function saveMaxSpeed(s: MaxSpeed): void {
  try {
    const clamped = {
      maxLinear: clampLinear(s.maxLinear),
      maxAngular: clampAngular(s.maxAngular),
    };
    localStorage.setItem(MAX_SPEED_KEY, JSON.stringify(clamped));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/**
 * Load geofences from localStorage.
 * Returns empty array on error or missing data.
 */
export function loadFences(): Array<{ vertices: [number, number][] }> {
  try {
    const json = localStorage.getItem(GEOFENCES_KEY);
    if (!json) {
      return [];
    }
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Validate each fence has vertices array
    return parsed.filter(
      (f) => f && typeof f === 'object' && Array.isArray(f.vertices)
    );
  } catch {
    return [];
  }
}

/**
 * Save geofences to localStorage.
 */
export function saveFences(fences: Array<{ vertices: [number, number][] }>): void {
  try {
    localStorage.setItem(GEOFENCES_KEY, JSON.stringify(fences));
  } catch {
    // localStorage unavailable — silently ignore
  }
}
