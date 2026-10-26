import { describe, expect, it } from 'vitest';
import { createTransport } from './transport.js';

// A response whose headers arrive at once and whose body is read through the request's signal, like a real fetch: aborting the
// request makes the body read fail. `bodyAfterMs` null means the body never arrives.
function slowBody(bodyAfterMs: number | null, payload: object) {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        if (bodyAfterMs != null) setTimeout(() => resolve(payload), bodyAfterMs);
      }),
    } as unknown as Response;
  }) as typeof fetch;
}

const guard = <T>(p: Promise<T>, ms = 1000) => Promise.race([p, new Promise<'hung'>(r => setTimeout(() => r('hung'), ms))]);

describe('transport: a body that never arrives', () => {
  it('a pull whose body stalls is abandoned after the timeout and counts as a network pause', async () => {
    const t = createTransport({ clientVersion: 'x', timeoutMs: 50, fetch: slowBody(null, {}) });
    const out = await guard(t.pull('0'));
    expect(out).toMatchObject({ ok: false, class: 'network' });
  });

  it('a command whose body stalls is abandoned too', async () => {
    const t = createTransport({ clientVersion: 'x', timeoutMs: 50, fetch: slowBody(null, {}) });
    const out = await guard(t.command('save-document' as never, { clientId: 'c', baseVersion: null, input: {} } as never));
    expect(out).toMatchObject({ ok: false, class: 'network' });
  });

  it('a body that arrives inside the timeout is read normally', async () => {
    const t = createTransport({ clientVersion: 'x', timeoutMs: 300, fetch: slowBody(20, { rows: [], cursor: '5', more: false }) });
    expect(await guard(t.pull('0'))).toMatchObject({ ok: true, cursor: '5', more: false });
  });

  it('a later request still runs after a stalled one', async () => {
    let calls = 0;
    const fetchStub = ((url: RequestInfo | URL, init?: RequestInit) => (++calls === 1 ? slowBody(null, {}) : slowBody(0, { rows: [], cursor: '1', more: false }))(url, init)) as typeof fetch;
    const t = createTransport({ clientVersion: 'x', timeoutMs: 50, fetch: fetchStub });
    expect(await guard(t.pull('0'))).toMatchObject({ ok: false, class: 'network' });
    expect(await guard(t.pull('0'))).toMatchObject({ ok: true });
  });

  it('a 503 is answered from its status and Retry-After without waiting on its body', async () => {
    const stalled = (async () => ({ ok: false, status: 503, headers: new Headers({ 'retry-after': '120' }), json: () => new Promise(() => undefined) }) as unknown as Response) as typeof fetch;
    const t = createTransport({ clientVersion: 'x', timeoutMs: 50, fetch: stalled });
    expect(await guard(t.pull('0'))).toMatchObject({ ok: false, class: 'server', status: 503, retryAfterMs: 120_000 });
  });

  it('an erase that succeeded is not turned into a timeout by a body that never arrives', async () => {
    const ok = (async () => ({ ok: true, status: 200, headers: new Headers(), json: () => new Promise(() => undefined) }) as unknown as Response) as typeof fetch;
    const t = createTransport({ clientVersion: 'x', timeoutMs: 50, fetch: ok });
    expect(await guard(t.eraseData())).toEqual({ ok: true });
  });
});
