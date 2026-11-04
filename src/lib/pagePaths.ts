// The page addresses the service worker answers with the app. Any other page load goes to the network, so the server's 404 page (public/404.html)
// is reachable for an installed app too. Same list as server/pagePaths.ts (pagePaths.test.ts compares them). Workbox tests each pattern against
// the path plus the query string, so `/?open=board` and a share-target `/?share_title=x` still match.
// `base` is the folder the app is served from ('/' on the server; '/iron-log/' for a BASE_PATH build on GitHub Pages): the worker passes its own scope.
export function pagePathPatterns(base: string = '/'): RegExp[] {
  const b = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/?$/, '/');
  return [new RegExp(`^${b}(\\?|$)`), new RegExp(`^${b}plans/?(\\?|$)`)];
}
