import { DEFAULT_CFG } from '../lib/logic.js';
import type { Cfg, WarmupItem } from '../types.ts';
import { LIMITS, validBodyLb, validGoal, validLiftGoalLb, validMode, validPct, validRepo, validRest, validRm } from './validate.js';

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

/* ---------- The config document the API stores ----------
   normConfigDoc keeps only the settings that belong on the server and cleans them with normConfig's rules plus a few
   more. The GitHub backup settings (`backup`, `ghBackup`) stay on the device: they belong to the stand-in backup
   features, and a standalone backup may hold a token. Unknown keys are dropped. */

export interface ConfigDoc extends Partial<Omit<Cfg, 'backup' | 'ghBackup'>> {
  waterGoal?: number;
  waterMode?: 'weight' | 'fixed';
}

const DOC_KEYS = ['ex', 'muscleMap', 'mode', 'm3Start', 'm3First', 'm2Even', 'pct', 'rxOverride', 'rm', 'phDef', 'exPh', 'progNames', 'bwGoal', 'liftGoals', 'rest', 'warmup'] as const;
const progKey = (v: unknown) => v === 'A' || v === 'B';
const MAX_WARMUP = 50;

export function normConfigDoc(c: unknown): ConfigDoc | null {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const clean = normConfig(c) as Record<string, unknown>;
  const raw = c as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  DOC_KEYS.forEach(k => { if (k in clean) out[k] = clean[k]; });
  if ('m3Start' in out && !(Number.isInteger(out.m3Start) && (out.m3Start as number) >= 1 && (out.m3Start as number) <= 12)) delete out.m3Start;
  if ('m3First' in out && !progKey(out.m3First)) delete out.m3First;
  if ('m2Even' in out && !progKey(out.m2Even)) delete out.m2Even;
  if ('warmup' in out) {
    const list = Array.isArray(out.warmup) ? (out.warmup as unknown[]) : [];
    const seen = new Set<string>();
    const items: WarmupItem[] = [];
    list.slice(0, MAX_WARMUP).forEach(w => {
      const x = w as Record<string, unknown> | null;
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id || x.id.length > LIMITS.text.id || seen.has(x.id)) return;
      if (typeof x.n !== 'string' || !x.n.trim() || typeof x.rx !== 'string') return;
      seen.add(x.id);
      items.push({ id: x.id, n: x.n.trim().slice(0, LIMITS.program.name), rx: x.rx.slice(0, LIMITS.program.rx) });
    });
    if (Array.isArray(out.warmup)) out.warmup = items;
    else delete out.warmup;
  }
  const goal = Number(raw.waterGoal);
  if (validGoal(goal)) out.waterGoal = Math.round(goal * 10) / 10;
  if (raw.waterMode === 'weight' || raw.waterMode === 'fixed') out.waterMode = raw.waterMode;
  return out as ConfigDoc;
}
