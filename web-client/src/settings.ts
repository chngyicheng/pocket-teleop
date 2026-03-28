// Settings routing state and video URL / robot namespace persistence (localStorage).
const VIDEO_URL_KEY = 'pocket-teleop.video-url';
const NAMESPACE_KEY = 'pocket-teleop.robot-namespace';

export type SettingsPage = 'gamepad' | 'video' | 'connection';

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

export function loadRobotNamespace(): string | null {
  return localStorage.getItem(NAMESPACE_KEY);
}

export function saveRobotNamespace(ns: string): void {
  localStorage.setItem(NAMESPACE_KEY, ns);
}

export function clearRobotNamespace(): void {
  localStorage.removeItem(NAMESPACE_KEY);
}
