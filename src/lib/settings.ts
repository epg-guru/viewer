export interface Settings {
  /** Optional user-deployed CORS proxy (see proxy/ in the repo). Only used
   * as a fallback when a direct fetch to an EPG source fails. */
  corsProxyUrl: string | null;
}

const STORAGE_KEY = 'epg-viewer.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { corsProxyUrl: null };
    const parsed = JSON.parse(raw);
    return { corsProxyUrl: typeof parsed?.corsProxyUrl === 'string' ? parsed.corsProxyUrl : null };
  } catch {
    return { corsProxyUrl: null };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
