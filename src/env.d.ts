/* Browser globals the app reads that lib.dom does not declare. */
interface Window {
  /** The Claude host's runtime, present only when the app runs inside it (db, downloads and connector handles). */
  claude?: { use?(name: string): Promise<any> };
}
