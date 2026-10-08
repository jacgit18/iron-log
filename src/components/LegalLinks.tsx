// Shown wherever someone can sign in: signing in is accepting the terms and the privacy policy, so both are one tap away. The pages are plain
// files (public/terms.html, public/privacy.html) that the service worker and the server hand out as they are.
export default function LegalLinks() {
  return (
    <span className="note">By signing in you agree to the <a href="/terms.html">Terms of Use</a> and the <a href="/privacy.html">Privacy Policy</a>. Signing in creates your account the first time.</span>
  );
}
