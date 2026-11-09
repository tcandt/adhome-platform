import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../apps/console/', import.meta.url));
async function files(directory, extension) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(file, extension));
    else if (extension.test(entry.name)) result.push(file);
  }
  return result;
}
for (const file of await files(path.join(root, 'src'), /\.[jt]sx?$/)) {
  const source = await readFile(file, 'utf8');
  if (source.includes('UnifiedBuildingCanvas') || source.includes('Sơ đồ & Phòng')) {
    throw new Error(`Legacy building layout must not be shipped: ${path.relative(root, file)}`);
  }
}
const workspace = await readFile(path.join(root, 'src/features/buildings/BuildingWorkspace.tsx'), 'utf8');
if (!workspace.includes('<BuildingDirectory')) throw new Error('BuildingWorkspace must render BuildingDirectory');
if (process.argv.includes('--dist')) {
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/);
  if (!asset) throw new Error('Missing production entry');
  const bundle = await readFile(path.join(root, 'dist', asset[1]), 'utf8');
  if (!bundle.includes('building-directory') || bundle.includes('Sơ đồ & Phòng')) throw new Error('Production entry contains the legacy building layout');
}
console.log('PASS current building workspace only; legacy layout excluded');
