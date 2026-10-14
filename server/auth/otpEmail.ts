/* ---------- Email sign-in codes: sending (ADR 042) ----------
   Better Auth's emailOTP plugin makes and checks the code; this file only delivers it. The sender is a plain function so tests
   pass their own, and Resend is reached over HTTPS (Cloud Run does not allow SMTP on port 25). */

/** Delivers one sign-in code to one address. It throws when the mail was not accepted. */
export type SendCode = (email: string, otp: string) => Promise<void>;

export interface ResendConfig {
  apiKey: string;
  /** The From header, e.g. `Iron Log <onboarding@resend.dev>`. Resend's test address only delivers to the account owner's own email. */
  from: string;
}

/** Resend's shared test sender: works with no domain, but only to the email on the Resend account. */
export const RESEND_TEST_FROM = 'Iron Log <onboarding@resend.dev>';

export const CODE_MINUTES = 5;

export function resendSender({ apiKey, from }: ResendConfig, fetchImpl: typeof fetch = fetch): SendCode {
  return async (email, otp) => {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Your Iron Log code: ${otp}`,
        text: `Your Iron Log sign-in code is ${otp}. It works for ${CODE_MINUTES} minutes. If you did not ask for it, ignore this email.`,
      }),
      // A hung provider must not hold the request open (and a Cloud Run instance) for long.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // The body names the reason (unverified domain, test sender to a stranger); it never contains the key. The address and code stay out of the log.
      throw new Error(`Resend refused the email: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  };
}

/**
 * At most `max` codes per address in `windowMs`, per server instance. Extra requests are skipped quietly (the caller still gets
 * the usual "sent" answer, so this cannot be used to probe addresses). Cloud Run runs several instances, so the true limit is
 * up to `max` times the instance count; the per-IP limit in app.ts and Resend's own quota are the other brakes.
 */
export function perAddressLimit(max: number, windowMs: number, now: () => number = Date.now): (email: string) => boolean {
  const sent = new Map<string, number[]>();
  return email => {
    const key = email.trim().toLowerCase();
    const t = now();
    const recent = (sent.get(key) ?? []).filter(at => t - at < windowMs);
    if (recent.length >= max) {
      sent.set(key, recent);
      return false;
    }
    recent.push(t);
    sent.set(key, recent);
    // Drop addresses whose window has passed, so the map cannot grow without bound.
    if (sent.size > 5000) for (const [k, v] of sent) if (v.every(at => t - at >= windowMs)) sent.delete(k);
    return true;
  };
}
