# Setting up Iron Log on a new computer

## 1. The repo (everything the project enforces comes with the clone)

```bash
git clone https://github.com/jacgit18/iron-log.git
cd iron-log
scripts/bootstrap.sh
```

`scripts/bootstrap.sh` checks the tools (git, Node 22.12+, `gh`, Docker), runs `npm ci`, turns on the git hooks, installs the test browser and starts the local Postgres. It prints a `TODO` line for anything it cannot do. Run it again after fixing them.

What the clone already carries: `CLAUDE.md` (the rules for agents), the PR template and the checks that read it (`pr-audience`, `pr-changelog`), `scripts/pr-body.mjs` (writes the PR description), `scripts/check.mjs` (runs the checks that fit what changed), `scripts/lighthouse.mjs` (Lighthouse with floors), and `.githooks/pre-push`.

Daily use:

| Step | Command |
|---|---|
| Before pushing (the hook does this) | `npm run check` |
| UI, style, font, image or bundle change | `node scripts/lighthouse.mjs --check` |
| Open a PR | `node scripts/pr-body.mjs --what "..." > body.md`, then `gh pr create --body-file body.md` |
| Skip the hook once | `SKIP_CHECK=1 git push` |

## 2. What is not in the repo

| Thing | On a new computer |
|---|---|
| The owner's Claude global rules (`~/.claude/CLAUDE.md`) | Copy that file by hand; it holds the PR-description and Lighthouse rules for every project. |
| Reusable skills and rules (the owner's separate skills repository, linked from `~/.claude/skills/`) | Clone that repository anywhere and re-create the links; they hold absolute paths. |
| Project docs (ADRs, roadmap, changelog, UX docs; the owner's separate docs vault) | Clone the vault and point the "Project docs root" in the global rules at it. |
| Claude's memory for this project (`~/.claude/projects/<path>/memory/`) | Copy the folder, or let it rebuild from the repo and the docs. |
| Secrets: `.env`, `gcloud` and `gh` sign-ins, connector sign-ins | Create or sign in again. Never copy them through chat or git. |

## 3. A work computer

- Check company policy before installing Claude Code or Docker, or signing in to a personal GitHub account.
- Keep personal and work separate: do not copy the personal docs vault, memory folder, `.env` or personal connector sign-ins to a work machine. Copy only the generic rules into that machine's `~/.claude/CLAUDE.md`.
- For a work repo, reuse the two kits from the owner's skills repository instead of the personal paths: `.claude/skills/commit-and-push/pr-kit/` (PR template, checks and `pr-body.mjs`; its README says what to adapt) and `.claude/skills/web-vitals-audit/lighthouse.mjs` (set its floors to that project's current scores first).
