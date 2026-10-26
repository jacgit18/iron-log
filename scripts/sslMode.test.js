import { describe, expect, it } from 'vitest';
import { pinSslMode as pinForScripts } from './lib/ssl-mode.mjs';
import { pinSslMode as pinForServer } from '../server/db/sslMode.ts';

const HOST = 'postgresql://u:p%40ss@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb';

// The server and the scripts each keep their own copy (ADR 015 keeps server/ from importing scripts/, and a job image copies plain JavaScript files);
// every case below runs against both, so the two cannot drift apart. (server/db/sslMode.test.ts tests the server copy on its own, beside it.)
describe.each([['server/db/sslMode.ts', pinForServer], ['scripts/lib/ssl-mode.mjs', pinForScripts]])('pinSslMode in %s', (_name, pinSslMode) => {
  it.each(['require', 'prefer', 'verify-ca'])('turns sslmode=%s into verify-full, so a pg upgrade cannot weaken the check', mode => {
    expect(pinSslMode(`${HOST}?sslmode=${mode}`)).toBe(`${HOST}?sslmode=verify-full`);
  });

  it('keeps the other parameters, wherever sslmode sits, and the password as written', () => {
    expect(pinSslMode(`${HOST}?connect_timeout=5&sslmode=require&application_name=x`)).toBe(`${HOST}?connect_timeout=5&sslmode=verify-full&application_name=x`);
    expect(pinSslMode(`${HOST}?sslmode=require&channel_binding=require`)).toBe(`${HOST}?sslmode=verify-full&channel_binding=require`);
  });

  it('leaves verify-full, disable, no-verify and allow alone', () => {
    for (const mode of ['verify-full', 'disable', 'no-verify', 'allow']) expect(pinSslMode(`${HOST}?sslmode=${mode}`)).toBe(`${HOST}?sslmode=${mode}`);
  });

  it('leaves a URL without sslmode alone, and one that asks for libpq behaviour on purpose', () => {
    expect(pinSslMode(HOST)).toBe(HOST);
    expect(pinSslMode(`${HOST}?uselibpqcompat=true&sslmode=require`)).toBe(`${HOST}?uselibpqcompat=true&sslmode=require`);
    expect(pinSslMode(`${HOST}?sslmode=require&uselibpqcompat=true`)).toBe(`${HOST}?sslmode=require&uselibpqcompat=true`);
  });

  it('does not touch a value that only contains the word, such as a password or database name', () => {
    expect(pinSslMode('postgresql://u:sslmode=require@host/db')).toBe('postgresql://u:sslmode=require@host/db');
    expect(pinSslMode(`${HOST}?sslmode=requirement`)).toBe(`${HOST}?sslmode=requirement`);
  });

  it('the pinned URL no longer makes pg warn about the mode', async () => {
    const pg = (await import('pg')).default;
    const warnings = [];
    const onWarning = w => warnings.push(w.message);
    process.on('warning', onWarning);
    new pg.Client({ connectionString: pinSslMode(`${HOST}?sslmode=require`) });
    await new Promise(done => setTimeout(done, 20));
    process.off('warning', onWarning);
    expect(warnings.filter(m => /SSL modes/.test(m))).toEqual([]);
  });
});
