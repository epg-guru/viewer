// The ui-kit ships as plain JSX with no .d.ts (see
// sethwv-plugins-dev/ui-kit). This ambient shim covers only the exports
// epg-viewer actually uses; extend it if more are imported later.
declare module '@swvn-dispatch/dispatch-ui-kit' {
  import type { MantineThemeOverride } from '@mantine/core';
  import type { ComponentType, ReactNode } from 'react';

  export const BRAND_COLOR: string;
  export const BACKGROUND_COLOR: string;
  export const theme: MantineThemeOverride;

  export interface AppProvidersProps {
    children: ReactNode;
    defaultColorScheme?: 'light' | 'dark' | 'auto';
    notificationsPosition?:
      | 'top-left'
      | 'top-right'
      | 'top-center'
      | 'bottom-left'
      | 'bottom-right'
      | 'bottom-center';
  }
  export function AppProviders(props: AppProvidersProps): JSX.Element;

  export interface HeaderAction {
    key: string;
    label: string;
    icon: ComponentType<{ size?: number }>;
    onClick: () => void;
    loading?: boolean;
    active?: boolean;
    count?: number;
  }

  export interface AppHeaderProps {
    logoUrl: string;
    appName?: string;
    version?: string;
    actions?: HeaderAction[];
    onLogout?: () => void;
    githubUrl?: string;
    /** Defaults to ui-kit's own Ko-fi link if omitted (undefined). Pass
     * `null` explicitly to suppress it — the default is a JS default
     * parameter, which only applies for `undefined`, not `null`. */
    kofiUrl?: string | null;
    username?: string;
  }
  export function AppHeader(props: AppHeaderProps): JSX.Element;
}
