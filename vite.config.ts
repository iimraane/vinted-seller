import { cp, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Chrome executes content scripts as classic scripts, even when the extension
 * service worker is a module. Build them separately: content.js must be a
 * self-contained IIFE while background.js remains an ES module.
 */
export default defineConfig(({ mode }) => {
  const isContent = mode === 'content';
  return {
  build: {
    outDir: 'dist',
    emptyOutDir: !isContent,
    rollupOptions: {
      input: isContent
        ? resolve(root, 'src/content/index.ts')
        : resolve(root, 'src/background/index.ts'),
      output: {
        entryFileNames: isContent ? 'content.js' : 'background.js',
        format: isContent ? 'iife' : 'es',
        inlineDynamicImports: isContent
      }
    }
  },
  plugins: [{
    name: 'copy-extension-assets',
    async closeBundle() {
      await mkdir(resolve(root, 'dist'), { recursive: true });
      await copyFile(resolve(root, 'src/manifest.json'), resolve(root, 'dist/manifest.json'));
      await cp(resolve(root, 'assets/icons'), resolve(root, 'dist/icons'), { recursive: true });
    }
  }]
  };
});
