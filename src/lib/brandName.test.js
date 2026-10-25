import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The app is called Loadbearer (brief brand-loadbearer-rename). Internal names stay `iron-log` on purpose (repo, Cloud Run service, secrets,
// the `ironlog:` storage keys, the export marker), so this guard only looks for the display name "Iron Log" (with the space) in the files
// a person can read: the page, the public files, the app and the server's responses.
const root = fileURLToPath(new URL('../../', import.meta.url));

// Renamed on the held legal PR (#467); remove these two lines when it merges so the pages are guarded too.
const NOT_YET = new Set(['public/privacy.html', 'public/terms.html']);

const isTest = p => /\.(test|spec)\.[jt]sx?$/.test(p);
const walk = dir =>
  readdirSync(join(root, dir)).flatMap(name => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });

const files = [
  'index.html',
  'vite.config.js',
  ...walk('public').filter(p => /\.(html|svg|txt|webmanifest)$/.test(p)),
  ...walk('src').filter(p => /\.(tsx?|css)$/.test(p)),
  ...walk('server').filter(p => /\.tsx?$/.test(p)),
].filter(p => !isTest(p) && !NOT_YET.has(p) && !p.endsWith('brandName.test.js'));

describe('the display name', () => {
  it('scans the files a person can read', () => {
    expect(files).toContain('index.html');
    expect(files).toContain('src/App.tsx');
    expect(files).toContain('server/auth/otpEmail.ts');
  });

  it('is Loadbearer: no file a person reads still says "Iron Log"', () => {
    const stale = files.filter(p => /Iron Log/.test(readFileSync(join(root, p), 'utf8')));
    expect(stale).toEqual([]);
  });

  it('the install name and the page title say Loadbearer', () => {
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toContain('<title>Loadbearer</title>');
    const config = readFileSync(join(root, 'vite.config.js'), 'utf8');
    expect(config).toContain("name: 'Loadbearer'");
    expect(config).toContain("short_name: 'Loadbearer'");
  });

  it('keeps the internal names that old exports and saved data depend on', () => {
    // Changing these would break every old export file and every saved browser copy.
    expect(readFileSync(join(root, 'src/lib/export.ts'), 'utf8')).toContain("d.app !== 'iron-log'");
    expect(readFileSync(join(root, 'src/lib/storage.ts'), 'utf8')).toContain("'ironlog:'");
  });
});
