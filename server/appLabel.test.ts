import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appLabelFrom, brandHtml, brandManifest } from './appLabel.ts';

describe('appLabelFrom', () => {
  it('accepts QA and Staging only', () => {
    expect(appLabelFrom('QA')).toBe('QA');
    expect(appLabelFrom('Staging')).toBe('Staging');
    expect(appLabelFrom(undefined)).toBeUndefined();
    expect(appLabelFrom('')).toBeUndefined();
    expect(appLabelFrom('Production')).toBeUndefined();
  });
});

describe('branding', () => {
  it('renames the manifest and keeps its other fields', () => {
    const out = JSON.parse(brandManifest('{"name":"Loadbearer","short_name":"Loadbearer","display":"standalone"}', 'QA'));
    expect(out).toEqual({ name: 'Loadbearer QA', short_name: 'Loadbearer QA', display: 'standalone' });
  });
  it('renames the page title and the iOS home-screen title', () => {
    const html = '<title>Loadbearer</title><meta name="apple-mobile-web-app-title" content="Loadbearer">';
    expect(brandHtml(html, 'Staging')).toBe('<title>Loadbearer Staging</title><meta name="apple-mobile-web-app-title" content="Loadbearer Staging">');
  });
});

describe('the real index.html', () => {
  it('has both names the branding replaces', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const out = brandHtml(html, 'QA');
    expect(out).toContain('<title>Loadbearer QA</title>');
    expect(out).toContain('name="apple-mobile-web-app-title" content="Loadbearer QA"');
  });
});
