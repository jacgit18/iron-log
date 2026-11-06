// Shown wherever someone can sign in, beside the "I agree" box (TermsCheckbox): the two pages are one tap away and signing in makes the account the
// first time. It no longer says signing in is agreeing; the box does that, and the app keeps the record (brief terms-acceptance). The pages are plain
// files (public/terms.html, public/privacy.html) that the service worker and the server hand out as they are.
export default function LegalLinks() {
  return (
    <span className="note">Read the <a href="/terms.html">Terms of Use</a> and the <a href="/privacy.html">Privacy Policy</a>. Signing in creates your account the first time.</span>
  );
}
