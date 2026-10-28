import { describe, expect, it } from 'vitest';
import { parseNumstat, pickReview } from './review-model.mjs';

const f = (path, added = 10, deleted = 0) => ({ path, added, deleted });

describe('pickReview', () => {
  it('uses the light tier for docs, tests and images only', () => {
    const r = pickReview([f('README.md'), f('src/a.test.ts'), f('e2e/x.spec.js'), f('public/logo.png')]);
    expect(r).toMatchObject({ tier: 'light', model: 'claude-sonnet-5-5', turns: 15 });
  });

  it('uses the standard tier for ordinary source changes', () => {
    expect(pickReview([f('src/components/Card.tsx'), f('src/Card.css')]).tier).toBe('standard');
  });

  it('goes deep on a risky path and names it', () => {
    const r = pickReview([f('src/Card.tsx'), f('db/migrations/024_add.sql')]);
    expect(r.tier).toBe('deep');
    expect(r.model).toBe('claude-opus-5-5');
    expect(r.reasons[0]).toContain('db/migrations/024_add.sql');
  });

  it.each(['.github/workflows/test.yml', 'package.json', 'Dockerfile', 'server/auth/session.ts', 'src/billing/plan.ts', '.env.example'])(
    'treats %s as risky',
    (p) => expect(pickReview([f(p, 1)]).tier).toBe('deep'),
  );

  it('does not call a lookalike word risky', () => {
    expect(pickReview([f('src/author.ts'), f('src/authorize-label.css')]).tier).toBe('standard');
  });

  it('goes deep on a big diff or many files', () => {
    expect(pickReview([f('src/a.ts', 601)]).tier).toBe('deep');
    expect(pickReview(Array.from({ length: 26 }, (_, i) => f(`src/f${i}.ts`, 1))).tier).toBe('deep');
    expect(pickReview([f('src/a.ts', 600)]).tier).toBe('standard');
  });

  it('does not count lock file lines toward size', () => {
    expect(pickReview([f('src/a.ts', 5), f('pnpm-lock.yaml', 9000)]).reasons.join()).not.toContain('changed lines');
  });

  it('lets a label override the pick', () => {
    expect(pickReview([f('README.md')], { labels: ['review:deep'] }).tier).toBe('deep');
    expect(pickReview([f('package.json')], { labels: ['Review:Standard'] }).tier).toBe('standard');
  });

  it('merges project config: extra risky paths, models and thresholds', () => {
    const config = { highRisk: ['^src/store/'], models: { deep: 'claude-fable-5-1' }, deepLines: 50 };
    expect(pickReview([f('src/store/logSlice.ts', 1)], { config })).toMatchObject({ tier: 'deep', model: 'claude-fable-5-1' });
    expect(pickReview([f('src/a.ts', 51)], { config }).tier).toBe('deep');
  });

  it('never picks Haiku', () => {
    for (const files of [[f('README.md')], [f('src/a.ts')], [f('package.json')]]) {
      expect(pickReview(files).model).not.toMatch(/haiku/i);
    }
  });
});

describe('parseNumstat', () => {
  it('reads lines, binary files and renames', () => {
    const text = '3\t1\tsrc/a.ts\n-\t-\tpublic/x.png\n2\t2\tsrc/{old => new}/b.ts\n1\t0\tsrc/c.ts => src/d.ts\n';
    expect(parseNumstat(text)).toEqual([
      { path: 'src/a.ts', added: 3, deleted: 1 },
      { path: 'public/x.png', added: 0, deleted: 0 },
      { path: 'src/new/b.ts', added: 2, deleted: 2 },
      { path: 'src/d.ts', added: 1, deleted: 0 },
    ]);
  });
});
