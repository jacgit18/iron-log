// The installed name of a non-production service ("Loadbearer QA", "Loadbearer Staging"), so a phone that has more than one install can tell them apart.
// One image serves every environment, so the name is applied when the page and the manifest are served, from APP_LABEL (set by the deploy script).
const APP_NAME = 'Loadbearer';

/** Only the two known labels count; anything else (unset, a typo) leaves production's names unchanged. */
export function appLabelFrom(value: string | undefined): string | undefined {
  return value === 'QA' || value === 'Staging' ? value : undefined;
}

// Each environment has its own copies of the icons in icons/<label>/ (scripts/make-icons.mjs draws a corner ribbon on them).
const iconDir = (label: string) => `icons/${label.toLowerCase()}/`;
const ownIcon = (src: string, label: string) => src.replace(/^(\.?\/)?icons\/(?!qa\/|staging\/)/, (_m, lead: string | undefined) => `${lead ?? ''}${iconDir(label)}`);

export function brandManifest(json: string, label: string): string {
  const manifest = JSON.parse(json) as Record<string, unknown>;
  type Icon = { src: string };
  const swap = (icons: unknown) => (Array.isArray(icons) ? (icons as Icon[]).map(i => ({ ...i, src: ownIcon(i.src, label) })) : icons);
  const shortcuts = Array.isArray(manifest.shortcuts) ? (manifest.shortcuts as { icons?: unknown }[]).map(s => ({ ...s, icons: swap(s.icons) })) : manifest.shortcuts;
  return JSON.stringify({ ...manifest, name: `${APP_NAME} ${label}`, short_name: `${APP_NAME} ${label}`, icons: swap(manifest.icons), shortcuts });
}

export function brandHtml(html: string, label: string): string {
  return html
    .replace(`<title>${APP_NAME}</title>`, `<title>${APP_NAME} ${label}</title>`)
    .replace(`name="apple-mobile-web-app-title" content="${APP_NAME}"`, `name="apple-mobile-web-app-title" content="${APP_NAME} ${label}"`)
    .replace('href="/icons/apple-touch-icon.png"', `href="/${iconDir(label)}apple-touch-icon.png"`);
}
