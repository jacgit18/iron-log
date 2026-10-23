#!/bin/sh
# `npm run coverage` (ADR 069): the whole suite with coverage, then the per-area report and the unloaded-file caps. Arguments are forwarded to
# vitest (npm run coverage -- --maxWorkers=4); a filtered run measures less, so its floors will fail. The report runs even when a floor failed,
# so the failing run still prints the table; it is skipped only when vitest wrote no summary because tests failed. When vitest passed, a missing
# summary makes the report fail (never a silent pass). The first failing exit code is kept.
vitest run --coverage "$@"
s=$?
if [ "$s" -ne 0 ] && [ ! -f coverage/coverage-summary.json ]; then exit "$s"; fi
node scripts/coverage-report.mjs --check || [ "$s" -ne 0 ] || s=1
exit "$s"
