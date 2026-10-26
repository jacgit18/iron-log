## What and why


## Audience (user-facing changes)

<!-- Tick exactly one. `node scripts/pr-body.mjs --what "..."` writes this whole description with the right box ticked. -->

- [ ] n/a: no user-facing change
- [ ] **Admin only**: `'admin'` in `FEATURES` (`src/features.ts`), UI behind `useFeature`, `requireAdmin` on any new API route
- [ ] **Paid subscribers**: `'paid'` in `FEATURES` (`src/features.ts`), UI behind `useFeature`, `requirePaid` (`server/plan.ts`) on any new API route
- [ ] **Everyone**: released on purpose (`'all'`, or the flag removed)

## Changelog

<!-- One or two sentences for CHANGELOG.md in the project docs (the "PR changelog" check needs real text here; write "n/a: <why>" for a change that needs none). `node scripts/pr-body.mjs --changelog "..."` fills it. -->

## Delivery

<!-- One feature, one brief, one PR (feature-delivery.md). `node scripts/pr-body.mjs --brief "<path>" --split "<reason>" --tracker "<note>"` fills these. The tracker line says which PR-TRACKER.md row you updated (feature, and for a fix the cause code). A split needs one of: migration first, file overlap with an open PR (name it), over about 600 lines or 25 files, pure-move refactor first, device or owner-only part. -->

Brief: none given (pass --brief)
Split because: n/a: this PR is the whole feature
PR tracker: not updated (pass --tracker)

## Done

<!-- Paste the card's "Done when" list (definition-of-done.md). Mark each line with its evidence label: verified, read-only, agent-reported or not run (say why). A line that is not verified means this is ready for review with a gap, not done. -->

- [ ] Every "Done when" line is listed above with its evidence label
- [ ] The project's Definition of done (its CLAUDE.md) walked through; gaps named here

## Checks

- [ ] `npm run typecheck && npm test && npm run lint && npm run build`
- [ ] `npm run e2e` (and `e2e:sync` if `src/sync/`, `server/` or store startup changed)
- [ ] UI, style, font, image or bundle change: `node scripts/lighthouse.mjs --check` run, before and after in the description (n/a otherwise)
- [ ] `feature-map.md` (including "Audience at a glance") and `CHANGELOG.md` updated
- [ ] Environments: a change that adds a migration, a secret, an environment variable or a setting says where it is applied (production, staging, QA) and what is left to do (n/a otherwise; the parity report checks migrations and secret names, nothing else)
- [ ] CI minutes: n/a (no workflow or test-suite change), or PR wall-clock and runner minutes before and after, with any new job, leg, spec or timeout named and what a new e2e spec catches that a unit test cannot (`ci-budget.md`; budget in `CI-BUDGET.md`)
- [ ] New packages: none, or listed in the description with the lower ladder rung and a `Dependency approval:` line (`dependency-security.md`)
