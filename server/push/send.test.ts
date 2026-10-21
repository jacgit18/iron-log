import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification } }));

const { webPushSender } = await import('./send.ts');
const config = { subject: 'mailto:owner@example.com', publicKey: 'p'.repeat(87), privateKey: 'k'.repeat(43) };
const message = { kind: 'rest' as const, key: '1', at: 1, body: 'Rest over.' };

// Audit S-02: a stored endpoint that is not on a push service (from before the allowlist, or put there by hand) is never contacted: it is reported gone, which removes it.
describe('webPushSender', () => {
  beforeEach(() => sendNotification.mockReset());

  it('does not contact an endpoint that is not a push service, and reports it gone', async () => {
    const send = webPushSender(config);
    for (const endpoint of ['https://169.254.169.254/computeMetadata/v1/', 'https://127.0.0.1:9/x', 'https://push.example/x', 'http://fcm.googleapis.com/x']) {
      expect(await send({ endpoint, p256dh: 'k', auth: 'a' }, message, 90)).toBe('gone');
    }
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends to a push service', async () => {
    sendNotification.mockResolvedValue({});
    expect(await webPushSender(config)({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a' }, message, 90)).toBe('sent');
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
