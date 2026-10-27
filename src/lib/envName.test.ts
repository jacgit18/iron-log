import { describe, expect, it } from 'vitest';
import { appTitle, envNameOf } from './envName.js';

describe('envNameOf', () => {
  it('names the QA and staging hosts', () => {
    expect(envNameOf('qa.loadbearer.app')).toBe('QA');
    expect(envNameOf('staging.loadbearer.app')).toBe('Staging');
    expect(envNameOf('QA.Loadbearer.app')).toBe('QA');
  });
  it('has no name for production, the Cloud Run address, localhost or an IP', () => {
    for (const h of ['loadbearer.app', 'www.loadbearer.app', 'iron-log-abc-uc.a.run.app', 'localhost', '127.0.0.1', '[::1]', '']) expect(envNameOf(h), h).toBeNull();
  });
  it('needs the environment to be the first label of a real host, not just part of a name', () => {
    for (const h of ['qa', 'staging', 'qa-tools.loadbearer.app', 'myqa.loadbearer.app', 'app.qa.loadbearer.app', 'constructor.loadbearer.app', '__proto__.example.com']) expect(envNameOf(h), h).toBeNull();
  });
});

describe('appTitle', () => {
  it('keeps the name and adds the environment after it', () => {
    expect(appTitle('qa.loadbearer.app')).toBe('Loadbearer - QA');
    expect(appTitle('staging.loadbearer.app')).toBe('Loadbearer - Staging');
  });
  it('is just the name everywhere else', () => {
    expect(appTitle('loadbearer.app')).toBe('Loadbearer');
    expect(appTitle('localhost')).toBe('Loadbearer');
  });
});
