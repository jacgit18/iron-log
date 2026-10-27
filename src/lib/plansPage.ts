// The public Plans page lives at /plans (src/components/Plans.tsx). The app has no router: main.tsx asks this before it decides between
// the landing page and the app, so the page is reachable with or without an account and never mounts the app.
export const PLANS_PATH = '/plans';

export const isPlansPath = (pathname: string): boolean => pathname === PLANS_PATH || pathname === `${PLANS_PATH}/`;
