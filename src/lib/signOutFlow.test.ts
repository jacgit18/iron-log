import { describe, expect, it } from 'vitest';
import { signOutFlow, type SignOutSteps } from './signOutFlow.js';

const steps = (done: boolean, log: string[]): SignOutSteps => ({
  disablePush: async () => { log.push('push'); },
  signOut: async () => { log.push('signOut'); return done; },
  forgetSession: () => { log.push('session'); },
  forgetBackups: async () => { log.push('backups'); },
  reload: () => { log.push('reload'); },
  tell: t => { log.push(`tell:${t}`); },
});

describe('signOutFlow', () => {
  it('turns push off first, then signs out, forgets the session and copies, then reloads', async () => {
    const log: string[] = [];
    expect(await signOutFlow(steps(true, log))).toBe(true);
    expect(log).toEqual(['push', 'signOut', 'session', 'backups', 'reload']);
  });

  it('keeps the session and the copies when the server does not take the sign-out', async () => {
    const log: string[] = [];
    expect(await signOutFlow(steps(false, log))).toBe(false);
    expect(log).toEqual(['push', 'signOut', 'tell:Could not sign out. Try again in a moment.']);
  });

  it('still signs out when turning push off fails', async () => {
    const log: string[] = [];
    const s = { ...steps(true, log), disablePush: async () => { throw new Error('offline'); } };
    expect(await signOutFlow(s)).toBe(true);
    expect(log).toEqual(['signOut', 'session', 'backups', 'reload']);
  });
});
