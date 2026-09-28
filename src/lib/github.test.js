import { describe, it, expect, vi, afterEach } from 'vitest';
import { commitFiles, readFile, validRepo } from './github.js';
import { buildDataFile, dataFingerprint } from './export.js';
import { BUILTIN } from './data.js';
import { DEFAULT_CFG } from './logic.js';

// A fake GitHub: `routes` maps "METHOD /path" to a status and body; every call is recorded.
function fakeGitHub(routes) {
  const calls = [];
  vi.stubGlobal('fetch', async (url, opts) => {
    const path = url.replace('https://api.github.com/repos/me/log', '');
    const key = `${opts.method} ${path}`; calls.push({ key, body: opts.body && JSON.parse(opts.body), headers: opts.headers });
    let r = routes[key]; if (typeof r === 'function') r = r(calls);
    if (!r) throw new Error(`unexpected request ${key}`);
    const [status, body, headers = {}] = r;
    return { ok: status < 300, status, json: async () => body, text: async () => body, headers: { get: h => headers[h] ?? null } };
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const files = [{ path: 'iron-log.xlsx', content: 'UEsDBA==' }, { path: 'iron-log-data.json', content: 'e30=' }];
const writes = {
  'POST /git/blobs': c => [201, { sha: `blob${c.length}` }],
  'POST /git/trees': [201, { sha: 'tree2' }],
  'POST /git/commits': [201, { sha: 'commit2' }],
};

describe('GitHub backup', () => {
  it('adds a commit on top of the backup branch', async () => {
    const calls = fakeGitHub({
      ...writes,
      'GET /git/ref/heads/data': [200, { object: { sha: 'commit1' } }],
      'GET /git/commits/commit1': [200, { tree: { sha: 'tree1' } }],
      'PATCH /git/refs/heads/data': [200, {}],
    });
    const r = await commitFiles({ token: 't', repo: 'me/log', branch: 'data', files, message: 'Backup' });
    expect(r).toEqual({ sha: 'commit2', url: 'https://github.com/me/log/commit/commit2' });
    const body = k => calls.find(c => c.key === k).body;
    expect(body('POST /git/trees')).toMatchObject({ base_tree: 'tree1', tree: [{ path: 'iron-log.xlsx', mode: '100644' }, { path: 'iron-log-data.json' }] });
    expect(body('POST /git/commits')).toEqual({ message: 'Backup', tree: 'tree2', parents: ['commit1'] });
    expect(body('PATCH /git/refs/heads/data')).toEqual({ sha: 'commit2', force: false });
    expect(calls[0].headers.Authorization).toBe('Bearer t');
  });

  it('creates the branch with only the data files the first time', async () => {
    const calls = fakeGitHub({
      ...writes,
      'GET /git/ref/heads/data': [404, {}],
      'GET ': [200, {}],
      'POST /git/refs': [201, {}],
    });
    await commitFiles({ token: 't', repo: 'me/log', branch: 'data', files, message: 'Backup' });
    const body = k => calls.find(c => c.key === k).body;
    expect(body('POST /git/trees').base_tree).toBeUndefined();
    expect(body('POST /git/commits').parents).toEqual([]);
    expect(body('POST /git/refs')).toEqual({ ref: 'refs/heads/data', sha: 'commit2' });
  });

  it('starts again on top of a backup another device made in between', async () => {
    let patches = 0;
    const calls = fakeGitHub({
      ...writes,
      'GET /git/ref/heads/data': c => [200, { object: { sha: c.filter(x => x.key === 'GET /git/ref/heads/data').length === 1 ? 'commit1' : 'commitX' } }],
      'GET /git/commits/commit1': [200, { tree: { sha: 'tree1' } }],
      'GET /git/commits/commitX': [200, { tree: { sha: 'treeX' } }],
      'PATCH /git/refs/heads/data': () => (++patches === 1 ? [422, { message: 'Update is not a fast forward' }] : [200, {}]),
    });
    await commitFiles({ token: 't', repo: 'me/log', branch: 'data', files, message: 'Backup' });
    expect(calls.filter(c => c.key === 'POST /git/commits').map(c => c.body.parents)).toEqual([['commit1'], ['commitX']]);
  });

  it('explains what went wrong', async () => {
    fakeGitHub({ 'GET /git/ref/heads/data': [401, {}] });
    await expect(commitFiles({ token: 'bad', repo: 'me/log', branch: 'data', files, message: 'x' })).rejects.toThrow('didn’t accept the token');
    fakeGitHub({ 'GET /git/ref/heads/data': [404, {}], 'GET ': [404, {}] });
    await expect(commitFiles({ token: 't', repo: 'me/log', branch: 'data', files, message: 'x' })).rejects.toThrow('me/log wasn’t found, or the token doesn’t include it');
    fakeGitHub({ 'GET /git/ref/heads/data': [200, { object: { sha: 'c1' } }], 'GET /git/commits/c1': [200, { tree: { sha: 't1' } }], 'POST /git/blobs': [403, {}] });
    await expect(commitFiles({ token: 't', repo: 'me/log', branch: 'data', files, message: 'x' })).rejects.toThrow('Contents: Read and write');
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(commitFiles({ token: 't', repo: 'me/log', branch: 'data', files, message: 'x' })).rejects.toThrow('Couldn’t reach GitHub');
  });
});

describe('GitHub restore', () => {
  it('reads the raw file from the backup branch, without a token when there is none', async () => {
    const calls = fakeGitHub({ 'GET /contents/iron-log-data.json?ref=data': [200, '{"app":"iron-log"}'] });
    expect(await readFile({ token: '', repo: 'me/log', branch: 'data', path: 'iron-log-data.json' })).toBe('{"app":"iron-log"}');
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].headers.Accept).toBe('application/vnd.github.raw+json');
  });
  it('tries again without an expired token, since a public repo needs none', async () => {
    const calls = fakeGitHub({ 'GET /contents/iron-log-data.json?ref=data': c => (c.length === 1 ? [401, {}] : [200, '{}']) });
    expect(await readFile({ token: 'old', repo: 'me/log', branch: 'data', path: 'iron-log-data.json' })).toBe('{}');
    expect(calls.map(c => !!c.headers.Authorization)).toEqual([true, false]);
  });
  it('says when there is no backup yet, or the hourly limit was hit', async () => {
    fakeGitHub({ 'GET /contents/iron-log-data.json?ref=data': [404, {}] });
    await expect(readFile({ repo: 'me/log', branch: 'data', path: 'iron-log-data.json' })).rejects.toThrow('No backup was found on the “data” branch of me/log');
    fakeGitHub({ 'GET /contents/iron-log-data.json?ref=data': [403, {}, { 'x-ratelimit-remaining': '0' }] });
    await expect(readFile({ repo: 'me/log', branch: 'data', path: 'iron-log-data.json' })).rejects.toThrow('limit');
  });
});

describe('backup bookkeeping', () => {
  it('checks the repository name', () => {
    expect(['jacgit18/iron-log', 'a.b/c-d_e'].every(validRepo)).toBe(true);
    expect(['iron-log', 'a/b/c', 'https://github.com/a/b', ''].some(validRepo)).toBe(false);
  });
  it('fingerprints the data, not when it was exported or the backup record', () => {
    const S = { cfg: structuredClone(DEFAULT_CFG), logs: { hack: [{ d: '2026-09-21', w: 270, s: 4, r: 15 }] }, programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], body: [] };
    const a = buildDataFile(S, {});
    const b = { ...buildDataFile(S, {}), exportedAt: 'later', config: { ...a.config, ghBackup: { hash: 'x', last: { at: 'now' } } } };
    const before = dataFingerprint(a);
    expect(dataFingerprint(b)).toBe(before);
    S.logs = { hack: [...S.logs.hack, { d: '2026-09-28', w: 275, s: 4, r: 15 }] };
    expect(dataFingerprint(buildDataFile(S, {}))).not.toBe(before);
  });
});
