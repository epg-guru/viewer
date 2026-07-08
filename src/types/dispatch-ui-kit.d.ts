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
    kofiUrl?: string;
    username?: string;
  }
  export function AppHeader(props: AppHeaderProps): JSX.Element;
}
