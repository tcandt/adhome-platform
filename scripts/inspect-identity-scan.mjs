import { createRequire } from 'node:module';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(resolve('node_modules/.pnpm/sharp@0.34.4/node_modules/sharp'));
const folders = [
  'C:/Users/TINH-NGUYEN/.codex/codex-remote-attachments/01a1a1c7-6f60-79f0-be4f-718345902c22/DA52F6AE-26D2-4ECE-92BC-AF5F3DB98C6D',
  'C:/Users/TINH-NGUYEN/.codex/codex-remote-attachments/01a1a051-cee0-7753-8be6-0b3489213e3b/59C3B04C-FECB-410B-B1DD-5E336CFA1D60',
];
await mkdir('.artifacts/identity-scan', { recursive: true });
for (const [batch, folder] of folders.entries()) {
  const files = (await readdir(folder)).filter(name => /\.jpg$/i.test(name)).sort((a, b) => parseInt(a) - parseInt(b));
  const composite = [];
  for (const [index, file] of files.entries()) {
    const image = await sharp(join(folder, file)).rotate().resize(240, 230, { fit: 'contain', background: '#dedede' }).png().toBuffer();
    composite.push({ input: image, left: index % 5 * 250, top: Math.floor(index / 5) * 260 + 24 });
    const label = Buffer.from(`<svg width="240" height="22"><text x="6" y="17" font-size="16">${index + 1}</text></svg>`);
    composite.push({ input: label, left: index % 5 * 250, top: Math.floor(index / 5) * 260 });
  }
  const image = await sharp({ create: { width: 1250, height: 520, channels: 3, background: '#dedede' } }).composite(composite).png().toBuffer();
  await writeFile(`.artifacts/identity-scan/contact-${batch + 1}.png`, image);
}
