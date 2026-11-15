// The data behind the QA results page (brief: qa-reporter-page). A pure function: scenarios, automation tags and recorded results in, plain data out
// (counts and sorted groups). No file reading and no HTML here; scripts/lib/qaReportHtml.mjs draws it and scripts/qa-report.mjs loads the real data.
// "Latest entry per scenario wins" is not re-implemented: it is `latestById` from server/qa/scenarioResults.ts, the rule the scenarios page uses.
import { latestById, latestEmulatedById } from '../../server/qa/scenarioResults.ts';

const idNumber = id => Number(id.slice(2));
const byId = (a, b) => idNumber(a.id) - idNumber(b.id);
/** Newest date first, then id. */
const byDateThenId = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : byId(a, b));
const OUTCOME_ORDER = { fail: 0, blocked: 1 };
/** A note is free text written by a person or an agent and sometimes quotes a test account's address (`name@qa.invalid`, or masked `n***@qa.invalid`). The page shows none. */
const redact = text => text.replace(/[\w.*+-]+@[\w-]+(\.[\w-]+)+/g, '[email]').replace(/\b(?:[\w-]+\.)+invalid\b/gi, '[test domain]').replace(/\s+/g, ' ').trim();

/**
 * @param scenarios every scenario (retired ones are left out of everything)
 * @param automationOf id -> `{ auto }` or undefined (untagged)
 * @param results result entries as recorded (any order, any number per id)
 * @returns totals, owner-facing counts and four sorted sections: `attention` (latest result fail or blocked, whoever recorded it), `proposed` (passes an agent
 * recorded, waiting for the owner's spot-check), `confirmed` (passes the owner recorded) and `notRun` (grouped by feature).
 */
export function buildReport(scenarios, automationOf, results) {
  const live = scenarios.filter(s => !s.retired);
  const latest = latestById(results); // real results only: an emulated phone run never stands in for one
  const emulatedLatest = latestEmulatedById(results);
  const attention = [];
  const proposed = [];
  const confirmed = [];
  const notRun = new Map();
  let lastDate = null;
  let agentRecorded = 0;
  const device = { total: 0, notTried: 0, emulated: 0, ownerRecorded: 0 };
  const emulatedRows = new Map(); // phone scenarios whose latest agent run was emulated, with no real result of their own

  for (const s of live) {
    const auto = automationOf(s.id)?.auto ?? 'untagged';
    const base = { id: s.id, title: redact(s.title), feature: s.feature, device: Boolean(s.device), edge: Boolean(s.edge), auto };
    const e = latest.get(s.id);
    if (s.device) device.total += 1;
    const m = s.device ? emulatedLatest.get(s.id) : undefined;
    const emRow = m && { ...base, outcome: m.outcome, date: m.date, by: m.by, proposed: true, emulated: true, build: m.build ?? null, note: redact(m.note ?? '') };
    if (!e) {
      if (emRow) { device.emulated += 1; emulatedRows.set(s.id, emRow); } else if (s.device) device.notTried += 1;
      // An emulated fail or blocked on a phone nobody has tried: shown under attention, tagged emulated; it is not a failing real result, so no count includes it.
      if (emRow && emRow.outcome !== 'pass') attention.push(emRow);
      if (!notRun.has(s.feature)) notRun.set(s.feature, []);
      // An agent can only try a phone scenario emulated (never a real phone result), so it stays out of the agent-runnable count: only the owner records the real one.
      notRun.get(s.feature).push({ ...base, agentRunnable: !s.device });
      continue;
    }
    const row = { ...base, outcome: e.outcome, date: e.date, by: e.by, proposed: e.by === 'claude', build: e.build ?? null, note: redact(e.note ?? '') };
    if (e.by === 'claude') agentRecorded += 1;
    if (s.device && e.by === 'owner') device.ownerRecorded += 1;
    if (!lastDate || e.date > lastDate) lastDate = e.date;
    if (e.outcome !== 'pass') attention.push(row);
    else if (e.by === 'claude') proposed.push(row);
    else confirmed.push(row);
    // The owner's pass stays the phone state, but an emulated fail or blocked recorded after it is a possible regression: shown under attention too.
    // Strictly later: on the same day the owner's pass wins, a tie is deliberate (the owner's phone result stands).
    if (emRow && emRow.outcome !== 'pass' && e.outcome === 'pass' && emRow.date > e.date) attention.push(emRow);
  }

  attention.sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] || byDateThenId(a, b));
  proposed.sort(byDateThenId);
  confirmed.sort(byDateThenId);
  const notRunGroups = [...notRun.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([feature, rows]) => ({ feature, rows: rows.sort(byId) }));
  // The phone checklist: every live phone-only scenario that is not failing or blocked (those stay in `attention`, tagged phone), not-tried ones first.
  const phone = [
    ...notRunGroups.flatMap(g => g.rows.filter(r => r.device && !emulatedRows.has(r.id)).map(r => ({ ...r, state: 'not tried' }))),
    ...[...emulatedRows.values()].sort(byId).map(r => ({ ...r, agentRunnable: false, state: `emulated ${r.outcome === 'pass' ? 'pass' : r.outcome === 'fail' ? 'fail' : 'blocked'}` })),
    ...[...confirmed, ...proposed].filter(r => r.device).map(r => ({ ...r, state: r.proposed ? 'passed, proposed' : 'passed, confirmed' })),
  ];
  const notRunCount = notRunGroups.reduce((n, g) => n + g.rows.length, 0);
  const count = o => attention.filter(r => r.outcome === o && !r.emulated).length;

  const totals = { scenarios: live.length, pass: proposed.length + confirmed.length, fail: count('fail'), blocked: count('blocked'), notRun: notRunCount };
  const features = [...new Set(live.map(s => s.feature))].sort((a, b) => a.localeCompare(b));
  return {
    totals,
    /** Scenarios with a recorded result (pass + fail + blocked); outside `totals` so that object keeps its shape. */
    recorded: totals.pass + totals.fail + totals.blocked,
    /** Results an agent recorded (any outcome) that the owner has not replaced with a result of their own. */
    awaitingSpotCheck: agentRecorded,
    device,
    /** Not-run scenarios an agent may record a real result for: everything that is not phone-only (a phone one can only be tried emulated). */
    agentRunnableNotRun: notRunGroups.reduce((n, g) => n + g.rows.filter(r => r.agentRunnable).length, 0),
    lastDate,
    features,
    attention,
    /** Phone-only scenarios not failing or blocked, each with a `state`; the renderer lists them in their own section and leaves them out of the others. */
    phone,
    proposed,
    confirmed,
    notRun: notRunGroups,
  };
}
