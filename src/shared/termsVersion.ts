// The versions of the Terms of Use and the Privacy Policy that people accept at sign-in (brief terms-acceptance). Each is the `Version x.y` on the
// page's own `Last updated` line (public/terms.html, public/privacy.html); termsVersion.test.ts fails when they disagree. Bump a number here in
// the same change that bumps its page and everyone, new and existing, is asked to accept again. Shared with the server, which refuses any other value.
export const TERMS_VERSION = '1.2';
export const PRIVACY_VERSION = '1.5';

export interface TermsVersions { terms: string; privacy: string }
export const CURRENT_TERMS: TermsVersions = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION };

/** The shape a version takes (also checked by accept_terms in the database). */
export const isVersionText = (v: unknown): v is string => typeof v === 'string' && /^\d{1,3}\.\d{1,3}$/.test(v);
