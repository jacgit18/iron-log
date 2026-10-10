# Iron Log

React 19 + Vite PWA, TypeScript, zustand store, Vitest and Playwright.

## Read first

In `DevHiveMind/iron-log/docs/`: `ROADMAP.md` (what to build, out of scope), `ARCHITECTURE.md` (where code lives), `DECISIONS.md` (ADR index; do not re-litigate), `CHANGELOG.md` (add an entry in each PR). `README.md` is in this repo. Before any UI change read the UX set in `docs/ux/`: `UX-DESIGN-BRIEF.md`, `USERFLOW.md`, `DESIGN-SYSTEM.md` (tokens live in `src/styles.css`), `COMPONENTS.md`, `SCREEN-SPECS.md`; update them in the same PR as a UI change.

## Language

- **Write all new code in TypeScript** (`.ts`/`.tsx`, `strict`). Do not add `.js` or `.jsx` files. Convert a legacy file when you touch it.
- Shared data types are in `src/types.ts`; store state and actions (`AppState`) and sheet form types are in `src/store/types.ts`. Add to these instead of redefining a shape in a file.
- Type props, handlers and form state. Avoid `any`; use `unknown` and narrow it. The only accepted loose spots are code that cleans untrusted JSON (`validate`, `normConfig`, `excelImport`, ...) and the host's db/connector handles.
- Still JavaScript on purpose: tests (`*.test.js`), `e2e/`, config files, `scripts/`, `tools/`, `fonts.js`, `App.jsx`, `main.jsx` and a few presentational components. Convert those only when you edit them.

## Checks (run all before a PR)

```
npm run typecheck && npm test && npm run lint && npm run build
npm run e2e        # before opening a PR
DATABASE_URL=postgres://ironlog:ironlog@127.0.0.1:5433/ironlog npm run e2e:sync   # after touching src/sync/, server/ or the store's startup
```

`e2e:sync` runs the app with syncing on against the real API and a scratch Postgres database it makes and drops (the local Docker one from
`npm run db:start` is fine); it refuses a server that is not on this machine. Syncing is behind a flag (`feature-flags.md`) and off by default.

## Conventions

- One change per commit. Do not change behavior inside a refactor or conversion commit.
- Board reorder and log write paths (`planFix`, `mutateChecks`, `autoLogs`, `addEntry`) must keep the existing tests green: no exercise may be lost or duplicated.
- Update `feature-map.md` (project docs) in the same PR as any feature or interaction change.
- Update `CHANGELOG.md` in the same PR as any change, and `DECISIONS.md` (plus a new ADR) when a decision is made.
- Project docs (backlog, ADRs, migration notes) live outside this repo in `DevHiveMind/iron-log/docs/`.
