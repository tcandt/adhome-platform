import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync } from 'node:fs';

function consoleAssetPolicy(): Plugin {
  const install = (server: any, preview = false) => server.middlewares.use((req: any, res: any, next: () => void) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname.startsWith('/assets/') && preview) {
      const assetRoot = path.resolve(server.config.root, server.config.build.outDir, 'assets');
      let file: string;
      try { file = path.resolve(assetRoot, decodeURIComponent(pathname.slice('/assets/'.length))); } catch { res.statusCode = 400; res.end(); return; }
      if (!file.startsWith(assetRoot + path.sep) || !existsSync(file)) {
        res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end('Asset not found'); return;
      }
    }
    if (!pathname.startsWith('/assets/') && !pathname.startsWith('/api/')) {
      const writeHead = res.writeHead;
      res.writeHead = function (...args: any[]) { this.setHeader('Cache-Control', 'no-store'); return writeHead.apply(this, args); };
    }
    next();
  });
  return { name: 'console-asset-policy', configureServer: server => { install(server); }, configurePreviewServer: server => { install(server, true); } };
}

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [consoleAssetPolicy(), legacyDomainRedirectPlugin(), react()],
  // Keep hashed chunks referenced by tabs that were opened before a rebuild.
  build: { emptyOutDir: false },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.ADHOME_API_TARGET || 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.ADHOME_API_TARGET || 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
    },
  },
});
