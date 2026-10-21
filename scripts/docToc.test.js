import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// scripts/doc-toc.mjs adds a generated "## Contents" list under the H1 of a long markdown file; `npm run lint` checks README.md and SETUP.md with it.
const body = n => Array.from({ length: n }, (_, i) => `Line ${i}.`).join('\n');
const doc = `# Title\n\n_Intro._\n\n## First part\n${body(40)}\n\n## Second part\n${body(40)}\n`;
const tmp = () => mkdtempSync(join(tmpdir(), 'doc-toc-'));
const run = (...args) => spawnSync('node', ['scripts/doc-toc.mjs', '--style=md', ...args], { encoding: 'utf8' });

describe('doc-toc', () => {
  it('fails --check on a long document without a list, writes one, then passes and stays the same', () => {
    const f = join(tmp(), 'a.md');
    writeFileSync(f, doc);
    expect(run('--check', f).status).toBe(1);
    run(f);
    const once = readFileSync(f, 'utf8');
    expect(once).toContain('<!-- toc -->');
    expect(once).toContain('- [First part](#first-part)');
    expect(once.split('\n').findIndex(l => l.includes('<!-- toc -->'))).toBeLessThan(40);
    expect(run('--check', f).status).toBe(0);
    run(f);
    expect(readFileSync(f, 'utf8')).toBe(once);
  });
  it('fails --check when a heading was added after the list was made', () => {
    const f = join(tmp(), 'a.md');
    writeFileSync(f, doc);
    run(f);
    writeFileSync(f, `${readFileSync(f, 'utf8')}\n## Third part\nText.\n`);
    expect(run('--check', f).status).toBe(1);
  });
  it('leaves a short document alone', () => {
    const f = join(tmp(), 'short.md');
    writeFileSync(f, '# Short\n\n## One\nText.\n');
    expect(run('--check', f).status).toBe(0);
  });
  it('replaces a hand-written Contents list instead of adding a second', () => {
    const f = join(tmp(), 'a.md');
    writeFileSync(f, doc.replace('## First part', '## Contents\n- [First part](#first-part)\n\n## First part'));
    run(f);
    expect(readFileSync(f, 'utf8').match(/^## Contents$/gm)).toHaveLength(1);
  });
  it('ignores headings inside code fences', () => {
    const f = join(tmp(), 'a.md');
    writeFileSync(f, doc.replace('## Second part', '```\n## Not a heading\n```\n\n## Second part'));
    run(f);
    expect(readFileSync(f, 'utf8')).not.toContain('[Not a heading]');
  });
  it('passes for README.md and SETUP.md, as npm run lint requires', () => {
    expect(() => execFileSync('node', ['scripts/doc-toc.mjs', '--check', '--style=md', 'README.md', 'SETUP.md'], { encoding: 'utf8' })).not.toThrow();
  });
});
