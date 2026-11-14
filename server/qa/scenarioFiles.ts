// Reads every scenario file in server/qa/scenarios/ (one scenario per file, `S-nn.ts`, the scenario as the default export).
// This is the version for Node, vitest and tsx: it lists the folder when the module loads. The production server is one bundled
// file with no folder beside it, so scripts/build-server.mjs swaps this module for one with the same list written in at build time.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = fileURLToPath(new URL('./scenarios/', import.meta.url));
const names = readdirSync(dir).filter(name => /^S-\d+\.ts$/.test(name));

export const scenarioModules: readonly { default: unknown }[] = await Promise.all(names.map(name => import(pathToFileURL(dir + name).href)));
