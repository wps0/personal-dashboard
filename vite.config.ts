import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/.
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
});
