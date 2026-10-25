import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The `if:` lines on the staging and deploy jobs of .github/workflows/deploy-cloud-run.yml decide whether production can deploy (ADR 058). The
// workflow's expressions are never run by the test suite, so this evaluates them here against each situation. No YAML library: the two
// conditions are folded blocks (`if: >-`), so they are cut out of the text and run as JavaScript (the operators used are the same).
const text = readFileSync('.github/workflows/deploy-cloud-run.yml', 'utf8').split('\n');

function condition(job: string): string {
  const start = text.indexOf(`  ${job}:`);
  expect(start, `job ${job}`).toBeGreaterThan(-1);
  const at = text.findIndex((l, i) => i > start && l === '    if: >-');
  expect(at, `${job} has a folded if`).toBeGreaterThan(-1);
  const lines: string[] = [];
  for (let i = at + 1; i < text.length && /^ {6,}\S/.test(text[i]!); i++) lines.push(text[i]!.trim());
  return lines.join(' ').replace(/always\(\)/g, 'true');
}

interface Situation {
  enabled?: boolean;
  ref?: string;
  skipStaging?: boolean;
}
const contexts = (s: Situation, staging: string) => ({
  vars: { STAGING_ENABLED: s.enabled ? 'true' : undefined },
  github: { event_name: 'workflow_dispatch', ref: s.ref ?? 'refs/heads/main', repository: 'o/r' },
  inputs: { skip_staging: !!s.skipStaging },
  needs: { staging: { result: staging } },
});
const evaluate = (expr: string, s: Situation, staging = 'success') => {
  const c = contexts(s, staging);
  return Boolean(new Function('vars', 'github', 'inputs', 'needs', `return (${expr});`)(c.vars, c.github, c.inputs, c.needs));
};
const stagingRuns = (s: Situation) => evaluate(condition('staging'), s);
const productionRuns = (s: Situation, staging: string) => evaluate(condition('deploy'), s, staging);

describe('the deploy workflow gate (ADR 058)', () => {
  it('production job needs the staging job', () => {
    const start = text.indexOf('  deploy:');
    expect(text.slice(start, start + 12).some(l => l === '    needs: staging')).toBe(true);
  });

  it('the staging job uses the shared deploy action, with the repository\'s own scripts', () => {
    const whole = text.join('\n');
    const staging = whole.slice(whole.indexOf('\n  staging:'), whole.indexOf('\n  deploy:'));
    expect(staging).toContain('uses: ./.github/actions/deploy-candidate');
    expect(staging).toContain('scripts: ${{ github.workspace }}/scripts');
    expect(staging).toContain('label: staging');
  });

  it('nothing starts the workflow but a person: no automatic trigger, no pause switch', () => {
    const whole = text.join('\n');
    expect(whole).not.toContain('workflow_run');
    expect(whole).not.toContain('DEPLOY_PAUSED');
    expect(text.some(l => l === '  workflow_dispatch:')).toBe(true);
  });

  it('while STAGING_ENABLED is not true, staging is skipped and production deploys as it did before staging existed', () => {
    const s: Situation = {};
    expect(stagingRuns(s)).toBe(false);
    expect(productionRuns(s, 'skipped')).toBe(true);
  });

  it('once enabled, a run goes through staging, and production follows only a staging that passed', () => {
    const s: Situation = { enabled: true };
    expect(stagingRuns(s)).toBe(true);
    expect(productionRuns(s, 'success')).toBe(true);
    expect(productionRuns(s, 'failure')).toBe(false);
    expect(productionRuns(s, 'cancelled')).toBe(false);
  });

  it('once enabled, a skipped staging does not let production through, unless "skip staging" is ticked, which lets production run alone', () => {
    expect(productionRuns({ enabled: true }, 'skipped')).toBe(false);
    const skip: Situation = { enabled: true, skipStaging: true };
    expect(stagingRuns(skip)).toBe(false);
    expect(productionRuns(skip, 'skipped')).toBe(true);
  });

  it('a run started on a branch other than main runs neither job', () => {
    const s: Situation = { enabled: true, ref: 'refs/heads/f-x' };
    expect(stagingRuns(s)).toBe(false);
    expect(productionRuns(s, 'success')).toBe(false);
    expect(productionRuns({ ref: 'refs/heads/f-x' }, 'skipped')).toBe(false);
  });
});
