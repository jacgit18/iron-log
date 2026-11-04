// The page addresses the service worker answers with the app. Any other page load goes to the network, so the server's 404 page (public/404.html)
// is reachable for an installed app too. Same list as server/pagePaths.ts (pagePaths.test.ts compares them). Workbox tests each pattern against
// the path plus the query string, so `/?open=board` and a share-target `/?share_title=x` still match.
export const PAGE_PATH_PATTERNS: readonly RegExp[] = [/^\/(\?|$)/, /^\/plans\/?(\?|$)/];
