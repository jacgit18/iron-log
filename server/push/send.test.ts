import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  // TG-10: the fire route removes a subscription only when the push service says it is gone (404, 410); any other failure keeps it for next time.
  describe('what the push service answers', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/secret-device-token';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    afterEach(() => warn.mockClear());

    it('reports a 404 and a 410 as gone, so the subscription is forgotten', async () => {
      for (const statusCode of [404, 410]) {
        sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode }));
        expect(await webPushSender(config)({ endpoint, p256dh: 'k', auth: 'a' }, message, 90)).toBe('gone');
      }
    });

    it('reports a server error, a throttle and a dropped connection as failed without throwing, so the subscription is kept', async () => {
      for (const err of [Object.assign(new Error('boom'), { statusCode: 500 }), Object.assign(new Error('slow down'), { statusCode: 429 }), new Error('socket hang up')]) {
        sendNotification.mockRejectedValueOnce(err);
        expect(await webPushSender(config)({ endpoint, p256dh: 'k', auth: 'a' }, message, 90)).toBe('failed');
      }
    });

    it('logs the status and never the endpoint, which is a credential', async () => {
      sendNotification.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 503 }));
      await webPushSender(config)({ endpoint, p256dh: 'k', auth: 'a' }, message, 90);
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = String(warn.mock.calls[0]![0]);
      expect(logged).toContain('503');
      expect(logged).not.toContain('secret-device-token');
    });
  });

  it('sends to a push service', async () => {
    sendNotification.mockResolvedValue({});
    expect(await webPushSender(config)({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a' }, message, 90)).toBe('sent');
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
