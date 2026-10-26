import { describe, expect, it } from 'vitest';
import { checkWorkflow } from './ci-timeouts.mjs';

const wf = (jobs) => `name: x\non: push\njobs:\n${jobs}`;

describe('checkWorkflow', () => {
  it('passes a job with a timeout', () => {
    expect(checkWorkflow(wf('  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n    steps: []\n'))).toEqual([]);
  });

  it('flags a job with no timeout and names it', () => {
    const p = checkWorkflow(wf('  test:\n    runs-on: ubuntu-latest\n    steps: []\n  lint:\n    timeout-minutes: 5\n'));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ job: 'test', problem: 'no timeout-minutes' });
  });

  it('flags a value over the ceiling unless a timeout-ok reason is given', () => {
    expect(checkWorkflow(wf('  a:\n    timeout-minutes: 30\n'))).toHaveLength(1);
    expect(checkWorkflow(wf('  a:\n    timeout-minutes: 30 # timeout-ok: full deploy\n'))).toEqual([]);
    expect(checkWorkflow(wf('  a:\n    # timeout-ok: full deploy\n    timeout-minutes: 30\n'))).toEqual([]);
  });

  it('exempts a job that calls a reusable workflow', () => {
    expect(checkWorkflow(wf('  call:\n    uses: ./.github/workflows/other.yml\n'))).toEqual([]);
  });

  it('accepts quoted values and expressions it cannot evaluate', () => {
    expect(checkWorkflow(wf("  a:\n    timeout-minutes: '5'\n"))).toEqual([]);
    expect(checkWorkflow(wf('  a:\n    timeout-minutes: ${{ inputs.minutes }}\n'))).toEqual([]);
  });

  it('ignores a step-level timeout and a commented-out job-level one', () => {
    const text = wf('  a:\n    steps:\n      - run: x\n        timeout-minutes: 3\n    # timeout-minutes: 5\n');
    expect(checkWorkflow(text)).toHaveLength(1);
  });

  it('does not mistake keys under steps or env for jobs', () => {
    const text = wf('  a:\n    timeout-minutes: 5\n    env:\n      FOO: 1\n    steps:\n      - run: x\n');
    expect(checkWorkflow(text)).toEqual([]);
  });

  it('returns nothing for a file with no jobs key', () => {
    expect(checkWorkflow('name: x\n')).toEqual([]);
  });
});
