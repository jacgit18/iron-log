// Sets the saved colour theme on <html> before the first paint, so a person who chose dark never sees a white flash while the app loads.
// A plain file, not an inline script: the page's Content-Security-Policy is script-src 'self' (server/securityHeaders.ts).
// Reads the same key and shape as src/lib/appearance.ts (`ironlog:appearance`, {"theme":"system"|"light"|"dark"}); keep the two in step.
// "system" or anything unreadable sets nothing, so the page follows the OS scheme; applyAppearance() still runs after the bundle loads.
try {
  var saved = JSON.parse(localStorage.getItem('ironlog:appearance') || 'null');
  if (saved && (saved.theme === 'light' || saved.theme === 'dark')) document.documentElement.dataset.theme = saved.theme;
} catch { /* storage blocked or a damaged value: follow the OS */ }
