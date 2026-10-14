import { describe, expect, it } from 'vitest';
import { installErrorReporting, reportCaught, reportSync, type ReportTarget } from './reportErrors.js';

function fakeWindow() {
  const handlers = new Map<string, (e: never) => void>();
  const target: ReportTarget = { addEventListener: (t, l) => void handlers.set(t, l), removeEventListener: t => void handlers.delete(t), location: { pathname: '/progress' } };
  const fire = (type: string, e: object) => handlers.get(type)?.(e as never);
  return { target, handlers, fire };
}

describe('installErrorReporting', () => {
  it('reports an uncaught error and a rejected promise with the page and version', () => {
    const w = fakeWindow();
    const sent: unknown[] = [];
    installErrorReporting({ version: '9', send: b => sent.push(b), target: w.target });
    w.fire('error', { message: 'boom', error: Object.assign(new Error('boom'), { stack: 'Error: boom\n    at f (https://x/a.js:1:2)' }) });
    w.fire('unhandledrejection', { reason: new Error('nope') });
    expect(sent).toMatchObject([{ kind: 'error', message: 'boom', page: '/progress', version: '9', stack: expect.stringContaining('a.js') }, { kind: 'unhandledrejection', message: 'nope' }]);
  });

  it('takes a string or a strange value as the reason', () => {
    const w = fakeWindow();
    const sent: { message: string }[] = [];
    installErrorReporting({ version: '9', send: b => sent.push(b), target: w.target });
    w.fire('unhandledrejection', { reason: 'plain text' });
    w.fire('unhandledrejection', { reason: { a: 1 } });
    expect(sent.map(s => s.message)).toEqual(['plain text', 'non-error value']);
  });

  it('never sends the same error twice, and stops after a few', () => {
    const w = fakeWindow();
    let n = 0;
    installErrorReporting({ version: '9', send: () => void n++, target: w.target, max: 3 });
    for (let i = 0; i < 5; i++) w.fire('error', { message: 'same' });
    expect(n).toBe(1);
    for (let i = 0; i < 10; i++) w.fire('error', { message: `different ${i}` });
    expect(n).toBe(3);
  });

  it('a send that throws is forgotten, and the listeners can be removed', () => {
    const w = fakeWindow();
    const stop = installErrorReporting({ version: '9', send: () => { throw new Error('offline'); }, target: w.target });
    expect(() => w.fire('error', { message: 'x' })).not.toThrow();
    stop();
    expect(w.handlers.size).toBe(0);
  });

  it('reports an error an ErrorBoundary caught on the same terms: once each, one limit with the window errors', () => {
    const w = fakeWindow();
    const sent: { kind: string; message: string }[] = [];
    const stop = installErrorReporting({ version: '9', send: b => sent.push(b), target: w.target, max: 3 });
    reportCaught(new Error('render'));
    reportCaught(new Error('render')); // Try again hit the same error
    w.fire('error', { message: 'window one' });
    reportCaught('a string');
    reportCaught(new Error('over the limit'));
    expect(sent).toMatchObject([{ kind: 'error', message: 'render' }, { message: 'window one' }, { message: 'a string' }]);
    stop();
  });

  it('a caught error is dropped while reporting is not installed, and a throwing send is forgotten', () => {
    const w = fakeWindow();
    const sent: unknown[] = [];
    installErrorReporting({ version: '9', send: b => sent.push(b), target: w.target })();
    reportCaught(new Error('after stop'));
    expect(sent).toEqual([]);
    const stop = installErrorReporting({ version: '9', send: () => { throw new Error('offline'); }, target: w.target });
    expect(() => reportCaught(new Error('x'))).not.toThrow();
    stop();
  });
});

describe('reportSync', () => {
  it('sends a sync problem as kind "sync" with the message only, on the same once-each limit', () => {
    const w = fakeWindow();
    const sent: { kind: string; message: string; stack: string }[] = [];
    const stop = installErrorReporting({ version: '9', send: b => sent.push(b), target: w.target });
    reportSync('unexpected answer (status 200)');
    reportSync('unexpected answer (status 200)');
    expect(sent).toEqual([expect.objectContaining({ kind: 'sync', message: 'unexpected answer (status 200)', stack: '' })]);
    stop();
  });

  it('does nothing while reporting is not installed', () => {
    expect(() => reportSync('nobody listens')).not.toThrow();
  });
});
