/* ---------- Which environment this copy of the app is running in (header and tab title) ----------
   The QA and staging services are only ever deployed on a host whose first label is the environment (`qa.<domain>`, `staging.<domain>`;
   scripts/deploy-cloud-run.sh refuses any other). So the host says which one this is, with no build setting to forget. Production, the
   Cloud Run address, localhost and an IP address have none. */

const NAMES: Record<string, string> = { qa: 'QA', staging: 'Staging' };

/** "QA" or "Staging" for a QA or staging host, else null. */
export function envNameOf(hostname: string): string | null {
  const [first, ...rest] = hostname.toLowerCase().split('.');
  return rest.length > 0 && first !== undefined && Object.hasOwn(NAMES, first) ? NAMES[first]! : null;
}

/** The app name with the environment after it where there is one: "Loadbearer - QA". */
export const appTitle = (hostname: string): string => {
  const env = envNameOf(hostname);
  return env ? `Loadbearer - ${env}` : 'Loadbearer';
};
