import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@swvn-dispatch/dispatch-ui-kit';
import '@swvn-dispatch/dispatch-ui-kit/styles.css';
import { App } from './App';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is best-effort */
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
