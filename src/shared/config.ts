import { DEFAULT_CFG } from '../lib/logic.js';
import type { Cfg } from '../types.ts';
import { validBodyLb, validLiftGoalLb, validMode, validPct, validRepo, validRest, validRm } from './validate.js';

/* ---------- Config shape ----------
   normConfig takes anything (a stored doc, a file, a database snapshot) and returns the keys that can be used.
   Framework-free, so the client and the API share it (ADR 015). */

// The config from a file: the keys the app reads as plain objects must be plain objects, or it would throw on every load.
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const CFG_OBJECTS = ['muscleMap', 'ex', 'pct', 'rxOverride', 'rm', 'phDef', 'exPh', 'progNames', 'liftGoals'];
export function normConfig(c: any): Partial<Cfg> {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
  const out: any = { ...c };
  CFG_OBJECTS.forEach(k => { if (k in out && (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k]))) delete out[k]; });
  if ('mode' in out && !validMode(out.mode)) delete out.mode;
  if ('rest' in out && !validRest(out.rest)) delete out.rest;
  const own = (o: any, f: (k: string, v: any) => unknown) => { const r: Record<string, unknown> = {}; Object.entries(o).forEach(([k, v]) => { if (!UNSAFE.has(k)) { const x = f(k, v); if (x !== undefined) r[k] = x; } }); return r; };
  if (out.pct) out.pct = { ...DEFAULT_CFG.pct, ...own(out.pct, (k, v) => (typeof v === 'number' && validPct(v) ? v : undefined)) };
  if (out.rm) out.rm = own(out.rm, (k, v) => (typeof v === 'number' && validRm(v) ? v : undefined));
  if (out.liftGoals) out.liftGoals = own(out.liftGoals, (k, byKey) => (byKey && typeof byKey === 'object' && !Array.isArray(byKey) ? own(byKey, (_k, g) => (g && typeof g === 'object' && typeof g.w === 'number' && validLiftGoalLb(g.w) ? g : undefined)) : undefined));
  if ('bwGoal' in out && !(out.bwGoal && typeof out.bwGoal === 'object' && typeof out.bwGoal.w === 'number' && validBodyLb(out.bwGoal.w))) delete out.bwGoal;
  if ('backup' in out && !(out.backup && typeof out.backup === 'object' && validRepo(out.backup.repo))) delete out.backup;
  return out;
}
