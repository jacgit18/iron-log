// Bundles the API into one file, dist-server/index.mjs, with everything it needs inside: server/, the src/shared code it
// imports, and its npm packages (express, kysely, pg). The production image then needs only Node and this file: no
// node_modules, no TypeScript at runtime, and a fast cold start (ADR 010).
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/index.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // pg loads its native binding only if it is installed; it is not, and pg falls back to plain JavaScript.
  external: ['pg-native'],
  // Some bundled packages (express, pg) use require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});
