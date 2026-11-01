#!/usr/bin/env node
// Rewrites server/qa/builtinPrograms.ts from BUILTIN in src/lib/data.ts (server/ may not import src/lib, ADR 015, so the QA seed reads a plain-data copy).
//   npx tsx scripts/qa-builtin-programs.mjs
import { writeFileSync } from 'node:fs';
import { BUILTIN } from '../src/lib/data.ts';
const head = "/* The two built-in programs, as plain data (generated from src/lib/data.ts BUILTIN: `npx tsx scripts/qa-builtin-programs.mjs`). server/ may not import src/lib (ADR 015), so the QA seed reads this copy; src/lib/qaBuiltinPrograms.test.ts fails when it drifts from BUILTIN. */\nexport const BUILTIN_PROGRAMS: Record<'A' | 'B', { days: { slots: { items: { ex: string; [k: string]: unknown }[]; [k: string]: unknown }[]; [k: string]: unknown }[]; [k: string]: unknown }> = ";
writeFileSync('server/qa/builtinPrograms.ts', `${head}${JSON.stringify({ A: BUILTIN.A, B: BUILTIN.B }, null, 1)};\n`);
