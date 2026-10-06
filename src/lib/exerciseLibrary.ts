import type { Cfg, LibraryItem, Logs, Program } from '../types.ts';
/* ---------- Exercise library: every exercise and what is set on it ---------- */
import { EX, allExIds, exInfo, slotsFor } from './data.js';
import { tagsOf, MUSCLES } from './muscles.js';

// Where an exercise is used: the rotation programs (by key), saved/created versions, experiments, and logged sessions.
export function usageOf(exId: string, { programs, library, experiments, logs }: { programs: Record<string, Program>; library?: LibraryItem[]; experiments?: { ex: string }[]; logs?: Logs }) {
  const inProg = (prog: Program | null | undefined) => !!prog && slotsFor(prog).some(s => s.items.some(i => i.ex === exId));
  return {
    programs: ['A', 'B'].filter(k => inProg(programs[k])),
    versions: (library || []).filter(it => { try { return inProg({ ...it.prog, key: 'N' }); } catch { return false; } }).length,
    experiments: (experiments || []).filter(e => e.ex === exId).length,
    logs: ((logs || {})[exId] || []).length,
  };
}

// One row per exercise, alphabetical.
export function libraryRows(cfg: Cfg, state: Parameters<typeof usageOf>[1]) {
  return allExIds(cfg).map(id => {
    const info = exInfo(cfg, id); const tg = tagsOf(cfg, id);
    return {
      id, name: info.n, eq: info.eq || '', url: info.url || '', custom: !EX[id],
      ph: (cfg.exPh && cfg.exPh[id]) || null, rm: cfg.rm[id] ?? null,
      p: tg && !tg.mob ? tg.p || [] : [], s: tg && !tg.mob ? tg.s || [] : [], mob: !!(tg && tg.mob), tagged: !!tg,
      inPrograms: usageOf(id, state).programs,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// q matches the name; muscle matches primary or secondary; eq is exact; 'none' matches exercises with nothing set.
export function filterRows<R extends { name: string; eq: string; p: string[]; s: string[]; tagged: boolean }>(rows: R[], { q = '', eq = '', muscle = '' }: { q?: string; eq?: string; muscle?: string }) {
  const needle = q.trim().toLowerCase();
  return rows.filter(r => (!needle || r.name.toLowerCase().includes(needle))
    && (!eq || (eq === 'none' ? !r.eq : r.eq === eq))
    && (!muscle || (muscle === 'untagged' ? !r.tagged : [...r.p, ...r.s].includes(muscle))));
}

export const muscleList = (keys: string[]) => keys.map(k => ((MUSCLES as Record<string, { n: string }>)[k] ? (MUSCLES as Record<string, { n: string }>)[k].n : k)).join(', ');
