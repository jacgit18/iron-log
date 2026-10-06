# Iron Log

React 19 + Vite PWA, TypeScript, zustand store, Vitest and Playwright.

## Language

- **Write all new code in TypeScript** (`.ts`/`.tsx`, `strict`). Do not add `.js` or `.jsx` files. Convert a legacy file when you touch it.
- Shared data types are in `src/types.ts`; store state and actions (`AppState`) and sheet form types are in `src/store/types.ts`. Add to these instead of redefining a shape in a file.
- Type props, handlers and form state. Avoid `any`; use `unknown` and narrow it. The only accepted loose spots are code that cleans untrusted JSON (`validate`, `normConfig`, `excelImport`, ...) and the host's db/connector handles.
- Still JavaScript on purpose: tests (`*.test.js`), `e2e/`, config files, `scripts/`, `tools/`, `fonts.js`, `App.jsx`, `main.jsx` and a few presentational components. Convert those only when you edit them.

## Checks (run all before a PR)

```
npm run typecheck && npm test && npm run lint && npm run build
npm run e2e        # before opening a PR
```

## Conventions

- One change per commit. Do not change behavior inside a refactor or conversion commit.
- Board reorder and log write paths (`planFix`, `mutateChecks`, `autoLogs`, `addEntry`) must keep the existing tests green: no exercise may be lost or duplicated.
- Update `feature-map.md` (project docs) in the same PR as any feature or interaction change.
- Project docs (backlog, ADRs, migration notes) live outside this repo in `DevHiveMind/iron-log/docs/`.
