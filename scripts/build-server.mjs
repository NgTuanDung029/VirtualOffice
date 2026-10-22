import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('dist/server');
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/server/index.mjs',
  banner: {
    js: `import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);`,
  },
});

console.log('[build:server] Built dist/server/index.mjs successfully.');
