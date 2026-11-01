import type {Plugin} from 'vite';
import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Writes asset-manifest.json, the list of built files, so the service worker
 * (public/sw.js) can cache all of them for offline use, including lazily
 * loaded chunks and fonts that the page doesn't reference directly.
 */
const assetManifest = (): Plugin => ({
  name: 'asset-manifest',
  apply: 'build',
  generateBundle(_, bundle) {
    this.emitFile({
      type: 'asset',
      fileName: 'asset-manifest.json',
      source: JSON.stringify(
        Object.keys(bundle).filter(f => f.startsWith('assets/')),
      ),
    });
  },
});

/**
 * The dev server only: lets Vite add its styles, which it injects as inline
 * <style> tags that index.html's CSP (style-src 'self') blocks. The built
 * app keeps the strict policy.
 */
const devInlineStyles = (): Plugin => ({
  name: 'dev-inline-styles',
  apply: 'serve',
  transformIndexHtml: html =>
    html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
});

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/.
  base: './',
  plugins: [react(), tailwindcss(), assetManifest(), devInlineStyles()],
  test: {
    environment: 'node',
  },
});
