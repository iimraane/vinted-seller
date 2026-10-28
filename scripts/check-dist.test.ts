import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateArchive, validateDist } from './check-dist.js';

const temporaryDirectories: string[] = [];
const iconSizes = ['16', '32', '48', '128'];

function pngHeader(size: number): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(size, 16);
  header.writeUInt32BE(size, 20);
  return header;
}

async function makeDist(missingIcon?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'vinted-dist-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, 'icons'));
  await writeFile(join(directory, 'background.js'), '');
  await writeFile(join(directory, 'content.js'), '');
  await Promise.all(iconSizes
    .filter((size) => size !== missingIcon)
    .map((size) => writeFile(join(directory, 'icons', `icon-${size}.png`), pngHeader(Number(size)))));
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({
    background: { service_worker: 'background.js' },
    content_scripts: [{ matches: ['https://www.vinted.fr/*'], js: ['content.js'] }],
    icons: Object.fromEntries(iconSizes.map((size) => [size, `icons/icon-${size}.png`]))
  }));
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Chrome release validation', () => {
  it('rejects a dist folder when a manifest-declared icon is absent', async () => {
    await expect(validateDist(await makeDist('48'))).rejects.toThrow('icon-48.png');
  });

  it('rejects an archive when it omits a declared icon', async () => {
    const dist = await makeDist();
    await rm(join(dist, 'icons', 'icon-128.png'));
    const archive = join(dist, 'release.zip');
    execFileSync('zip', ['-q', archive, 'manifest.json', 'background.js', 'content.js', 'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png'], { cwd: dist });

    const manifest = await validateDist(await makeDist());
    await expect(validateArchive(archive, manifest)).rejects.toThrow('icons/icon-128.png');
  });

  it('rejects a declared icon whose PNG dimensions do not match its manifest size', async () => {
    const dist = await makeDist();
    await writeFile(join(dist, 'icons', 'icon-48.png'), pngHeader(47));
    await expect(validateDist(dist)).rejects.toThrow('48x48px; got 47x47px');
  });
});
