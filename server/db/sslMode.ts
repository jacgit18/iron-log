/* ---------- Keep today's TLS checking when the pg driver changes what `sslmode=require` means ----------
   pg 8 reads sslmode=prefer, require and verify-ca as verify-full (the certificate and host name are checked) and warns that pg 9
   (pg-connection-string 3) will read them as libpq does, which for `require` checks nothing. Neon's URLs say `require`, so a pg 9 upgrade
   would quietly weaken every database connection. Pinning `verify-full` here keeps the checking we have now, on any pg version, silences
   the warning, and needs no change to the stored URLs. A URL that asks for libpq's own behaviour (`uselibpqcompat=true`), or any other mode
   (disable for the local test database, verify-full already), is left exactly as it is.
   scripts/lib/ssl-mode.mjs is the same function for the scripts and the job images (server/ may import only from src/shared, ADR 015, and an
   image copies single plain-JavaScript files); scripts/sslMode.test.js runs both over the same URLs so they cannot drift apart. */
const LIBPQ_COMPAT = /[?&]uselibpqcompat=true(?=&|$)/;
const ALIASED_MODE = /([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/;

export function pinSslMode(url: string): string {
  return LIBPQ_COMPAT.test(url) ? url : url.replace(ALIASED_MODE, '$1verify-full');
}
