import { describe, expect, it } from 'vitest';
import { fromExtension, installErrorReporting, reportCaught, reportSync, type ReportTarget } from './reportErrors.js';

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

  it('leaves out a failure inside a browser extension, and keeps one that has the page in its stack or no stack at all', () => {
    const w = fakeWindow();
    const sent: { message: string }[] = [];
    installErrorReporting({ version: '9', send: b => sent.push(b), target: w.target });
    const inExtension = Object.assign(new TypeError('Failed to fetch'), { stack: 'TypeError: Failed to fetch\n    at OnFj (chrome-extension://abc/injectScriptAdjust.js:1:3271)' });
    const throughPage = Object.assign(new Error('mixed'), { stack: 'Error: mixed\n    at x (chrome-extension://abc/a.js:1:1)\n    at y (https://app.example/assets/index-1.js:2:3)' });
    w.fire('unhandledrejection', { reason: inExtension });
    w.fire('error', { message: 'Script error', filename: 'moz-extension://abc/content.js' });
    w.fire('error', { message: 'wrapped', filename: 'chrome-extension://abc/wrap.js', error: Object.assign(new Error('wrapped'), { stack: throughPage.stack }) });
    w.fire('unhandledrejection', { reason: throughPage });
    w.fire('unhandledrejection', { reason: new Error('no stack frames') });
    expect(sent.map(s => s.message)).toEqual(['wrapped', 'mixed', 'no stack frames']);
  });

  it('fromExtension: every extension scheme counts, the page and plain text do not', () => {
    for (const u of ['chrome-extension://a/b.js:1:1', 'moz-extension://a/b.js', 'safari-web-extension://a/b.js', 'safari-extension://a/b.js', 'ms-browser-extension://a/b.js']) expect(fromExtension(`at f (${u})`)).toBe(true);
    expect(fromExtension('at f (https://app.example/assets/a.js:1:1)')).toBe(false);
    expect(fromExtension('')).toBe(false);
    expect(fromExtension('mentions chrome-extension in words only')).toBe(false);
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
