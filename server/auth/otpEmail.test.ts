import { describe, expect, it, vi } from 'vitest';
import { CODE_MINUTES, RESEND_TEST_FROM, resendSender } from './otpEmail.ts';

// The wording of the sign-in email is what a person reads first, so it is pinned here (brief brand-loadbearer-rename, Done when 2).
describe('the sign-in code email', () => {
  it('names Loadbearer in the sender, the subject and the body, and carries the code', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await resendSender({ apiKey: 'key', from: RESEND_TEST_FROM }, fetchImpl as unknown as typeof fetch)('a@example.com', '123456');
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { from: string; to: string[]; subject: string; text: string };
    expect(sent.from).toBe('Loadbearer <onboarding@resend.dev>');
    expect(sent.to).toEqual(['a@example.com']);
    expect(sent.subject).toBe('Your Loadbearer code: 123456');
    expect(sent.text).toContain('Your Loadbearer sign-in code is 123456.');
    expect(sent.text).toContain(`${CODE_MINUTES} minutes`);
  });
});
