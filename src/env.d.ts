/* Browser globals the app reads that lib.dom does not declare. */
interface Window {
  /** The Claude host's runtime, present only when the app runs inside it (db, downloads and connector handles). */
  claude?: { use?(name: string): Promise<any> };
}

/** The build id, set at build time (vite.config.js). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "true" turns on syncing through the API (the feature flag, see feature-flags.md). Off by default. */
  readonly VITE_API_SYNC?: string;
}
