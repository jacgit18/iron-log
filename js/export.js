/* ---------- Excel export + GitHub backup ---------- */
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxPromise = null;
function loadXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(!xlsxPromise) xlsxPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script'); s.src = XLSX_URL; s.async = true;
    s.onload = ()=> window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel library failed to load'));
    s.onerror = ()=>{ xlsxPromise = null; reject(new Error('Excel library failed to load')); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

async function allWeeks(){
  if(!weekHist) await loadHistory();
  const w = {...(weekHist||{})}; w[weekKey()] = week;
  return w;
}
const phaseLabel = p => p ? PHASES[p].label : '';
const entryVolume = e => (e.sec || !(Number(e.w)>0) || !e.s || !e.r) ? '' : Number(e.w)*Number(e.s)*Number(e.r);
function weekOfDate(d){ return ymd(monday(parse(d))); }
function sheet(X, rows, widths){
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(w=>({wch:w}));
  if(rows.length>1) ws['!autofilter'] = {ref: X.utils.encode_range({s:{r:0,c:0}, e:{r:rows.length-1, c:rows[0].length-1}})};
  return ws;
}
function sessionRows(filter){
  const rows = [];
  Object.keys(logs).forEach(id=> (logs[id]||[]).forEach(e=>{ if(!filter || filter(e)) rows.push([e.d, e.wk||weekOfDate(e.d), exInfo(id).n, phaseLabel(e.ph), e.w??'', e.s??'', e.sec?'':(e.r??''), e.sec??'', entryVolume(e), e.n||'', e.slot||'']); }));
  rows.sort((a,b)=> a[0]===b[0] ? a[2].localeCompare(b[2]) : a[0].localeCompare(b[0]));
  return [['Date','Week of','Exercise','Phase','Weight (lb)','Sets','Reps','Hold (s)','Volume (lb)','Note','Program slot'], ...rows];
}
const SESSION_COLS = [11,11,34,13,11,6,6,9,12,30,14];

function buildOverallWorkbook(X, weeks){
  const wb = X.utils.book_new();
  // Summary
  const sum = [['Exercise','Latest phase','Sessions','First logged','Last logged','First weight (lb)','Latest weight (lb)','Best weight (lb)','Change (lb)','1RM (lb)']];
  Object.keys(logs).filter(id=>logs[id].length).sort((a,b)=>exInfo(a).n.localeCompare(exInfo(b).n)).forEach(id=>{
    const L = logs[id], last = L[L.length-1];
    const same = L.filter(e=>(e.ph||null)===(last.ph||null) && Number(e.w)>0);
    const ws = same.map(e=>Number(e.w));
    const first = ws.length ? ws[0] : '', latest = ws.length ? ws[ws.length-1] : '';
    sum.push([exInfo(id).n, phaseLabel(last.ph), L.length, L[0].d, last.d, first, latest, ws.length?Math.max(...ws):'', ws.length?latest-first:'', cfg.rm[id]??'']);
  });
  X.utils.book_append_sheet(wb, sheet(X, sum, [34,13,9,12,12,15,16,15,11,9]), 'Summary');
  X.utils.book_append_sheet(wb, sheet(X, sessionRows(), SESSION_COLS), 'Sessions');
  // Weeks
  const wk = [['Week of','Program','Days complete','Exercises done','Exercises planned','% done','Sessions logged']];
  Object.keys(weeks).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort().forEach(k=>{
    const r = weekSummary(k, weeks[k]); const n = Object.values(logs).reduce((a,L)=>a+L.filter(e=>(e.wk||weekOfDate(e.d))===k).length,0);
    if(r.ex || n) wk.push([k, r.pk, r.full, r.ex, r.total, r.total?Math.round(r.ex/r.total*100):0, n]);
  });
  X.utils.book_append_sheet(wb, sheet(X, wk, [12,9,14,15,17,8,15]), 'Weeks');
  // Settings
  const st = [['Setting','Value'], ['Mode', cfg.mode], ['Rest between sets (s)', cfg.rest??90]];
  PH_KEYS.forEach(p=> st.push([`${PHASES[p].label} % of 1RM`, cfg.pct[p]??PHASES[p].pct]));
  Object.keys(cfg.rm).sort().forEach(id=> st.push([`1RM: ${exInfo(id).n}`, cfg.rm[id]]));
  st.push(['Exported', new Date().toISOString()]);
  X.utils.book_append_sheet(wb, sheet(X, st, [34,24]), 'Settings');
  return wb;
}

function buildWeekWorkbook(X, key, w){
  const wb = X.utils.book_new();
  const r = weekSummary(key, w);
  const prog = PROGRAMS[r.pk]||PROGRAMS.A; const slots = slotsFor(prog);
  const n = sessionRows(e=>(e.wk||weekOfDate(e.d))===key);
  X.utils.book_append_sheet(wb, sheet(X, [
    ['Week of', key], ['Program', r.pk], ['Days complete', `${r.full} of 6`], ['Exercises done', `${r.ex} of ${r.total}`], ['Sessions logged', n.length-1]
  ], [18,14]), 'Summary');
  const plan = [['Planned day','Done on day','Section','Tier','Type','Exercise','Phase','Sets × reps','Program weight (lb)','Done']];
  slots.forEach(s=> s.items.forEach((it,idx)=>{
    const ph = (w.ph&&w.ph[`${s.id}:${idx}`]) ?? cfg.phDef[`${s.id}:${idx}`] ?? it.ph ?? null;
    const moved = w.moved && w.moved[s.id];
    plan.push([s.day, moved||s.day, s.sec||'', s.tier||'', s.type==='single'?'':s.type, exInfo(it.ex).n, phaseLabel(ph), rxOf(it, ph), it.w??(it.bw?'BW':''), (w.done&&w.done[s.id])?'Yes':'No']);
  }));
  X.utils.book_append_sheet(wb, sheet(X, plan, [11,11,11,10,9,34,13,16,18,6]), 'Plan');
  X.utils.book_append_sheet(wb, sheet(X, n, SESSION_COLS), 'Logged');
  return wb;
}

async function downloadExcel(which, btn){
  if(!dl) return;
  btn.disabled = true;
  try{
    const X = await loadXLSX(); const weeks = await allWeeks();
    const wb = which==='week' ? buildWeekWorkbook(X, weekKey(), week) : buildOverallWorkbook(X, weeks);
    const data = X.write(wb, {type:'array', bookType:'xlsx', compression:true});
    await dl.save({filename: which==='week' ? `iron-log-week-${weekKey()}.xlsx` : `iron-log-${ymd(new Date())}.xlsx`, data});
    flag('Exported');
  }catch(e){ const c = e && e.code; if(c==='declined'){} else if(c==='rate_limited') flag('A save prompt is already open'); else flag(e && e.message && !c ? e.message : 'Export isn’t available here'); }
  finally{ if(btn.isConnected) btn.disabled = false; }
}

/* GitHub backup through the viewer's Composio connector (Claude version only) */
const GH_SERVER = 'Composio For You';
const GH_TOOL = 'COMPOSIO_MULTI_EXECUTE_TOOL';
let mcp = undefined; // undefined = not checked, null = unavailable
async function initBackup(){
  try{ mcp = (window.claude && window.claude.use) ? await window.claude.use('mcp') : null; }catch(e){ mcp = null; }
  render();
}
const backupCfg = () => ({repo:'jacgit18/iron-log-data', branch:'main', hashes:{}, ...(cfg.backup||{})});
function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(36); }
function weekFingerprint(key, w){ const L = Object.keys(logs).sort().map(id=>[id, (logs[id]||[]).filter(e=>(e.wk||weekOfDate(e.d))===key)]); return hashStr(JSON.stringify([w.done, w.moved, w.ph, w.prog, L, PROGRAMS[weekSummary(key,w).pk]])); }
let backupBusy = false, backupMsg = null;
function backupError(e){
  const c = e && e.code;
  if(c==='server_not_connected' || c==='selection_required') return 'Add or pick the Composio connector in claude.ai Settings → Connectors, then try again.';
  if(c==='needs_reauth') return 'Reconnect Composio in claude.ai Settings → Connectors, then try again.';
  if(c==='not_in_manifest') return 'GitHub access isn’t allowed for this page. Allow the connector when asked, or turn it back on in the page’s connector settings.';
  if(c==='blocked_by_policy' || c==='approval_required') return 'Your organization’s settings block this connector here.';
  if(c==='server_unavailable' || c==='upstream_error' || c==='cancelled') return 'GitHub didn’t answer in time. The backup may still have gone through, so check the repo before trying again.';
  if(c==='not_granted' || c==='capability_disabled' || c==='capability_removed') return 'GitHub backup isn’t available in this view.';
  return (e && e.message) ? e.message : 'Backup failed.';
}
async function backupToGitHub(btn){
  if(!mcp || backupBusy) return;
  backupBusy = true; backupMsg = {kind:'info', text:'Building Excel files…'}; render();
  const b = backupCfg(); b.hashes = {...b.hashes}; const [owner, repo] = String(b.repo).split('/'); let sent = 0;
  try{
    if(!owner || !repo) throw new Error('Set the backup repo as owner/name in Settings.');
    const X = await loadXLSX(); const weeks = await allWeeks();
    const b64 = wb => X.write(wb, {type:'base64', bookType:'xlsx', compression:true});
    const upserts = [{path:'iron-log.xlsx', content:b64(buildOverallWorkbook(X, weeks)), encoding:'base64'}];
    const hashes = {...b.hashes}; const changed = [];
    Object.keys(weeks).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort().forEach(k=>{
      const w = weeks[k]; const r = weekSummary(k, w); const hasLogs = Object.values(logs).some(L=>L.some(e=>(e.wk||weekOfDate(e.d))===k));
      if(!r.ex && !hasLogs) return;
      const fp = weekFingerprint(k, w); if(hashes[k]===fp) return;
      upserts.push({path:`weeks/${k}.xlsx`, content:b64(buildWeekWorkbook(X, k, w)), encoding:'base64'}); hashes[k] = fp; changed.push(k);
    });
    // The connector accepts about 1 MB per call, so large first backups go in several commits.
    const batches = []; let cur = [], curSize = 0;
    upserts.forEach(u=>{ if(cur.length && curSize + u.content.length > 700000){ batches.push(cur); cur = []; curSize = 0; } cur.push(u); curSize += u.content.length; });
    if(cur.length) batches.push(cur);
    if(batches.some(bt=>bt.length===1 && bt[0].content.length > 950000)) throw new Error('One of the workbooks is too large to send. Ask Claude to split the backup.');
    const base = `Backup ${ymd(new Date())}: overall workbook${changed.length?` + ${changed.length} week file${changed.length>1?'s':''}`:''}`;
    let url = `https://github.com/${owner}/${repo}`;
    for(let i=0;i<batches.length;i++){
      backupMsg = {kind:'info', text:`Sending ${batches[i].length} file${batches[i].length>1?'s':''} to ${owner}/${repo}${batches.length>1?` (part ${i+1} of ${batches.length})`:''}…`}; render();
      const msg = batches.length>1 ? `${base} (part ${i+1} of ${batches.length})` : base;
      const res = await mcp.callTool(GH_SERVER, GH_TOOL, {tools:[{tool_slug:'GITHUB_COMMIT_MULTIPLE_FILES', arguments:{owner, repo, branch:b.branch||'main', message:msg, upserts:batches[i]}}], sync_response_to_workbench:false, thought:'Back up Iron Log training data to the private data repo.', current_step:'BACKUP'}, {cache:false});
      const p = res && res.payload; const r0 = p && p.data && p.data.results && p.data.results[0];
      const ok = r0 && r0.response && r0.response.successful;
      if(!ok){ const why = (r0 && (r0.error || (r0.response && r0.response.error))) || (p && p.error) || 'GitHub rejected the backup.'; throw new Error((typeof why==='string' ? why.slice(0,300) : 'GitHub rejected the backup.') + (sent?` (${sent} file${sent>1?'s were':' was'} saved before this.)`:'')); }
      const d = r0.response.data || {}; url = d.commit_url || (d.commit && d.commit.html_url) || url;
      sent += batches[i].length;
      // record progress so a retry skips weeks that already went through
      batches[i].forEach(u=>{ const m = u.path.match(/^weeks\/(.+)\.xlsx$/); if(m) b.hashes[m[1]] = hashes[m[1]]; });
    }
    cfg.backup = {...b, hashes, last:{at:new Date().toISOString(), url, files:upserts.length}}; saveCfg();
    backupMsg = {kind:'ok', text:`Backed up ${upserts.length} file${upserts.length>1?'s':''}.`, url};
  }catch(e){ backupMsg = {kind:'err', text: backupError(e)}; if(sent){ cfg.backup = {...b}; saveCfg(); } }
  finally{ backupBusy = false; render(); }
}
function daysSinceBackup(){ const l = cfg.backup && cfg.backup.last; if(!l) return null; return Math.floor((Date.now() - new Date(l.at).getTime())/864e5); }
function backupPanel(){
  const b = backupCfg(); const l = b.last;
  let h = `<section class="panel"><h2>Excel &amp; backups</h2><p><b>iron-log.xlsx</b> has a summary per exercise, every session, weekly totals and your settings. Each week also gets its own workbook with the plan and what you logged${mcp?', saved in <b>weeks/</b> when you back up to GitHub':''}.</p>`;
  h += `<div class="actions" style="justify-content:flex-start">${dl?'<button class="btn" data-act="xlsx" data-w="all">Download Excel</button><button class="btn" data-act="xlsx" data-w="week">Download this week</button>':''}</div>`;
  if(mcp){
    h += `<label class="field">Backup repo (owner/name)<input id="bk-repo" data-act="bkrepo" value="${esc(b.repo)}" placeholder="owner/repo"></label>`;
    h += `<div class="actions" style="justify-content:flex-start"><button class="btn primary" data-act="backup" ${backupBusy?'disabled':''}>${backupBusy?'Backing up…':'Back up to GitHub'}</button></div>`;
    h += `<p class="note">${l?`Last backup ${fmtShort(new Date(l.at))} · ${l.files} file${l.files>1?'s':''} · <a href="${esc(l.url)}" target="_blank" rel="noopener">view on GitHub</a>`:'No backups yet.'} Uses your Composio GitHub connection. Only weeks that changed are sent again.</p>`;
  } else if(mcp===null && window.claude){
    h += `<p class="note">GitHub backup needs the Composio connector, which isn't available in this view.</p>`;
  }
  if(backupMsg) h += `<p class="bkmsg ${backupMsg.kind}">${esc(backupMsg.text)}${backupMsg.url?` <a href="${esc(backupMsg.url)}" target="_blank" rel="noopener">View commit</a>`:''}</p>`;
  return h + `</section>`;
}
