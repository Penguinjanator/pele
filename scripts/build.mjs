import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/pele.js',
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'warning',
});

execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });

const code = readFileSync('dist/pele.js');
const kb = (bytes) => (bytes / 1024).toFixed(1) + ' kB';
console.log(`dist/pele.js  ${kb(code.length)} minified, ${kb(gzipSync(code).length)} gzipped`);
