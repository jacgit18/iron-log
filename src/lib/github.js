/* ---------- GitHub backup for the standalone app (GitHub Pages) ----------
   Talks to the GitHub REST API straight from the browser with a fine-grained token that the viewer
   pastes in once per device. Backups go to their own branch (default "data"), so they never start a
   deploy of the site. The first backup creates the branch with only the data files in it. */

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Why a request failed, in words that say what to do next.
function explain(status, rateLimited, repo, hasToken) {
  if (status === 401) return 'GitHub didn’t accept the token. It may have expired or been revoked; create a new one and paste it in.';
  if (rateLimited) return 'GitHub’s limit for requests without a token was reached. Try again in an hour, or paste your token first.';
  if (status === 403) return `The token can’t write to ${repo}. Give it “Contents: Read and write” on that repository.`;
  if (status === 404) return hasToken ? `${repo} wasn’t found, or the token doesn’t include it.` : `${repo} wasn’t found. Check the owner/name.`;
  return `GitHub answered with an error (${status}). Try again in a minute.`;
}

async function request(token, repo, method, path, body, raw) {
  let res;
  try {
    res = await fetch(`${API}/repos/${repo}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GitHubError('Couldn’t reach GitHub. Check your connection and try again.', 0);
  }
  if (res.ok) return raw ? res.text() : res.json();
  const rateLimited = (res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0';
  throw new GitHubError(explain(res.status, rateLimited, repo, !!token), res.status);
}

export const validRepo = r => /^[\w.-]+\/[\w.-]+$/.test(String(r || ''));
const heads = branch => `heads/${branch.split('/').map(encodeURIComponent).join('/')}`;

// The Git Data API refuses to work on a repo with no commits at all. One file through the Contents API makes the first commit
// (on the default branch); after that the usual blob/tree/commit calls work, including for a new branch.
const seedEmptyRepo = call => call('PUT', '/contents/README.md', { message: 'Start the backup repo', content: 'SXJvbiBMb2cgYmFja3VwcyBsaXZlIGluIHRoaXMgcmVwby4K' });

// Commit files ({path, content: base64}) to `branch` in one commit. Returns {sha, url}.
export async function commitFiles({ token, repo, branch, files, message }) {
  const call = (method, path, body) => request(token, repo, method, path, body);
  let seeded = false;
  for (let attempt = 0; ; attempt++) {
    let parent = null;
    try { parent = (await call('GET', `/git/ref/${heads(branch)}`)).object.sha; }
    catch (e) {
      if (e.status === 409 && !seeded) { await seedEmptyRepo(call); seeded = true; continue; } // a repo with no commits answers 409 to every Git Data call
      if (e.status !== 404) throw e; await call('GET', ''); /* is it the repo that's missing? */
    }
    const baseTree = parent ? (await call('GET', `/git/commits/${parent}`)).tree.sha : null;
    let blobs;
    try { blobs = await Promise.all(files.map(f => call('POST', '/git/blobs', { content: f.content, encoding: 'base64' }))); }
    catch (e) { if (e.status === 409 && !parent && !seeded) { await seedEmptyRepo(call); seeded = true; continue; } throw e; }
    const tree = await call('POST', '/git/trees', {
      ...(baseTree ? { base_tree: baseTree } : {}),
      tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[i].sha })),
    });
    const commit = await call('POST', '/git/commits', { message, tree: tree.sha, parents: parent ? [parent] : [] });
    try {
      if (parent) await call('PATCH', `/git/refs/${heads(branch)}`, { sha: commit.sha, force: false });
      else await call('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha });
    } catch (e) {
      // Another device backed up in between: build on top of its commit instead.
      if ((e.status === 422 || e.status === 409) && attempt < 2) continue;
      throw e;
    }
    return { sha: commit.sha, url: `https://github.com/${repo}/commit/${commit.sha}` };
  }
}

// Read one text file from `branch`. The token is optional for a public repo.
export async function readFile({ token, repo, branch, path }) {
  try {
    return await request(token, repo, 'GET', `/contents/${path}?ref=${encodeURIComponent(branch)}`, null, true);
  } catch (e) {
    // A public repo can be read without a token, so an expired token shouldn't stop a restore.
    if (e.status === 401 && token) return readFile({ repo, branch, path });
    if (e.status === 404) throw new GitHubError(`No backup was found on the “${branch}” branch of ${repo}.`, 404);
    throw e;
  }
}
