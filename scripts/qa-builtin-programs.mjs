#!/usr/bin/env node
// Rewrites server/qa/builtinPrograms.ts from BUILTIN in src/lib/data.ts (server/ may not import src/lib, ADR 015, so the QA seed reads a plain-data copy).
//   npx tsx scripts/qa-builtin-programs.mjs
import { writeFileSync } from 'node:fs';
import { BUILTIN, EX } from '../src/lib/data.ts';
const head = "/* The two built-in programs, as plain data (generated from src/lib/data.ts BUILTIN: `npx tsx scripts/qa-builtin-programs.mjs`). server/ may not import src/lib (ADR 015), so the QA seed reads this copy; src/lib/qaBuiltinPrograms.test.ts fails when it drifts from BUILTIN. */\nexport const BUILTIN_PROGRAMS: Record<'A' | 'B', { days: { slots: { items: { ex: string; [k: string]: unknown }[]; [k: string]: unknown }[]; [k: string]: unknown }[]; [k: string]: unknown }> = ";
writeFileSync('server/qa/builtinPrograms.ts', `${head}${JSON.stringify({ A: BUILTIN.A, B: BUILTIN.B }, null, 1)};\n`);
// The built-in exercise names, for the library list: a synced account lists only cfg.ex (ADR 024), so the seed writes these into it.
const exHead = "/* The built-in exercises (id to name and equipment), as plain data (generated from src/lib/data.ts EX: `npx tsx scripts/qa-builtin-programs.mjs`). The QA seed writes them into a program persona's cfg.ex so the exercise library lists them (a synced account lists only cfg.ex, ADR 024); src/lib/qaBuiltinPrograms.test.ts fails when it drifts from EX. */\nexport const BUILTIN_EXERCISES: Record<string, { n: string; eq?: string; url?: string }> = ";
writeFileSync('server/qa/builtinExercises.ts', `${exHead}${JSON.stringify(EX, null, 1)};\n`);
