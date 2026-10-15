## What and why


## Audience (user-facing changes)

- [ ] n/a: no user-facing change
- [ ] **Admin only**: `'admin'` in `FEATURES` (`src/features.ts`), UI behind `useFeature`, `requireAdmin` on any new API route
- [ ] **Everyone**: released on purpose (`'all'`, or the flag removed)

## Checks

- [ ] `npm run typecheck && npm test && npm run lint && npm run build`
- [ ] `npm run e2e` (and `e2e:sync` if `src/sync/`, `server/` or store startup changed)
- [ ] UI, style, font, image or bundle change: `node scripts/lighthouse.mjs --check` run, before and after in the description (n/a otherwise)
- [ ] `feature-map.md` (including "Audience at a glance") and `CHANGELOG.md` updated
