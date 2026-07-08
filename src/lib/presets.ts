export interface Preset {
  name: string;
  url: string;
}

const STORAGE_KEY = 'epg-viewer.presets.v1';

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Preset => typeof p?.name === 'string' && typeof p?.url === 'string',
    );
  } catch {
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function addPreset(name: string, url: string): Preset[] {
  const presets = loadPresets().filter((p) => p.url !== url);
  presets.push({ name, url });
  savePresets(presets);
  return presets;
}

export function removePreset(url: string): Preset[] {
  const presets = loadPresets().filter((p) => p.url !== url);
  savePresets(presets);
  return presets;
}
