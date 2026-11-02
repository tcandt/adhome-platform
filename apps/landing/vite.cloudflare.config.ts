import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Workers serve frontend assets. The Node/Prisma API stays on its own origin.
// This build deliberately does not import the local API plugin or query a DB.
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: {
    'react-vendor': ['react', 'react-dom'],
    'ui-vendor': ['motion', 'lucide-react'],
  } } } },
});
