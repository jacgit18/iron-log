#!/usr/bin/env node
// Turns on the repo's git hooks (.githooks): the pre-push hook runs `npm run check`, so what CI would fail shows up before the push.
// Run once per clone: node scripts/install-hooks.mjs. Skip it for one push with SKIP_CHECK=1 git push (or git push --no-verify).
import { execFileSync } from 'node:child_process';

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('Git hooks on: .githooks/pre-push runs npm run check before every push.');
