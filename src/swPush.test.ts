import { describe, expect, it, vi } from 'vitest';
import { onNotificationClick, onPush, parsePushMessage, TAGS, type PushScope } from './swPush.js';

const SCOPE = 'https://iron.example/';
const REST = JSON.stringify({ kind: 'rest', key: '1', at: 5, body: 'Rest over. Time for your next set.' });
const NUDGE = JSON.stringify({ kind: 'day-nudge', key: 'n', at: 5, body: 'Day not finished: 2 of 5 exercises left.' });

function scopeWith(clients: { visibilityState: string; focus: () => Promise<unknown> }[] = []) {
  const closed: string[] = [];
  const shown: { title: string; options: NotificationOptions }[] = [];
  const opened: string[] = [];
  const scope: PushScope = {
    registration: {
      scope: SCOPE,
      showNotification: async (title, options) => void shown.push({ title, options }),
      getNotifications: async ({ tag }) => [{ close: () => void closed.push(tag) }],
    },
    clients: { matchAll: async () => clients, openWindow: async url => void opened.push(url) },
  };
  return { scope, shown, closed, opened };
}

describe('parsePushMessage', () => {
  it('reads what the server sends', () => {
    expect(parsePushMessage(REST)).toEqual({ kind: 'rest', key: '1', at: 5, body: 'Rest over. Time for your next set.' });
  });
  it.each([null, undefined, '', 'plain text', '{"kind":"ad","body":"x"}', '{"kind":"rest"}', '{"kind":"rest","body":""}', `{"kind":"rest","body":"${'x'.repeat(141)}"}`, 'null', '[]'])('is null for %j', v => {
    expect(parsePushMessage(v)).toBeNull();
  });
});

describe('onPush', () => {
  it('with the app away, shows the message, stays until tapped, and replaces the earlier one of its kind', async () => {
    const { scope, shown, closed } = scopeWith([{ visibilityState: 'hidden', focus: async () => {} }]);
    const sleep = vi.fn(async () => {});
    await onPush(scope, REST, sleep);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.title).toBe('Iron Log');
    expect(shown[0]!.options).toMatchObject({ body: 'Rest over. Time for your next set.', tag: TAGS.rest, renotify: true, silent: false, icon: `${SCOPE}icons/icon-192.png`, data: { url: `${SCOPE}?open=board` } });
    expect(sleep).not.toHaveBeenCalled();
    expect(closed).toEqual([]);
  });
  it('with no window open at all, shows it too', async () => {
    const { scope, shown } = scopeWith([]);
    await onPush(scope, NUDGE, async () => {});
    expect(shown[0]!.options).toMatchObject({ tag: TAGS['day-nudge'], silent: false });
  });
  it('with the app in front, still shows it (a push that shows nothing gets the site revoked), silent, and takes it down after a moment', async () => {
    const { scope, shown, closed } = scopeWith([{ visibilityState: 'visible', focus: async () => {} }]);
    const sleep = vi.fn(async () => {});
    await onPush(scope, REST, sleep);
    expect(shown[0]!.options).toMatchObject({ silent: true });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(closed).toEqual([TAGS.rest]);
  });
  it('shows a plain "open the app" notice for a message it cannot read', async () => {
    const { scope, shown } = scopeWith();
    await onPush(scope, 'garbage', async () => {});
    expect(shown).toHaveLength(1);
    expect(shown[0]!.options).toMatchObject({ body: 'Open Iron Log.' });
    await onPush(scope, null, async () => {});
    expect(shown).toHaveLength(2);
  });
  it('the rest notice shares the in-page notice\'s tag, so the two replace each other', () => {
    expect(TAGS.rest).toBe('rest-timer');
  });
});

describe('onNotificationClick', () => {
  const note = (url?: unknown) => ({ close: vi.fn(), data: url === undefined ? undefined : { url } });
  it('closes the notice and brings the visible window forward', async () => {
    const hiddenFocus = vi.fn(async () => {});
    const visibleFocus = vi.fn(async () => {});
    const { scope, opened } = scopeWith([{ visibilityState: 'hidden', focus: hiddenFocus }, { visibilityState: 'visible', focus: visibleFocus }]);
    const n = note(`${SCOPE}?open=board`);
    await onNotificationClick(scope, n);
    expect(n.close).toHaveBeenCalled();
    expect(visibleFocus).toHaveBeenCalled();
    expect(hiddenFocus).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });
  it('focuses the first window when none is visible', async () => {
    const focus = vi.fn(async () => {});
    const { scope, opened } = scopeWith([{ visibilityState: 'hidden', focus }]);
    await onNotificationClick(scope, note());
    expect(focus).toHaveBeenCalled();
    expect(opened).toEqual([]);
  });
  it('opens the app on the board when no window is open', async () => {
    const { scope, opened } = scopeWith([]);
    await onNotificationClick(scope, note(`${SCOPE}?open=board`));
    expect(opened).toEqual([`${SCOPE}?open=board`]);
  });
  it('never opens an address outside the app, whatever the notice carries', async () => {
    const { scope, opened } = scopeWith([]);
    await onNotificationClick(scope, note('https://evil.example/'));
    await onNotificationClick(scope, note(42));
    expect(opened).toEqual([SCOPE, SCOPE]);
  });
});
