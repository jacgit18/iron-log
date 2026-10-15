import type { DBAdapter } from '@better-auth/core/db/adapter';
import type { PiiCrypto } from './piiCrypto.ts';

/* ---------- Better Auth's database adapter, with names and emails sealed on the way in and opened on the way out (ADR 046) ----------
   Sits between Better Auth and the Kysely adapter. Better Auth never sees ciphertext: it hands over a plain email, this wraps it
   before the query and unwraps the rows that come back (including the `user` joined onto a session). The model names seen here
   are Better Auth's own (`user`, `verification`), not the table names (`auth.user`); the Kysely adapter maps those.

   user.email           stable   looked up (`where email = ?`) and unique, so the same address must give the same ciphertext
   user.name, user.image random  never looked up
   verification.identifier  stable, only when it holds an address (the emailed sign-in code is stored under `sign-in-otp-<email>`) */

type Where = { field: string; value: unknown; operator?: string; connector?: string; mode?: string };
type Row = Record<string, unknown>;

const SEALED_FIELDS: Record<string, Record<string, 'stable' | 'random'>> = {
  user: { email: 'stable', name: 'random', image: 'random' },
  verification: { identifier: 'stable' },
};

export interface EncryptedAdapterOptions {
  /**
   * True while rows from before the switch-on may still hold plaintext emails: an equality test on a sealed column then matches the
   * plain value too, so a returning user is found rather than made a second time. Turn it off after scripts/encrypt-users.mjs has run.
   */
  matchPlaintext: boolean;
}

export function encryptedAdapter(inner: DBAdapter, crypto: PiiCrypto, options: EncryptedAdapterOptions): DBAdapter {
  const kindOf = (model: string, field: string, value: unknown) => {
    const kind = SEALED_FIELDS[model]?.[field];
    // An identifier that is not an address (an OAuth state, say) is stored as is.
    if (kind && model === 'verification' && !(typeof value === 'string' && value.includes('@'))) return undefined;
    return kind;
  };
  const sealOne = (kind: 'stable' | 'random', v: unknown) => (typeof v === 'string' ? (kind === 'stable' ? crypto.sealStable(v) : crypto.seal(v)) : v);

  const sealData = (model: string, data: Row | undefined): Row | undefined => {
    if (!data || !SEALED_FIELDS[model]) return data;
    const out: Row = { ...data };
    for (const field of Object.keys(SEALED_FIELDS[model]!)) {
      const kind = kindOf(model, field, out[field]);
      if (kind && field in out) out[field] = sealOne(kind, out[field]);
    }
    return out;
  };

  const sealWhere = (model: string, where: Where[] | undefined): Where[] | undefined => {
    if (!where || !SEALED_FIELDS[model]) return where;
    return where.map(w => {
      const sample = Array.isArray(w.value) ? w.value[0] : w.value;
      const kind = kindOf(model, w.field, sample);
      if (!kind) return w;
      const op = w.operator ?? 'eq';
      if (kind === 'random') throw new Error(`encryptedAdapter: ${model}.${w.field} is not searchable`);
      if (op === 'eq' || op === 'in') {
        const plain = (Array.isArray(w.value) ? w.value : [w.value]).filter((v): v is string => typeof v === 'string');
        const values = plain.flatMap(v => (options.matchPlaintext ? [crypto.sealStable(v), v] : [crypto.sealStable(v)]));
        return { ...w, operator: 'in', value: values };
      }
      if (op === 'ne' && typeof w.value === 'string') return { ...w, value: crypto.sealStable(w.value) };
      // contains, starts_with, ends_with, lt, gt ... cannot work on ciphertext. Better Auth does not use them on these columns.
      throw new Error(`encryptedAdapter: the "${op}" test is not possible on ${model}.${w.field}`);
    });
  };

  const openRow = (model: string, row: unknown): unknown => {
    if (!row || typeof row !== 'object') return row;
    const out: Row = { ...(row as Row) };
    for (const field of Object.keys(SEALED_FIELDS[model] ?? {})) {
      const v = out[field];
      if (typeof v === 'string') out[field] = crypto.open(v);
    }
    // A session found together with its user: `{ ...session, user: {...} }`.
    if (model !== 'user' && out.user && typeof out.user === 'object') out.user = openRow('user', out.user);
    return out;
  };

  const wrap = (a: Omit<DBAdapter, 'transaction'> & Partial<Pick<DBAdapter, 'transaction'>>): DBAdapter => {
    const w = {
      create: async (args: { model: string; data: Row }) => openRow(args.model, await a.create({ ...args, data: sealData(args.model, args.data)! } as never)),
      update: async (args: { model: string; where: Where[]; update: Row }) =>
        openRow(args.model, await a.update({ ...args, where: sealWhere(args.model, args.where)!, update: sealData(args.model, args.update)! } as never)),
      updateMany: (args: { model: string; where: Where[]; update: Row }) =>
        a.updateMany({ ...args, where: sealWhere(args.model, args.where)!, update: sealData(args.model, args.update)! } as never),
      findOne: async (args: { model: string; where: Where[] }) => openRow(args.model, await a.findOne({ ...args, where: sealWhere(args.model, args.where)! } as never)),
      findMany: async (args: { model: string; where?: Where[] }) => {
        const rows = (await a.findMany({ ...args, where: sealWhere(args.model, args.where) } as never)) as unknown[];
        return rows.map(r => openRow(args.model, r));
      },
      delete: (args: { model: string; where: Where[] }) => a.delete({ ...args, where: sealWhere(args.model, args.where)! } as never),
      deleteMany: (args: { model: string; where: Where[] }) => a.deleteMany({ ...args, where: sealWhere(args.model, args.where)! } as never),
      count: (args: { model: string; where?: Where[] }) => a.count({ ...args, where: sealWhere(args.model, args.where) } as never),
      consumeOne: async (args: { model: string; where: Where[] }) => openRow(args.model, await a.consumeOne({ ...args, where: sealWhere(args.model, args.where)! } as never)),
      incrementOne: async (args: { model: string; where: Where[]; set?: Row }) =>
        openRow(args.model, await a.incrementOne({ ...args, where: sealWhere(args.model, args.where)!, set: sealData(args.model, args.set) } as never)),
      transaction: <R>(cb: (trx: DBAdapter) => Promise<R>) => a.transaction!(trx => cb(wrap(trx))),
    };
    // Everything else (id, options, schema helpers, consumeOne ...) goes straight to the real adapter.
    return new Proxy(a as DBAdapter, {
      get: (target, prop, receiver) => (prop in w ? (w as Record<string | symbol, unknown>)[prop] : Reflect.get(target, prop, receiver)),
    });
  };

  return wrap(inner);
}
