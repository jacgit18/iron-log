import { existsSync, readFileSync } from 'node:fs';
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
  it('keeps the installed name and every other manifest field', () => {
    const out = JSON.parse(brandManifest('{"name":"Loadbearer","short_name":"Loadbearer","display":"standalone"}', 'QA'));
    expect(out).toEqual({ name: 'Loadbearer', short_name: 'Loadbearer', display: 'standalone' });
  });
  it('renames the page title and leaves the iOS home-screen title plain', () => {
    const html = '<title>Loadbearer</title><meta name="apple-mobile-web-app-title" content="Loadbearer">';
    expect(brandHtml(html, 'Staging')).toBe('<title>Loadbearer Staging</title><meta name="apple-mobile-web-app-title" content="Loadbearer">');
  });
});

describe('environment icons', () => {
  const manifest = '{"icons":[{"src":"icons/icon-192.png"},{"src":"icons/maskable-512.png","purpose":"maskable"}],"shortcuts":[{"name":"Today","icons":[{"src":"icons/icon-192.png"}]}]}';
  it('points the manifest icons and shortcut icons at the environment folder', () => {
    const out = JSON.parse(brandManifest(manifest, 'QA'));
    expect(out.icons).toEqual([{ src: 'icons/qa/icon-192.png' }, { src: 'icons/qa/maskable-512.png', purpose: 'maskable' }]);
    expect(out.shortcuts[0].icons).toEqual([{ src: 'icons/qa/icon-192.png' }]);
    expect(JSON.parse(brandManifest(manifest, 'Staging')).icons[0].src).toBe('icons/staging/icon-192.png');
  });
  it('points the iOS touch icon at the environment folder', () => {
    expect(brandHtml('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">', 'Staging')).toBe('<link rel="apple-touch-icon" href="/icons/staging/apple-touch-icon.png">');
  });
  it('points the browser tab icon at the environment folder', () => {
    expect(brandHtml('<link rel="icon" href="/logo.svg" type="image/svg+xml">', 'QA')).toBe('<link rel="icon" href="/icons/qa/logo.svg" type="image/svg+xml">');
  });
  it('has the environment icon files the branding points at', () => {
    for (const env of ['qa', 'staging']) expect(existsSync(new URL(`../public/icons/${env}/logo.svg`, import.meta.url)), `${env}/logo.svg`).toBe(true);
    for (const env of ['qa', 'staging']) for (const f of ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'])
      expect(existsSync(new URL(`../public/icons/${env}/${f}`, import.meta.url)), `${env}/${f}`).toBe(true);
  });
});

describe('the real index.html', () => {
  it('has both names the branding replaces', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const out = brandHtml(html, 'QA');
    expect(out).toContain('<title>Loadbearer QA</title>');
    expect(out).toContain('name="apple-mobile-web-app-title" content="Loadbearer"');
    expect(out).toContain('href="/icons/qa/apple-touch-icon.png"');
    expect(out).toContain('href="/icons/qa/logo.svg"');
  });
});
