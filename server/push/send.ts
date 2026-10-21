import webpush from 'web-push';
import type { PushConfig } from './config.ts';
import type { PushKind } from './scheduler.ts';
import { isPushServiceUrl } from './validate.ts';

// Sends one Web Push message. Behind a function type so the fire route can be tested without a push service.
export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export type PushSender = (sub: Subscription, message: { kind: PushKind; key: string; at: number; body: string }, ttlSeconds: number) => Promise<'sent' | 'gone' | 'failed'>;

/** How long a push service should hold a message for a phone that is off or out of range. A late "rest over" is noise, so it is short. */
export const TTL_SECONDS: Record<PushKind, number> = { rest: 90, 'day-nudge': 600 };

export function webPushSender(config: PushConfig): PushSender {
  const vapidDetails = { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey };
  return async (sub, message, ttl) => {
    // A stored endpoint from before the allowlist (or put there by hand) is not contacted: it is reported gone, which removes it.
    if (!isPushServiceUrl(sub.endpoint)) return 'gone';
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { vapidDetails, TTL: ttl, urgency: 'high' });
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The endpoint is a credential: log the status, never the address.
      console.warn(JSON.stringify({ msg: 'push send failed', status: status ?? null }));
      return status === 404 || status === 410 ? 'gone' : 'failed';
    }
  };
}
