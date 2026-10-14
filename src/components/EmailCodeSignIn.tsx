import { useEffect, useState, type FormEvent } from 'react';
import { CODE_MESSAGES, emailSignInOffered, emailSignInRevealed, looksLikeEmail } from '../lib/emailSignIn.js';
import type { AccountClient, EmailCodeOutcome } from '../sync/account.js';
import './EmailCodeSignIn.css';

// Sign in with an emailed 6-digit code (ADR 042), the second way in besides Google. Closed until asked for, so the Google button stays the
// first thing seen. Two steps in one place: the address, then the code. Every problem is a sentence under the field; nothing is lost
// while signed out (changes stay on the device and are sent after sign-in). Offered only when the server says the code is open, or on a
// device that revealed it (src/lib/emailSignIn.ts); the server is what keeps it owner-only.
const RESEND_AFTER_MS = 30_000;

export default function EmailCodeSignIn({ client }: { client: AccountClient }) {
  const [open, setOpen] = useState(false);
  const [revealed] = useState(() => emailSignInRevealed(window.location.search));
  const [step, setStep] = useState<'closed' | 'email' | 'code'>('closed');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [canResend, setCanResend] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    let current = true;
    void client.emailCodeOpen().then(v => { if (current) setOpen(v); });
    return () => { current = false; };
  }, [client]);

  // A new code may be asked for 30 seconds after the last one was sent: the server limits it too, this just stops a double tap.
  useEffect(() => {
    if (step !== 'code') return;
    const t = setTimeout(() => setCanResend(true), RESEND_AFTER_MS);
    return () => clearTimeout(t);
  }, [step, sentCount]);

  if (!emailSignInOffered(open, revealed)) return null;
  if (step === 'closed') {
    return <button type="button" className="btn emailsignin-open" onClick={() => setStep('email')}>Sign in with email</button>;
  }

  const failure = (out: EmailCodeOutcome, refused: string, unreachable: string) =>
    out === 'slow-down' ? CODE_MESSAGES.slowDown : out === 'unreachable' ? unreachable : refused;

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const address = email.trim();
    if (!looksLikeEmail(address)) { setMessage(CODE_MESSAGES.badEmail); return; }
    setBusy(true);
    const out = await client.sendEmailCode(address);
    setBusy(false);
    if (out !== 'ok') { setMessage(failure(out, CODE_MESSAGES.sendRefused, CODE_MESSAGES.sendUnreachable)); return; }
    setEmail(address);
    setCode('');
    setMessage(CODE_MESSAGES.sent);
    setCanResend(false);
    setSentCount(n => n + 1);
    setStep('code');
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const out = await client.signInWithEmailCode(email, code.trim());
    if (out === 'ok') { window.location.assign('/'); return; } // like coming back from Google: a fresh load asks who is signed in
    setBusy(false);
    setMessage(failure(out, CODE_MESSAGES.badCode, CODE_MESSAGES.codeUnreachable));
  };

  const back = () => { setStep('email'); setCode(''); setMessage(''); };

  return (
    <form className="emailsignin" onSubmit={step === 'email' ? send : verify} noValidate>
      {step === 'email' ? (
        <label className="field">Email
          <input type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </label>
      ) : (
        <label className="field">6-digit code sent to {email}
          <input type="text" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
        </label>
      )}
      {message && <p className="note" role="status">{message}</p>}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={busy || (step === 'code' && code.length !== 6)}>{step === 'email' ? 'Send code' : 'Sign in'}</button>
        {step === 'code' && <button type="button" className="btn" disabled={busy || !canResend} onClick={() => void send()}>Send a new code</button>}
        {step === 'code' ? <button type="button" className="btn" onClick={back}>Use a different email</button> : <button type="button" className="btn" onClick={() => { setStep('closed'); setMessage(''); }}>Cancel</button>}
      </div>
    </form>
  );
}
