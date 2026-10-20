## What and why


## Audience (user-facing changes)

<!-- Tick exactly one. `node scripts/pr-body.mjs --what "..."` writes this whole description with the right box ticked. -->

- [ ] n/a: no user-facing change
- [ ] **Admin only**: `'admin'` in `FEATURES` (`src/features.ts`), UI behind `useFeature`, `requireAdmin` on any new API route
- [ ] **Paid subscribers**: `'paid'` in `FEATURES` (`src/features.ts`), UI behind `useFeature`, `requirePaid` (`server/plan.ts`) on any new API route
- [ ] **Everyone**: released on purpose (`'all'`, or the flag removed)

## Changelog

<!-- One or two sentences for CHANGELOG.md in the project docs (the "PR changelog" check needs real text here; write "n/a: <why>" for a change that needs none). `node scripts/pr-body.mjs --changelog "..."` fills it. -->

## Done

<!-- Paste the card's "Done when" list (definition-of-done.md). Mark each line with its evidence label: verified, read-only, agent-reported or not run (say why). A line that is not verified means this is ready for review with a gap, not done. -->

- [ ] Every "Done when" line is listed above with its evidence label
- [ ] The project's Definition of done (its CLAUDE.md) walked through; gaps named here

## Checks

- [ ] `npm run typecheck && npm test && npm run lint && npm run build`
- [ ] `npm run e2e` (and `e2e:sync` if `src/sync/`, `server/` or store startup changed)
- [ ] UI, style, font, image or bundle change: `node scripts/lighthouse.mjs --check` run, before and after in the description (n/a otherwise)
- [ ] `feature-map.md` (including "Audience at a glance") and `CHANGELOG.md` updated
