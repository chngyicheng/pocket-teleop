// Settings routing state and video URL persistence (localStorage).
const VIDEO_URL_KEY = 'pocket-teleop.video-url';

export type SettingsPage = 'gamepad' | 'video' | 'connection' | 'account';

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
