const VIDEO_URL_KEY = 'pocket-teleop.video-url';

export type SettingsPage = 'gamepad' | 'video';

export class SettingsRouter {
  activePage: SettingsPage = 'gamepad';
  onNavigate?: (page: SettingsPage) => void;

  navigate(page: SettingsPage): void {
    this.activePage = page;
    this.onNavigate?.(page);
  }
}

export function loadVideoUrl(): string | null {
  return localStorage.getItem(VIDEO_URL_KEY);
}

export function saveVideoUrl(url: string): void {
  localStorage.setItem(VIDEO_URL_KEY, url);
}

export function clearVideoUrl(): void {
  localStorage.removeItem(VIDEO_URL_KEY);
}
