import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SearchScope = 'channels' | 'programmes' | 'both';

interface SettingsState {
  /** Optional user-deployed CORS proxy (see proxy/ in the repo). Only used
   * as a fallback when a direct fetch to an EPG source fails. */
  corsProxyUrl: string | null;
  /** Which fields the search box matches against. */
  searchScope: SearchScope;
  setCorsProxyUrl: (url: string | null) => void;
  setSearchScope: (scope: SearchScope) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      corsProxyUrl: null,
      searchScope: 'both',
      setCorsProxyUrl: (corsProxyUrl) => set({ corsProxyUrl }),
      setSearchScope: (searchScope) => set({ searchScope }),
    }),
    { name: 'epg-viewer.settings.v1' },
  ),
);
