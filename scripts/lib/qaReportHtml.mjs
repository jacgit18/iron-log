// Draws the QA results page (brief: qa-reporter-page) from the plain data `buildReport` returns (scripts/lib/qaReport.mjs). Pure: text in, text out.
// The result is an Artifact page body: a <title>, a <style>, the markup and a small <script> for the two filters. The Artifact tool wraps it in its own
// <!doctype html> skeleton, so it has none; `standalone()` adds one to open the same file straight in a browser.
// Nothing here reads a persona, an email or a file; every inserted string goes through `esc`.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KIND_LABEL = { fail: 'Fail', blocked: 'Blocked', proposed: 'Pass, proposed', confirmed: 'Pass, confirmed', notrun: 'Not run' };

/** Which filter bucket and pill a recorded row belongs to. */
const kindOf = r => (r.outcome === 'fail' ? 'fail' : r.outcome === 'blocked' ? 'blocked' : r.proposed ? 'proposed' : 'confirmed');

const tags = r => [
  r.device ? '<span class="tag tag-device" title="Needs a real phone; an agent can only try it emulated, and only you record the real result">phone</span>' : '',
  r.emulated ? '<span class="tag tag-device" title="An agent walked it in an emulated phone view, not on a real phone">emulated</span>' : '',
  r.edge ? '<span class="tag">edge</span>' : '',
  `<span class="tag tag-auto" title="How automation covers it">${esc(r.auto)}</span>`,
].join('');

function recordedRow(r) {
  const kind = kindOf(r);
  const who = r.emulated ? 'emulated by agent, not yet checked on your phone' : r.proposed ? 'agent result, awaiting your spot-check' : 'recorded by you';
  const label = r.emulated ? `Emulated ${r.outcome}` : KIND_LABEL[kind];
  const note = r.note ? `<p class="note" tabindex="0" role="button" aria-expanded="false">${esc(r.note)}</p>` : '<p class="note none">No note recorded. No screenshot recorded.</p>';
  return `<li class="row k-${kind}" data-kind="${kind}" data-feature="${esc(r.feature)}">
<div class="rowhead"><span class="pill p-${kind}">${label}</span><span class="id">${esc(r.id)}</span><span class="title">${esc(r.title)}</span></div>
<div class="meta"><span>${esc(r.feature)}</span><span>${esc(r.date)}</span><span>${who}${r.build ? `, build ${esc(r.build)}` : ''}</span>${tags(r)}</div>
${note}</li>`;
}

function notRunRow(r) {
  return `<li class="row k-notrun" data-kind="notrun" data-feature="${esc(r.feature)}">
<div class="rowhead"><span class="id">${esc(r.id)}</span><span class="title">${esc(r.title)}</span></div>
<div class="meta">${tags(r)}${r.agentRunnable ? '' : `<span class="owner-only">${r.device ? 'only you can check this on a phone' : 'only you can run this'}</span>`}</div></li>`;
}

const section = (key, title, hint, count, body, open, empty) => `<details class="sec" data-sec="${key}"${open ? ' open' : ''}>
<summary><h2>${esc(title)}</h2><span class="count">${count}</span></summary>
<p class="hint">${esc(hint)}</p>
${count ? body : `<p class="empty">${esc(empty)}</p>`}
</details>`;

function bar(t) {
  const parts = [['confirmed', t.confirmedPass], ['proposed', t.proposedPass], ['fail', t.fail], ['blocked', t.blocked], ['notrun', t.notRun]];
  const segs = parts.filter(([, n]) => n > 0).map(([k, n]) => `<span class="seg s-${k}" style="flex-grow:${n}" title="${KIND_LABEL[k]}: ${n}"></span>`).join('');
  return `<div class="bar" role="img" aria-label="${parts.map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}`).join(', ')}">${segs}</div>`;
}

/** The "Agent activity" block: plain facts about agent use, nothing about what an agent wrote. */
function activityBlock(a) {
  if (!a) return '';
  const when = d => (d ? esc(d.slice(0, 10)) : a.recorded ? 'never' : 'not recorded');
  return `<section class="activity" aria-labelledby="act-h"><h2 id="act-h">Agent activity</h2><ul class="facts">
<li>Last agent result <b>${a.lastRunnerResult ? esc(a.lastRunnerResult) : 'none yet'}</b></li>
<li>Last Runner start <b>${when(a.runnerLastRun)}</b>, Keeper <b>${when(a.keeperLastRun)}</b>, Reporter <b>${when(a.reporterLastRun)}</b></li>
<li>Entries recorded by an agent <b>${a.entriesBy.claude}</b>, by you <b>${a.entriesBy.owner}</b></li>
<li><b>${a.staleScenarios === null ? 'unknown' : a.staleScenarios}</b> scenarios with no result in ${a.staleDays} days</li>
</ul></section>`;
}

/** The nightly smoke block (CI evidence). `smoke` is `buildSmokeBlock`'s answer; undefined or unavailable shows one line. */
function smokeBlock(smoke) {
  const head = '<h2>Nightly smoke <span class="tag">CI evidence</span></h2>';
  const note = '<p class="hint">The Playwright smoke run by GitHub Actions. It is not a scenario result and is counted nowhere above.</p>';
  if (!smoke || !smoke.available) return `<section class="smoke" aria-label="Nightly smoke">${head}<p class="empty">Smoke status not available.</p></section>`;
  if (!smoke.last) return `<section class="smoke" aria-label="Nightly smoke">${head}${note}<p class="empty">No smoke run found.</p></section>`;
  const { last } = smoke;
  const when = esc(last.at.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC'));
  const pill = { passed: 'p-confirmed', failed: 'p-fail', running: 'p-proposed', cancelled: 'p-blocked' }[last.result];
  const link = last.url && last.url.startsWith('https://github.com/') ? ` <a href="${esc(last.url)}" rel="noreferrer">Open the latest run</a>` : '';
  return `<section class="smoke" aria-label="Nightly smoke">${head}${note}<p class="smokeline"><span class="pill ${pill}">${esc(last.result)}</span> Last run <b>${when}</b>.${link}</p><p class="smokeline">Last ${smoke.windowDays} days: <b>${smoke.runs}</b> runs, <b>${smoke.passed}</b> passed, <b>${smoke.failed}</b> failed.</p></section>`;
}

/** The page body for the Artifact tool. `opts.generatedOn` is `YYYY-MM-DD`; `opts.source` names the results file (a file name, not a path). `opts.smoke` is `buildSmokeBlock`'s answer. */
export function renderReport(report, opts = {}) {
  const { totals, device, recorded } = report;
  const t = { ...totals, proposedPass: report.proposed.length, confirmedPass: report.confirmed.length };
  const nothingRecorded = recorded === 0;
  const agent = report.awaitingSpotCheck;
  let lead = `${agent} of ${recorded} recorded results came from an agent and wait for your spot-check.`;
  if (nothingRecorded) lead = 'No result is recorded yet, so every scenario shows as not run.';
  else if (agent === 0) lead = `${recorded} results are recorded and you recorded all of them.`;
  else if (agent === recorded) lead = `All ${recorded} recorded results came from an agent and wait for your spot-check.`;

  const stat = (n, label, cls, kind) => `<button type="button" class="stat ${cls}" data-pick="${kind}"><span class="n">${n}</span><span class="l">${label}</span></button>`;
  const attention = report.attention.map(recordedRow).join('\n');
  // Phone-only scenarios have their own section, so the lists below leave them out (the counts above still include them).
  const proposedRows = report.proposed.filter(r => !r.device);
  const confirmedRows = report.confirmed.filter(r => !r.device);
  const notRunGroups = report.notRun.map(g => ({ feature: g.feature, rows: g.rows.filter(r => !r.device) })).filter(g => g.rows.length);
  const notRunCount = notRunGroups.reduce((n, g) => n + g.rows.length, 0);
  const proposed = proposedRows.map(recordedRow).join('\n');
  const confirmed = confirmedRows.map(recordedRow).join('\n');
  const group = (g, draw, open) => `<details class="grp" data-feature="${esc(g.feature)}"${open ? ' open' : ''}><summary>${esc(g.feature)} <span class="count">${g.rows.length}</span></summary><ul class="rows">${g.rows.map(draw).join('\n')}</ul></details>`;
  const notRun = notRunGroups.map(g => group(g, notRunRow, false)).join('\n');
  const phoneByFeature = [...new Set(report.phone.map(r => r.feature))].sort((a, b) => a.localeCompare(b)).map(feature => ({ feature, rows: report.phone.filter(r => r.feature === feature) }));
  const phoneRow = r => (r.state === 'not tried' ? notRunRow(r) : recordedRow(r));
  const phone = phoneByFeature.map(g => group(g, phoneRow, true)).join('\n');
  const featureOptions = report.features.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');

  return `<title>QA results</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap">
<style>
/* Layout: one calm column. Summary and the stacked bar first, then what needs attention, then proposals, confirmed, and last the scenarios nobody has run. */
:root {
  --bg: #f6f8f8; --surface: #ffffff; --fg: #17211f; --muted: #53625f; --line: #d9e2e0;
  --pass: #1d7a4d; --pass-bg: #e2f3ea; --fail: #b3261e; --fail-bg: #fbe5e3; --warn: #8a5a00; --warn-bg: #fbefd0;
  --prop: #3f4fb0; --prop-bg: #e6e9fa; --none: #6b7a77; --none-bg: #e9eeed; --accent: #0f6b66;
  --display: "Space Grotesk", system-ui, sans-serif; --body: "Inter", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0f1615; --surface: #172220; --fg: #e6efed; --muted: #9db0ac; --line: #2a3a37;
  --pass: #5fd49a; --pass-bg: #163a2a; --fail: #ff8b82; --fail-bg: #451f1c; --warn: #f0c261; --warn-bg: #3d3011;
  --prop: #a3aeff; --prop-bg: #262c57; --none: #9db0ac; --none-bg: #25312f; --accent: #5ed0c8; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #0f1615; --surface: #172220; --fg: #e6efed; --muted: #9db0ac; --line: #2a3a37;
  --pass: #5fd49a; --pass-bg: #163a2a; --fail: #ff8b82; --fail-bg: #451f1c; --warn: #f0c261; --warn-bg: #3d3011;
  --prop: #a3aeff; --prop-bg: #262c57; --none: #9db0ac; --none-bg: #25312f; --accent: #5ed0c8; color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font-family: var(--body); line-height: 1.5; font-size: 15px;
  padding-block: 24px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { max-width: 980px; margin-inline: auto; display: grid; gap: 20px; min-width: 0; }
h1, h2 { font-family: var(--display); text-wrap: balance; margin: 0; }
h1 { font-size: 1.9rem; line-height: 1.15; }
h2 { font-size: 1.15rem; }
.sub { color: var(--muted); margin: 4px 0 0; max-width: 65ch; }
.lead { font-weight: 500; margin: 0; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.stat { font: inherit; color: inherit; text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; cursor: pointer; display: grid; gap: 2px; }
.stat:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.stat .n { font-family: var(--display); font-size: 1.7rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat .l { color: var(--muted); font-size: 0.8rem; }
.stat.c-fail .n { color: var(--fail); } .stat.c-blocked .n { color: var(--warn); } .stat.c-confirmed .n { color: var(--pass); } .stat.c-proposed .n { color: var(--prop); }
.bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--none-bg); gap: 2px; }
.seg { min-width: 3px; }
.s-confirmed { background: var(--pass); } .s-proposed { background: var(--prop); } .s-fail { background: var(--fail); } .s-blocked { background: var(--warn); } .s-notrun { background: var(--none); opacity: 0.45; }
.facts { color: var(--muted); font-size: 0.85rem; display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; padding: 0; list-style: none; }
.activity { display: grid; gap: 6px; } .activity h2 { font-size: 1rem; }
.facts b { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
.filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; position: sticky; top: env(safe-area-inset-top, 0px); background: var(--bg); padding-block: 8px; z-index: 5; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.filters label { display: grid; gap: 2px; font-size: 0.75rem; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
select { font: inherit; font-size: 0.9rem; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; max-width: 100%; }
.showing { color: var(--muted); font-size: 0.85rem; margin-left: auto; }
.sec { border-top: 1px solid var(--line); padding-top: 12px; }
.sec > summary, .grp > summary { cursor: pointer; display: flex; align-items: baseline; gap: 10px; list-style: none; }
.sec > summary::-webkit-details-marker, .grp > summary::-webkit-details-marker { display: none; }
.sec > summary::before, .grp > summary::before { content: "\\25B8"; color: var(--muted); font-size: 0.8em; }
.sec[open] > summary::before, .grp[open] > summary::before { content: "\\25BE"; }
.count { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 0.85rem; background: var(--none-bg); border-radius: 999px; padding: 0 8px; }
.hint { color: var(--muted); font-size: 0.85rem; margin: 4px 0 10px; max-width: 70ch; }
.empty { margin: 8px 0; padding: 12px; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.grp { margin-top: 8px; } .grp > summary { font-weight: 500; padding-block: 4px; } .grp .rows { margin-top: 6px; }
.row { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; border-left-width: 4px; min-width: 0; }
.row.k-fail { border-left-color: var(--fail); } .row.k-blocked { border-left-color: var(--warn); } .row.k-proposed { border-left-color: var(--prop); } .row.k-confirmed { border-left-color: var(--pass); } .row.k-notrun { border-left-color: var(--line); }
.rowhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
.id { font-family: var(--display); font-weight: 700; font-variant-numeric: tabular-nums; }
.title { min-width: 0; overflow-wrap: anywhere; }
.pill { font-size: 0.72rem; font-weight: 600; border-radius: 999px; padding: 1px 8px; letter-spacing: 0.02em; }
.p-fail { background: var(--fail-bg); color: var(--fail); } .p-blocked { background: var(--warn-bg); color: var(--warn); }
.p-proposed { background: var(--prop-bg); color: var(--prop); border: 1px dashed var(--prop); } .p-confirmed { background: var(--pass-bg); color: var(--pass); }
.meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 0.78rem; color: var(--muted); margin-top: 2px; align-items: center; }
.tag { border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; font-size: 0.72rem; }
.tag-device { color: var(--warn); border-color: var(--warn); }
.owner-only { color: var(--warn); }
.note { margin: 6px 0 0; font-size: 0.88rem; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
.note.open { display: block; }
.note.none { color: var(--muted); cursor: default; font-style: italic; }
.smoke { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--surface); display: grid; gap: 4px; }
.smoke h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.smoke .hint, .smoke .empty { margin: 0; }
.smokeline { margin: 0; overflow-wrap: anywhere; }
.smokeline a { color: var(--accent); }
.foot { color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--line); padding-top: 12px; }
@media (prefers-reduced-motion: no-preference) { .stat { transition: border-color 0.15s; } .stat:hover { border-color: var(--accent); } }
</style>
<main>
<header>
<h1>QA results</h1>
<p class="sub">Latest recorded result for each live scenario${opts.generatedOn ? `, generated ${esc(opts.generatedOn)}` : ''}${opts.source ? ` from ${esc(opts.source)}` : ''}. A pass an agent recorded is a proposal until you spot-check it.</p>
</header>
<p class="lead">${esc(lead)}</p>
<div class="stats">
${stat(t.fail, 'Fail', 'c-fail', 'fail')}${stat(t.blocked, 'Blocked', 'c-blocked', 'blocked')}${stat(t.proposedPass, 'Pass, proposed', 'c-proposed', 'proposed')}${stat(t.confirmedPass, 'Pass, confirmed', 'c-confirmed', 'confirmed')}${stat(t.notRun, 'Not run', 'c-none', 'notrun')}
</div>
${bar(t)}
<ul class="facts">
<li><b>${totals.scenarios}</b> live scenarios</li>
<li><b>${report.awaitingSpotCheck}</b> results awaiting your spot-check</li>
<li><b>${device.total}</b> need a real phone (<b>${device.notTried}</b> not tried, <b>${device.emulated}</b> only emulated by an agent, <b>${device.ownerRecorded}</b> recorded by you)</li>
<li><b>${report.agentRunnableNotRun}</b> not-run scenarios an agent may try</li>
<li>Last result <b>${report.lastDate ? esc(report.lastDate) : 'none yet'}</b></li>
</ul>
${activityBlock(report.agentActivity)}
${smokeBlock(opts.smoke)}
<div class="filters">
<label for="f-kind">Show<select id="f-kind"><option value="all">Everything</option><option value="fail">Fail</option><option value="blocked">Blocked</option><option value="proposed">Pass, proposed</option><option value="confirmed">Pass, confirmed</option><option value="notrun">Not run</option></select></label>
<label for="f-feature">Feature<select id="f-feature"><option value="all">All features</option>${featureOptions}</select></label>
<span class="showing" id="showing" aria-live="polite"></span>
</div>
${section('attention', 'Needs attention', 'Failing or blocked, newest first. The note says what happened.', report.attention.length, `<ul class="rows">${attention}</ul>`, true, 'Nothing is failing or blocked.')}
${section('phone', 'Phone checklist', 'Scenarios that need a real phone, grouped by feature (a phone one that fails or is blocked is under Needs attention). An agent may try one in an emulated phone view; that is marked emulated and never counts as your phone check. Only your own result does, and you retest on your phone either way.', report.phone.length, phone, true, 'No scenario needs a real phone.')}
${section('proposed', 'Proposed by an agent', 'Passes an agent recorded. Spot-check a few, then record your own result to confirm it.', proposedRows.length, `<ul class="rows">${proposed}</ul>`, true, 'No agent pass is waiting for a spot-check.')}
${section('confirmed', 'Confirmed by you', 'Passes you recorded yourself.', confirmedRows.length, `<ul class="rows">${confirmed}</ul>`, true, 'You have not recorded a pass yet.')}
${section('notrun', 'Not run', 'No result recorded, grouped by feature (phone-only scenarios are in the Phone checklist). The tag shows how automation covers it.', notRunCount, notRun, false, 'Every live scenario that does not need a phone has a result.')}
<p class="foot">Read-only view of the recorded results. It never edits a result or a scenario. Persona accounts and emails are left out on purpose.</p>
</main>
<script>
(function () {
  var kind = document.getElementById('f-kind'), feat = document.getElementById('f-feature'), showing = document.getElementById('showing');
  var rows = [].slice.call(document.querySelectorAll('.row'));
  function apply() {
    var k = kind.value, f = feat.value, n = 0;
    rows.forEach(function (r) {
      var on = (k === 'all' || r.getAttribute('data-kind') === k) && (f === 'all' || r.getAttribute('data-feature') === f);
      r.hidden = !on; if (on) n++;
    });
    var filtering = k !== 'all' || f !== 'all';
    [].forEach.call(document.querySelectorAll('.grp'), function (g) {
      g.hidden = !g.querySelector('.row:not([hidden])');
      if (filtering && !g.hidden) g.open = true;
    });
    [].forEach.call(document.querySelectorAll('.sec'), function (s) {
      var has = s.querySelector('.row:not([hidden])'), had = s.querySelector('.row');
      s.hidden = filtering && !has && !!had;
      if (filtering && has) s.open = true; // a filter that picks rows shows them, even in a section that starts folded
    });
    showing.textContent = (k === 'all' && f === 'all') ? '' : 'Showing ' + n + ' of ' + rows.length;
  }
  kind.addEventListener('change', apply); feat.addEventListener('change', apply);
  [].forEach.call(document.querySelectorAll('.stat'), function (b) {
    b.addEventListener('click', function () {
      kind.value = b.getAttribute('data-pick'); apply();
      var sec = document.querySelector('.sec[data-sec="' + (kind.value === 'fail' || kind.value === 'blocked' ? 'attention' : kind.value) + '"]');
      if (sec) { sec.open = true; sec.scrollIntoView({ block: 'start' }); }
    });
  });
  [].forEach.call(document.querySelectorAll('.note:not(.none)'), function (p) {
    function toggle() { p.setAttribute('aria-expanded', String(p.classList.toggle('open'))); }
    p.addEventListener('click', toggle);
    p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  apply();
})();
</script>`;
}

/** The same body wrapped in a minimal document, to open the file straight in a browser. */
export const standalone = body => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n${body}\n</body></html>\n`;
