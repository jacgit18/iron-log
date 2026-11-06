// The page addresses the server answers with the app (or its own page). Any other path with no file extension is a real 404 (public/404.html).
// src/lib/pagePaths.ts holds the same list for the service worker, which cannot import server code; pagePaths.test.ts keeps the two in step.
// A new path route in the app (like /plans) is added to both lists.
export const PAGE_PATHS: readonly string[] = ['/', '/plans', '/plans/'];

export const isPagePath = (path: string): boolean => PAGE_PATHS.includes(path);
