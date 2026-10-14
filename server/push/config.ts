// Web Push settings (ADR 044). VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are the URL-safe base64 pair from `npx web-push generate-vapid-keys`;
// VAPID_SUBJECT is a mailto: or https: contact the push services can reach. All three set turns the push routes on; otherwise they answer 503.
export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

export function pushConfigFrom(env: Record<string, string | undefined>): { config: PushConfig; reason?: undefined } | { config?: undefined; reason: string } {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.VAPID_SUBJECT?.trim() ?? '';
  if (!publicKey && !privateKey && !subject) return { reason: 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are not set' };
  if (!B64URL.test(publicKey) || publicKey.length !== 87) return { reason: 'VAPID_PUBLIC_KEY must be a 65-byte URL-safe base64 key (87 characters)' };
  if (!B64URL.test(privateKey) || privateKey.length !== 43) return { reason: 'VAPID_PRIVATE_KEY must be a 32-byte URL-safe base64 key (43 characters)' };
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return { reason: 'VAPID_SUBJECT must be a mailto: or https: address' };
  return { config: { publicKey, privateKey, subject } };
}
