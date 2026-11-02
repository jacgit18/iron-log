// Signing out on purpose, the one way the app does it (the account menu and the other-account card both call it). Every step is passed in so a test
// can run the order without a browser. Order matters: push is turned off while still signed in, so the server forgets this phone before the next
// person uses it; the session and the backup copies are forgotten only after the server has said yes, so a failed sign-out loses nothing.
export type SignOutSteps = {
  disablePush: () => Promise<unknown>;
  signOut: () => Promise<boolean>;
  forgetSession: () => void;
  forgetBackups: () => Promise<unknown>;
  reload: () => void;
  tell: (text: string) => void;
};

/** True when the sign-out went through (the page is reloading to the landing page); false when the server did not take it. */
export async function signOutFlow(s: SignOutSteps): Promise<boolean> {
  await s.disablePush().catch(() => undefined);
  const done = await s.signOut();
  if (!done) { s.tell('Could not sign out. Try again in a moment.'); return false; }
  s.forgetSession();
  await s.forgetBackups(); // the next person to sign in on this device must not be offered this account's copies
  s.reload(); // the next screen is the landing page, not the app
  return true;
}
