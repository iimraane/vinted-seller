import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageChrome } from './package-chrome.js';

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

async function makeDist(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vinted-package-'));
  temporaryDirectories.push(root);
  const dist = join(root, 'dist');
  await mkdir(join(dist, 'icons'), { recursive: true });
  await writeFile(join(dist, 'background.js'), 'console.log("background");');
  await writeFile(join(dist, 'content.js'), 'console.log("content");');
  await Promise.all(iconSizes.map((size) => writeFile(join(dist, 'icons', `icon-${size}.png`), pngHeader(Number(size)))));
  await writeFile(join(dist, 'manifest.json'), JSON.stringify({
    background: { service_worker: 'background.js' },
    content_scripts: [{ matches: ['https://www.vinted.fr/*'], js: ['content.js'] }],
    icons: Object.fromEntries(iconSizes.map((size) => [size, `icons/icon-${size}.png`]))
  }));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Chrome release packaging', () => {
  it('executes the archive entry point and includes each manifest asset at the archive root', async () => {
    const root = await makeDist();
    const archive = await packageChrome(root);
    const bytes = await readFile(archive);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');

    const { stdout } = await import('node:child_process').then(({ execFile }) => new Promise<{ stdout: string }>((resolve, reject) => {
      execFile('unzip', ['-Z1', archive], (error, output) => error ? reject(error) : resolve({ stdout: output }));
    }));
    expect(stdout.split('\n')).toEqual(expect.arrayContaining([
      'manifest.json', 'background.js', 'content.js',
      ...iconSizes.map((size) => `icons/icon-${size}.png`)
    ]));
  });
});
