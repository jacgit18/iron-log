# Iron Log

React 19 + Vite PWA, TypeScript, zustand store, Vitest and Playwright.

## Read first

In `DevHiveMind/Projects/iron-log/` (the folder itself; there is no `docs/` subfolder): `ROADMAP.md` (what to build, out of scope), `ARCHITECTURE.md` (where code lives), `DECISIONS.md` (ADR index; do not re-litigate), `CHANGELOG.md` (add an entry in each PR). `README.md` is in this repo. Before any UI change read the UX set in `ux/` there: `UX-DESIGN-BRIEF.md`, `USERFLOW.md`, `DESIGN-SYSTEM.md` (tokens live in `src/styles.css`), `COMPONENTS.md`, `SCREEN-SPECS.md`; update them in the same PR as a UI change.

## Language

- **Write all new code in TypeScript** (`.ts`/`.tsx`, `strict`). Do not add `.js` or `.jsx` files. Convert a legacy file when you touch it.
- Shared data types are in `src/types.ts`; store state and actions (`AppState`) and sheet form types are in `src/store/types.ts`. Add to these instead of redefining a shape in a file.
- Type props, handlers and form state. Avoid `any`; use `unknown` and narrow it. The only accepted loose spots are code that cleans untrusted JSON (`validate`, `normConfig`, `excelImport`, ...) and the host's db/connector handles.
- Still JavaScript on purpose: tests (`*.test.js`), `e2e/`, config files, `scripts/` and `tools/`. Convert those only when you edit them.

## Checks (run the ones that fit what you changed; CI runs all of them)

```
npm run check            # picks the checks from the files changed against origin/main
npm run check -- --list  # show what it would run and why
npm run check -- --all   # typecheck, test, lint, e2e
```

What it picks: docs only runs nothing; tests only run `test` + `lint`; styles run `e2e` + `lint` (lint checks the CSS format); source runs `typecheck` + `test` + `lint` and `build` (or `e2e` for UI or store code, which builds the app itself); `src/sync/`, `server/` or the store add `e2e:sync` and `db:check` (both need `DATABASE_URL`); migrations run `db:check`; `package.json`, tsconfig or other config runs everything, and so does any file it does not know. If unsure, run `--all`. The board reorder and log write path tests never get skipped: they sit in `npm test`, which runs for any source change.

```
npm run typecheck && npm test && npm run lint && npm run build   # the individual checks
npm run e2e
DATABASE_URL=postgres://ironlog:ironlog@127.0.0.1:5433/ironlog npm run e2e:sync   # after touching src/sync/, server/ or the store's startup
```

If `npm test` fails with `Test timed out in 5000ms` while the machine is busy (check `uptime`: a load far above the core count), rerun with `npx vitest run --maxWorkers=4`. The tests are CPU-heavy and the 5 s limit trips under contention. A failure on an idle machine is real.

`e2e:sync` runs the app with syncing on against the real API and a scratch Postgres database it makes and drops (the local Docker one from
`npm run db:start` is fine); it refuses a server that is not on this machine. Syncing is behind a flag (`feature-flags.md`) and off by default.

## Conventions

- **Styles:** `src/styles.css` has one property per line (`npm run format:css` formats it, `npm run lint` checks it), so two branches editing different properties don't conflict. Put a new component's styles in its own file next to it (`Foo.css`, imported by `Foo.tsx`), not in `styles.css`, so parallel PRs don't add rules at the same spot. That file loads after `styles.css`, so use the component's own class names there; change shared classes in `styles.css`.
- **Imports:** put a new import line next to the imports from the same folder, not at the end of the block, and add a needed name to an existing `{ … }` in alphabetical order. Two branches that each add a line at the end of the same block conflict.
- **One open PR per area:** before starting a branch, check the open PRs (`gh pr list`, then `gh pr diff <n> --name-only`). If one already changes the same store slice (`src/store/*Slice.ts` and its test, plus the `AppState` part of `store/types.ts`) or the same component, wait for it to merge and branch off main afterwards. Don't build both at once.
- **E2E tests:** a new feature gets its own spec file (`e2e/<feature>.spec.js`, like `swipe.spec.js` or `progressVolume.spec.js`). When a test does belong in an existing spec, put it next to the tests for the same screen or flow (inside their `describe`, if the file has one), not at the end of the file. Tests appended at the end of the same file conflict.
- One change per commit. Do not change behavior inside a refactor or conversion commit.
- Board reorder and log write paths (`planFix`, `mutateChecks`, `autoLogs`, `addEntry`) must keep the existing tests green: no exercise may be lost or duplicated.
- Update `feature-map.md` (project docs) in the same PR as any feature or interaction change.
- **New user-facing feature = everyone, for now.** Until the app has a user base (owner's call, 2026-10-13), a new feature ships to everyone with no feature flag: tick **Everyone** in the PR and say so in `feature-map.md` and `CHANGELOG.md`. Go admin-only only when the owner asks for it on that feature, or once this rule is changed back.
- **Admin-only, when asked for.** Add `name: 'admin'` to `FEATURES` in `src/features.ts` (with its removal condition in a comment), wrap the UI in `useFeature('name')`, and put `requireAdmin` (`server/admin.ts`) on any new API route. A name not in the registry is hidden. Release it by deleting the line and its `useFeature` check in the same PR (an `'all'` line left for later is where parallel PRs conflict). Keep the lines in alphabetical order. Mention the feature's audience in the PR description and `feature-map.md`. Admin-only API routes still need `requireAdmin` whatever the rule above says.
- **Pull requests: never write the description by hand.** Run `node scripts/pr-body.mjs --what "<what and why, with the measurements or checks>" > body.md` and open the PR with `gh pr create --body-file body.md`. It fills `.github/pull_request_template.md` and ticks the Audience box from the diff (docs, tests, scripts, CI and config only: n/a; an added `'admin'` entry or `server/admin.ts`: Admin only; anything else: Everyone, per the rule above), so the "PR audience" check passes without the owner having to say who sees the change. Add `--audience na|admin|everyone` only when the owner says otherwise. If you edit the description later (`gh pr edit`), keep the template headings and exactly one ticked Audience box. Add the attribution line the session gives you to the end.
- Update `CHANGELOG.md` in the same PR as any change, and `DECISIONS.md` (plus a new ADR) when a decision is made.
- Project docs (backlog, ADRs, migration notes) live outside this repo in `DevHiveMind/Projects/iron-log/`.
