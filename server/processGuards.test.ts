import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installProcessGuards } from './processGuards.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(opts: { serverClosesAfterMs?: number } = {}) {
  const proc = new EventEmitter() as unknown as NodeJS.Process;
  const exit = vi.fn();
  const close = vi.fn(async () => undefined);
  const server = {
    close: vi.fn((cb: () => void) => { if (opts.serverClosesAfterMs !== undefined) setTimeout(cb, opts.serverClosesAfterMs); }),
    closeIdleConnections: vi.fn(),
  } as unknown as Server;
  installProcessGuards(server, { close, exit, proc, graceMs: 1000 });
  return { proc, exit, close, server };
}

describe('process guards', () => {
  it('logs an unhandled rejection as JSON and exits 1 after closing', async () => {
    const { proc, exit, close } = setup({ serverClosesAfterMs: 10 });
    (proc as unknown as EventEmitter).emit('unhandledRejection', new Error('lost'));
    expect(JSON.parse(String((console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0]))).toMatchObject({ msg: 'unhandled rejection', error: 'lost' });
    await vi.advanceTimersByTimeAsync(20);
    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs an uncaught exception and exits 1', async () => {
    const { proc, exit } = setup({ serverClosesAfterMs: 0 });
    (proc as unknown as EventEmitter).emit('uncaughtException', new Error('bad'));
    await vi.advanceTimersByTimeAsync(5);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits 0 on SIGTERM, dropping idle keep-alive connections', async () => {
    const { proc, exit, server } = setup({ serverClosesAfterMs: 0 });
    (proc as unknown as EventEmitter).emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(5);
    expect(server.closeIdleConnections).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('hard-exits when the server never finishes closing', async () => {
    const { proc, exit } = setup();
    (proc as unknown as EventEmitter).emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('stops only once when two things go wrong', async () => {
    const { proc, server } = setup({ serverClosesAfterMs: 0 });
    (proc as unknown as EventEmitter).emit('unhandledRejection', new Error('a'));
    (proc as unknown as EventEmitter).emit('SIGTERM');
    expect(server.close).toHaveBeenCalledOnce();
  });
});
