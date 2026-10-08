// A bare page for trying sign-in by hand while developing: sign in with Google, see who the API thinks you are, sign out.
// Served only when NODE_ENV is development and Better Auth is configured (app.ts). It holds no secrets and no data.
export const AUTH_CHECK_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Iron Log: sign-in check</title>
<style>body{font:16px system-ui;background:#111;color:#eee;margin:0;padding:24px 16px;max-width:640px}button{font-size:18px;padding:12px 18px;margin:6px 6px 6px 0;border-radius:8px;border:1px solid #555;background:#222;color:#eee}pre{background:#1b1b1b;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word}</style>
</head>
<body>
<h1>Sign-in check</h1>
<p>Development only. <span id="mode"></span></p>
<button id="in">Sign in with Google</button>
<button id="me">Who am I?</button>
<button id="out">Sign out</button>
<pre id="log">loading…</pre>
<script>
const log = text => { document.getElementById('log').textContent = text; };
document.getElementById('mode').textContent = 'Standalone app: ' + (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
async function me() {
  const res = await fetch('/api/me', { credentials: 'include' });
  log('GET /api/me -> ' + res.status + '\\n' + (await res.text()));
}
document.getElementById('me').onclick = me;
document.getElementById('in').onclick = async () => {
  const res = await fetch('/api/auth/sign-in/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'google', callbackURL: '/dev/auth' }) });
  const body = await res.json();
  if (body.url) location.href = body.url; else log('Could not start sign-in: ' + res.status + '\\n' + JSON.stringify(body));
};
document.getElementById('out').onclick = async () => {
  const res = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  log('POST /api/auth/sign-out -> ' + res.status);
  await me();
};
me();
</script>
</body>
</html>
`;
