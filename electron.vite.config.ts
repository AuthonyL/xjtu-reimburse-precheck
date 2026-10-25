import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bundleNoticesPlugin } from './scripts/lib/bundle-notices.js';

process.env.electron_config_cache ??= resolve('.electron-cache');
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig(({ command }) => ({
  main: {
    plugins: [bundleNoticesPlugin()],
    define: {
      __DEFAULTS_SHA256__: JSON.stringify(
        createHash('sha256')
          .update(readFileSync(resolve('src/core/rules/defaults.json')))
          .digest('hex'),
      ),
    },
    build: {
      externalizeDeps: false,
      minify: true,
      rolldownOptions: {
        input: { index: resolve('src/main/index.ts'), core: resolve('src/core/index.ts') },
        preserveEntrySignatures: 'strict',
        output: { format: 'es', entryFileNames: '[name].js' },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      isolatedEntries: true,
      rolldownOptions: {
        input: { index: resolve('src/preload/index.ts'), boc: resolve('src/preload/boc.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    build: { minify: true },
    plugins: [
      react(),
      bundleNoticesPlugin(),
      {
        name: 'local-csp',
        transformIndexHtml(html) {
          return html.replace(
            '__CONNECT_SRC__',
            command === 'serve' ? "'self' ws://localhost:* ws://127.0.0.1:*" : "'none'",
          );
        },
      },
    ],
    html: { cspNonce: 'precheck-vite' },
  },
}));
