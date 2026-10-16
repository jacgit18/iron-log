import { createHmac, hkdfSync } from 'node:crypto';

/* ---------- How an emailed sign-in code is stored ----------
   A six-digit code has only a million values, so a plain SHA-256 of it (Better Auth's `storeOTP: 'hashed'`) can be undone in
   well under a second by anyone who reads the verification table. The code is stored as an HMAC-SHA-256 keyed from
   BETTER_AUTH_SECRET instead: without that secret, a copy of the table does not give back a live code. The key is derived
   (HKDF) for this one use, so the secret itself is never used directly as an HMAC key. */

export function otpHasher(secret: string): (otp: string) => Promise<string> {
  const key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'ironlog-otp-hash', 32));
  return async otp => createHmac('sha256', key).update(otp, 'utf8').digest('base64url');
}
