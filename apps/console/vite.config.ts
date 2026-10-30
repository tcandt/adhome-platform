import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function legacyDomainRedirectPlugin(): Plugin {
  const handler = (req: any, res: any, next: () => void) => {
    const rawHost = String(
      req.headers['x-forwarded-host'] || req.headers.host || ''
    )
      .split(',')[0]
      .trim()
      .toLowerCase();
    const hostWithoutPort = rawHost.replace(/:\d+$/, '');
    const rawUrl = req.url || '/';

    if (hostWithoutPort === 'console-adhome.ductinh.one') {
      res.statusCode = 301;
      res.setHeader('Location', `https://console.adhome.vn${rawUrl}`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end();
      return;
    }
    if (hostWithoutPort === 'adhome.ductinh.one') {
      res.statusCode = 301;
      res.setHeader('Location', `https://adhome.vn${rawUrl}`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end();
      return;
    }
    next();
  };

  return {
    name: 'adhome-console-legacy-domain-redirect',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

const apiTarget = process.env.ADHOME_API_TARGET || 'http://127.0.0.1:8081';

// https://vite.dev/config/
export default defineConfig({
  plugins: [legacyDomainRedirectPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
