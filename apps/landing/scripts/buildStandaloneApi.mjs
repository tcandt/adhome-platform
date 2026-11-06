import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite'));
const { build } = viteRequire('esbuild');

await build({
  entryPoints: [fileURLToPath(new URL('../server/standalone.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist-api/server.mjs', import.meta.url)),
  bundle: true,
  packages: 'external',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
});
