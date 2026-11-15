// Bundles the API into one file, dist-server/index.mjs, with everything it needs inside: server/, the src/shared code it
// imports, and its npm packages (express, kysely, pg). The production image then needs only Node and this file: no
// node_modules, no TypeScript at runtime, and a fast cold start (ADR 010).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// The QA scenarios are one file each in server/qa/scenarios/. server/qa/scenarioFiles.ts lists that folder when it loads, which a
// bundle with no folder beside it cannot do, so here the same list is written in at build time: one import per file, no index to edit.
const scenarioDir = fileURLToPath(new URL('../server/qa/scenarios/', import.meta.url));
const scenarioFilesPlugin = {
  name: 'scenario-files',
  setup(b) {
    b.onResolve({ filter: /scenarioFiles\.ts$/ }, args => ({ path: args.path, namespace: 'scenario-files' }));
    b.onLoad({ filter: /.*/, namespace: 'scenario-files' }, () => {
      const names = readdirSync(scenarioDir).filter(name => /^S-\d+\.ts$/.test(name));
      const imports = names.map((name, i) => `import s${i} from ${JSON.stringify(scenarioDir + name)};`);
      return { contents: `${imports.join('\n')}\nexport const scenarioModules = [${names.map((_, i) => `{ default: s${i} }`).join(', ')}];\n`, loader: 'js', resolveDir: scenarioDir };
    });
  },
};

await build({
  plugins: [scenarioFilesPlugin],
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
