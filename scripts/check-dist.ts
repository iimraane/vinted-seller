import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

interface ExtensionManifest {
  background?: { service_worker?: string };
  content_scripts?: Array<{ matches?: string[]; js?: string[] }>;
  icons?: Record<string, string>;
}

const execFileAsync = promisify(execFile);
const requiredIconSizes = ['16', '32', '48', '128'];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function validatePngIcon(path: string, size: string): Promise<void> {
  const contents = await readFile(path);
  if (contents.length < 24 || !contents.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`Declared icon ${path} is not a valid PNG.`);
  }
  if (contents.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`Declared icon ${path} is missing its PNG IHDR header.`);
  }
  const width = contents.readUInt32BE(16);
  const height = contents.readUInt32BE(20);
  const expected = Number(size);
  if (width !== expected || height !== expected) {
    throw new Error(`Declared icon ${path} must be ${expected}x${expected}px; got ${width}x${height}px.`);
  }
}

export async function validateDist(dist = resolve('dist')): Promise<ExtensionManifest> {
  const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8')) as ExtensionManifest;
  const worker = manifest.background?.service_worker;
  const content = manifest.content_scripts?.[0];

  if (!worker || !content?.js?.length) throw new Error('Built manifest is missing extension entry points.');
  if (!content.matches?.some((match) => /^https:\/\/www\.vinted\.(?:fr|com)\/\*/.test(match))) {
    throw new Error('Built manifest is missing a Vinted content-script match.');
  }
  const icons = manifest.icons;
  if (!icons || requiredIconSizes.some((size) => !icons[size])) {
    throw new Error('Built manifest must declare 16, 32, 48, and 128 px icons.');
  }
  await Promise.all([worker, ...content.js]
    .map((entry) => access(resolve(dist, entry))));
  await Promise.all(requiredIconSizes.map(async (size) => {
    const icon = icons[size]!;
    const iconPath = resolve(dist, icon);
    await access(iconPath);
    await validatePngIcon(iconPath, size);
  }));
  const contentSource = await readFile(resolve(dist, content.js[0]), 'utf8');
  if (/^\s*import\s/m.test(contentSource)) {
    throw new Error('Built content script is not self-contained; Chrome cannot execute module imports in content scripts.');
  }
  return manifest;
}

export async function validateArchive(archive: string, manifest: ExtensionManifest): Promise<void> {
  const { stdout } = await execFileAsync('unzip', ['-Z1', archive]);
  const entries = new Set(stdout.split('\n').filter(Boolean));
  const worker = manifest.background?.service_worker;
  const content = manifest.content_scripts?.[0];
  const icons = manifest.icons;
  const requiredEntries = ['manifest.json', worker, ...(content?.js ?? []), ...requiredIconSizes.map((size) => icons?.[size])];
  const missing = requiredEntries.filter((entry): entry is string => Boolean(entry) && !entries.has(entry));
  if (missing.length) throw new Error(`Release archive is missing: ${missing.join(', ')}`);
}

if (process.argv[1]?.endsWith('check-dist.ts')) {
  await validateDist();
  console.log('Built manifest entry points, declared icons, and Vinted matches are valid.');
}
