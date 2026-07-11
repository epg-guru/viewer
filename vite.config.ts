import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Short commit hash for the build, or "dev" when git isn't available. */
function commitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

const HASH = commitHash();

/** Stamp the commit hash into the copied service worker's cache name, so every
 * deploy gets a fresh cache and the SW's activate handler purges the old one
 * (sw.js lives in public/ and isn't processed by the `define` replacement). */
function swCacheVersion(hash: string): Plugin {
  return {
    name: 'sw-cache-version',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const swPath = resolve(process.cwd(), 'dist/sw.js');
      try {
        const src = readFileSync(swPath, 'utf-8');
        writeFileSync(swPath, src.replace(/__BUILD_HASH__/g, hash));
      } catch {
        // No sw.js in the output (unexpected); nothing to stamp.
      }
    },
  };
}

// Relative base so the same build works whether served from a domain
// root (viewer.epg.guru via CNAME) or a subpath (e.g. GitHub Pages
// project page /viewer/) — avoids hardcoding a single deploy target.
export default defineConfig({
  base: './',
  plugins: [react(), swCacheVersion(HASH)],
  resolve: {
    dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks', '@mantine/notifications'],
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(HASH),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  worker: {
    format: 'es',
  },
});
