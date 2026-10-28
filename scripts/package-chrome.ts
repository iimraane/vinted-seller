import { mkdir, readdir, rm, utimes } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateArchive, validateDist } from './check-dist.js';

const execFileAsync = promisify(execFile);
const zipTimestamp = new Date('1980-01-01T00:00:00.000Z');

async function archiveEntries(directory: string, root: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await archiveEntries(path, root));
    else if (entry.isFile()) files.push(relative(root, path));
  }
  return files;
}

export async function packageChrome(cwd = process.cwd()): Promise<string> {
  const dist = resolve(cwd, 'dist');
  const release = resolve(cwd, 'release');
  const archive = resolve(release, 'vinted-phone-margin-extension.zip');
  const manifest = await validateDist(dist);
  await mkdir(release, { recursive: true });
  await rm(archive, { force: true });

  const entries = (await archiveEntries(dist, dist)).sort();
  await Promise.all(entries.map((entry) => utimes(resolve(dist, entry), zipTimestamp, zipTimestamp)));
  // `-X`, stable timestamps, and a sorted explicit list make repeat builds byte-for-byte reproducible.
  await execFileAsync('zip', ['-X', '-q', archive, ...entries], { cwd: dist });
  await validateArchive(archive, manifest);
  return archive;
}

if (process.argv[1]?.endsWith('package-chrome.ts')) {
  const archive = await packageChrome();
  console.log(`Chrome Web Store archive verified: ${archive}`);
}
