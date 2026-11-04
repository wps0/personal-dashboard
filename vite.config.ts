import {execSync} from 'node:child_process';
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

/**
 * The commit the app is built from: GitHub Actions' GITHUB_SHA, else the
 * checkout's HEAD; '' outside a git checkout.
 */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim();
  } catch {
    return '';
  }
}

/** The repository's page on GitHub, when built by GitHub Actions; else ''. */
function sourceUrl(): string {
  const {GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo} = process.env;
  return server && repo ? `${server}/${repo}` : '';
}

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/.
  base: './',
  // The version shown in Settings → App (see src/env.d.ts).
  define: {
    'import.meta.env.APP_COMMIT': JSON.stringify(commit()),
    'import.meta.env.APP_BUILT_AT': JSON.stringify(new Date().toISOString()),
    'import.meta.env.APP_SOURCE_URL': JSON.stringify(sourceUrl()),
  },
  plugins: [react(), tailwindcss(), assetManifest(), devInlineStyles()],
  test: {
    environment: 'node',
  },
});
