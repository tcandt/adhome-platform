import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The API plugin reloads its middleware bundle when server sources change.
import { adhomePublicApiPlugin } from './server/publicApiPlugin';

export default defineConfig({
  plugins: [react(), adhomePublicApiPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['motion', 'lucide-react'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 8081,
  },
});
