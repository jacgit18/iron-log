import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types.ts';

const DATE_OID = 1082;

// ADR 011: dates (`d`, `wk`) are plain YYYY-MM-DD strings. By default pg turns a SQL date into a Date at local
// midnight, which can land on the previous day once it is converted to UTC. Keep dates as the strings Postgres sends.
// The generated types match this (`--date-parser string` in the db:types script).
export function createDb(connectionString: string): Kysely<DB> {
  const pool = new pg.Pool({
    connectionString,
    types: {
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        oid === DATE_OID ? (value: string) => value : pg.types.getTypeParser(oid as never, format as never)) as typeof pg.types.getTypeParser,
    },
  });
  // An idle pooled connection can be dropped at any time (a database restart, Neon scaling to zero). pg reports that as
  // an 'error' event on the pool; with no listener Node would crash the whole process. Log it; the pool opens a new one.
  pool.on('error', err => {
    console.error(JSON.stringify({ msg: 'idle database connection dropped', error: err.message }));
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
