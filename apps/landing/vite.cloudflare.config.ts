import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One classic deferred bundle avoids stale Safari module-map/dependency failures.
// Keep the Node/Prisma API out of this frontend build.
export default defineConfig({
  plugins: [react(), {
    name: 'landing-classic-entry',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'asset' && output.fileName.endsWith('.html')) {
          output.source = String(output.source).replace(
            /<script type="module" crossorigin src=/g, '<script defer src=',
          );
        }
      }
    },
  }],
  build: {
    target: 'safari15',
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
