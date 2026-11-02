// The installed name of a non-production service ("Loadbearer QA", "Loadbearer Staging"), so a phone that has more than one install can tell them apart.
// One image serves every environment, so the name is applied when the page and the manifest are served, from APP_LABEL (set by the deploy script).
const APP_NAME = 'Loadbearer';

/** Only the two known labels count; anything else (unset, a typo) leaves production's names unchanged. */
export function appLabelFrom(value: string | undefined): string | undefined {
  return value === 'QA' || value === 'Staging' ? value : undefined;
}

export function brandManifest(json: string, label: string): string {
  const manifest = JSON.parse(json) as Record<string, unknown>;
  return JSON.stringify({ ...manifest, name: `${APP_NAME} ${label}`, short_name: `${APP_NAME} ${label}` });
}

export function brandHtml(html: string, label: string): string {
  return html
    .replace(`<title>${APP_NAME}</title>`, `<title>${APP_NAME} ${label}</title>`)
    .replace(`name="apple-mobile-web-app-title" content="${APP_NAME}"`, `name="apple-mobile-web-app-title" content="${APP_NAME} ${label}"`);
}
