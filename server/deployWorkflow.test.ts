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
  paused?: boolean;
  event: 'workflow_run' | 'workflow_dispatch';
  testsPassed?: boolean;
  skipStaging?: boolean;
}
const contexts = (s: Situation, staging: string) => ({
  vars: { STAGING_ENABLED: s.enabled ? 'true' : undefined, DEPLOY_PAUSED: s.paused ? 'true' : undefined },
  github: {
    event_name: s.event,
    ref: 'refs/heads/main',
    repository: 'o/r',
    event: { workflow_run: { conclusion: s.testsPassed === false ? 'failure' : 'success', event: 'push', head_repository: { full_name: 'o/r' } } },
  },
  inputs: s.event === 'workflow_dispatch' ? { skip_staging: !!s.skipStaging } : {},
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

  it('while STAGING_ENABLED is not true, staging is skipped and production deploys as it did before staging existed', () => {
    const s: Situation = { event: 'workflow_run' };
    expect(stagingRuns(s)).toBe(false);
    expect(productionRuns(s, 'skipped')).toBe(true);
    expect(productionRuns({ event: 'workflow_dispatch' }, 'skipped')).toBe(true);
  });

  it('once enabled, a merge runs staging, and production follows only a staging that passed', () => {
    const s: Situation = { enabled: true, event: 'workflow_run' };
    expect(stagingRuns(s)).toBe(true);
    expect(productionRuns(s, 'success')).toBe(true);
    expect(productionRuns(s, 'failure')).toBe(false);
    expect(productionRuns(s, 'cancelled')).toBe(false);
  });

  it('once enabled, a staging that was skipped does not let an automatic run through', () => {
    expect(productionRuns({ enabled: true, event: 'workflow_run' }, 'skipped')).toBe(false);
  });

  it('a failed Tests run runs neither job', () => {
    const s: Situation = { enabled: true, event: 'workflow_run', testsPassed: false };
    expect(stagingRuns(s)).toBe(false);
    expect(productionRuns(s, 'skipped')).toBe(false);
    expect(productionRuns({ event: 'workflow_run', testsPassed: false }, 'skipped')).toBe(false);
  });

  it('DEPLOY_PAUSED stops both automatic jobs', () => {
    const s: Situation = { enabled: true, paused: true, event: 'workflow_run' };
    expect(stagingRuns(s)).toBe(false);
    expect(productionRuns(s, 'skipped')).toBe(false);
  });

  it('a manual run goes through staging, unless "skip staging" is ticked, which lets production run alone', () => {
    const manual: Situation = { enabled: true, event: 'workflow_dispatch' };
    expect(stagingRuns(manual)).toBe(true);
    expect(productionRuns(manual, 'success')).toBe(true);
    expect(productionRuns(manual, 'failure')).toBe(false);
    const skip: Situation = { ...manual, skipStaging: true };
    expect(stagingRuns(skip)).toBe(false);
    expect(productionRuns(skip, 'skipped')).toBe(true);
  });

  it('a manual run is not blocked by DEPLOY_PAUSED', () => {
    expect(productionRuns({ enabled: true, paused: true, event: 'workflow_dispatch', skipStaging: true }, 'skipped')).toBe(true);
  });
});
