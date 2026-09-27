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
function muscleNames(id, role){ const t = tagsOf(id); if(!t || t.mob) return t && t.mob ? (role==='p' ? 'Mobility' : '') : ''; return (t[role]||[]).map(m=>MUSCLES[m] ? MUSCLES[m].n : m).join(', '); }
function sessionRows(filter){
  const rows = [];
  Object.keys(logs).forEach(id=> (logs[id]||[]).forEach(e=>{ if(!filter || filter(e)) rows.push([e.d, e.wk||weekOfDate(e.d), exInfo(id).n, phaseLabel(e.ph), e.w??'', e.s??'', e.sec?'':(e.r??''), e.sec??'', entryVolume(e), muscleNames(id,'p'), muscleNames(id,'s'), e.n||'', e.slot||'']); }));
  rows.sort((a,b)=> a[0]===b[0] ? a[2].localeCompare(b[2]) : a[0].localeCompare(b[0]));
  return [['Date','Week of','Exercise','Phase','Weight (lb)','Sets','Reps','Hold (s)','Volume (lb)','Primary muscles','Secondary muscles','Note','Program slot'], ...rows];
}
const SESSION_COLS = [11,11,34,13,11,6,6,9,12,28,28,30,14];

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
  // Muscles: logged sets per muscle per week (secondary work counts half)
  const mv = {};
  Object.keys(logs).forEach(id=>{ const t = tagsOf(id); if(!t || t.mob) return; (logs[id]||[]).forEach(e=>{ const k = e.wk||weekOfDate(e.d); const sets = Number(e.s)||0; if(!sets) return;
    [['p',1],['s',0.5]].forEach(([role,f])=> (t[role]||[]).forEach(m=>{ const key = k+'|'+m; const r = mv[key] = mv[key] || {k, m, p:0, s:0}; r[role] += sets; })); }); });
  const mus = [['Week of','Muscle','Primary sets','Secondary sets','Weighted sets']];
  Object.values(mv).sort((a,b)=> a.k===b.k ? (b.p+b.s/2)-(a.p+a.s/2) : a.k.localeCompare(b.k)).forEach(r=> mus.push([r.k, MUSCLES[r.m] ? MUSCLES[r.m].n : r.m, r.p, r.s, r.p + r.s/2]));
  X.utils.book_append_sheet(wb, sheet(X, mus, [12,24,13,15,14]), 'Muscles');
  // Weeks
  const wk = [['Week of','Program','Days complete','Exercises done','Exercises planned','Skipped','% done','Sessions logged']];
  Object.keys(weeks).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort().forEach(k=>{
    const r = weekSummary(k, weeks[k]); const n = Object.values(logs).reduce((a,L)=>a+L.filter(e=>(e.wk||weekOfDate(e.d))===k).length,0);
    if(r.ex || n || r.skipped) wk.push([k, r.pk, r.full, r.ex, r.total, r.skipped, r.total?Math.round(r.ex/r.total*100):0, n]);
  });
  X.utils.book_append_sheet(wb, sheet(X, wk, [12,9,14,15,17,9,8,15]), 'Weeks');
  // Body weight
  const bwl = bwSorted(); const bws = [['Week of','Date','Body weight (lb)','Change (lb)']];
  bwl.forEach((e,i)=> bws.push([e.wk, e.d, e.w, i ? Math.round((e.w - bwl[i-1].w)*10)/10 : '']));
  X.utils.book_append_sheet(wb, sheet(X, bws, [12,12,17,12]), 'Body weight');
  // Settings
  const st = [['Setting','Value'], ['Mode', cfg.mode], ['Rest between sets (s)', cfg.rest??90], ['Program A name', progName('A')], ['Program B name', progName('B')]];
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
    ['Week of', key], ['Program', r.pk], ['Days complete', `${r.full} of 6`], ['Exercises done', `${r.ex} of ${r.total}`], ['Skipped', r.skipped], ['Sessions logged', n.length-1]
  ], [18,14]), 'Summary');
  const plan = [['Planned day','Done on day','Section','Tier','Type','Exercise','Phase','Sets × reps','Program weight (lb)','Done']];
  slots.forEach(s=> s.items.forEach((it,idx)=>{
    const ph = (w.ph&&w.ph[`${s.id}:${idx}`]) ?? cfg.phDef[`${s.id}:${idx}`] ?? it.ph ?? null;
    const moved = w.moved && w.moved[s.id];
    plan.push([s.day, moved||s.day, s.sec||'', s.tier||'', s.type==='single'?'':s.type, exInfo(it.ex).n, phaseLabel(ph), rxOf(it, ph), it.w??(it.bw?'BW':''), (w.skipped&&w.skipped[s.id])?'Skipped':(w.done&&w.done[s.id])?'Yes':'No']);
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
function weekFingerprint(key, w){ const L = Object.keys(logs).sort().map(id=>[id, (logs[id]||[]).filter(e=>(e.wk||weekOfDate(e.d))===key)]); return hashStr(JSON.stringify([w.done, w.skipped, w.moved, w.ph, w.prog, L, PROGRAMS[weekSummary(key,w).pk]])); }
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
    const upserts = [{path:'iron-log.xlsx', content:b64(buildOverallWorkbook(X, weeks)), encoding:'base64'}, {path:'iron-log-data.json', content:utf8b64(JSON.stringify(await buildDataFile(), null, 1)), encoding:'base64'}];
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
    const base = `Backup ${ymd(new Date())}: overall workbook + data file${changed.length?` + ${changed.length} week file${changed.length>1?'s':''}`:''}`;
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

/* ---------- Full data export / import (JSON) ---------- */
const DATA_FORMAT = 1;
let importDraft = null, importBusy = false;
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
function utf8b64(s){ const b = new TextEncoder().encode(s); let bin = ''; for(let i=0;i<b.length;i+=0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i+0x8000)); return btoa(bin); }
async function buildDataFile(){
  const weeks = await allWeeks(); const W = {};
  Object.keys(weeks).filter(k=>WEEK_RE.test(k)).sort().forEach(k=>{ const w = normWeek(weeks[k]); if(w.prog || [w.done,w.skipped,w.moved,w.ph,w.warm].some(o=>Object.keys(o).length)) W[k] = w; });
  const P = {}; ['A','B'].forEach(k=>{ if(PROGRAMS[k] !== BUILTIN[k]) P[k] = progBody(PROGRAMS[k]); });
  const L = {}; Object.keys(logs).sort().forEach(id=>{ if(logs[id] && logs[id].length) L[id] = logs[id]; });
  return {app:'iron-log', format:DATA_FORMAT, exportedAt:new Date().toISOString(), config:structuredClone(cfg), programs:P, library:structuredClone(library), logs:L, weeks:W, body:bwSorted()};
}
async function downloadData(btn){
  if(!dl) return; if(btn) btn.disabled = true;
  try{ const d = await buildDataFile(); await dl.save({filename:`iron-log-data-${ymd(new Date())}.json`, data:JSON.stringify(d, null, 1)}); flag('Exported'); }
  catch(e){ const c = e && e.code; if(c==='declined'){} else if(c==='rate_limited') flag('A save prompt is already open'); else flag('Export failed'); }
  finally{ if(btn) btn.disabled = false; }
}
function dataStats(d){
  const L = Object.values(d.logs||{}); const sets = L.reduce((a,l)=>a+l.length,0);
  return {entries:sets, exercises:L.filter(l=>l.length).length, weeks:Object.keys(d.weeks||{}).length, programs:Object.keys(d.programs||{}), saved:(d.library||[]).length, body:(d.body||[]).length};
}
function parseDataFile(text){
  let d; try{ d = JSON.parse(text); }catch(e){ throw new Error('That file isn’t valid JSON.'); }
  if(!d || d.app!=='iron-log') throw new Error('That isn’t an Iron Log data file.');
  if(!(d.format>=1)) throw new Error('Unknown file format.');
  if(d.format > DATA_FORMAT) throw new Error('This file is from a newer version of Iron Log. Update the app first.');
  const out = {exportedAt:d.exportedAt, config:(d.config&&typeof d.config==='object')?d.config:{}, programs:{}, library:[], logs:{}, weeks:{}, body:[]};
  (Array.isArray(d.body)?d.body:[]).forEach(e=>{ if(e && WEEK_RE.test(e.wk) && typeof e.d==='string' && Number(e.w)>0 && !out.body.some(x=>x.wk===e.wk)) out.body.push({wk:e.wk, d:e.d, w:Number(e.w)}); });
  ['A','B'].forEach(k=>{ const p = d.programs&&d.programs[k]; if(p && Array.isArray(p.days) && p.days.length===6) out.programs[k] = p; });
  (Array.isArray(d.library)?d.library:[]).forEach(it=>{ if(it && it.id && it.prog && Array.isArray(it.prog.days) && it.prog.days.length===6) out.library.push(it); });
  Object.entries(d.logs||{}).forEach(([id,l])=>{ if(/^[\w.~:@+-]{1,200}$/.test(id) && Array.isArray(l)){ const ok = l.filter(e=>e && typeof e.d==='string'); if(ok.length) out.logs[id] = ok; } });
  Object.entries(d.weeks||{}).forEach(([k,w])=>{ if(WEEK_RE.test(k) && w && typeof w==='object') out.weeks[k] = normWeek(w); });
  return out;
}
async function readImportFile(file){
  if(!file) return;
  try{ const text = await file.text(); importDraft = {data:parseDataFile(text), name:file.name}; renderImportSheet(); }
  catch(e){ importDraft = null; flag(e.message||'Couldn’t read that file'); }
}
function renderImportSheet(){
  const d = importDraft.data; const s = dataStats(d); const cur = dataStats({logs, weeks:weekHist||{}, library});
  const when = d.exportedAt ? libDate(d.exportedAt) : 'an unknown date';
  document.getElementById('modal').innerHTML = `<div class="scrim" data-act="close"><div class="sheet" role="dialog" aria-label="Import data">
    <h2 class="cond">Import data</h2>
    <p><b>${esc(importDraft.name||'File')}</b>, exported ${esc(when)}:</p>
    <ul class="implist"><li>${s.entries} logged session${s.entries===1?'':'s'} across ${s.exercises} exercise${s.exercises===1?'':'s'}</li><li>${s.weeks} week${s.weeks===1?'':'s'} of check-offs</li><li>${s.programs.length?`Edited Program ${s.programs.join(' and ')}`:'Original programs'}${s.saved?` · ${s.saved} saved version${s.saved===1?'':'s'}`:''}</li>${s.body?`<li>${s.body} body weight entr${s.body===1?'y':'ies'}</li>`:''}<li>Settings, 1RMs and muscle tags</li></ul>
    <p class="note"><b>Add to my data</b> keeps everything here and adds what's missing: new sessions, weeks, body weights and saved versions. If both have an edited program, yours stays and the file's is added to Saved versions.</p>
    <p class="note"><b>Replace my data</b> makes this app match the file exactly. Anything here that isn't in the file is deleted${cur.entries?`, including ${cur.entries} logged session${cur.entries===1?'':'s'}`:''}. ${dl?'Export your current data first if you might want it back.':''}</p>
    ${importBusy?'<p class="note">Importing…</p>':''}
    ${dl?'<div class="actions" style="justify-content:flex-start"><button type="button" class="btn sm ghost" data-act="dataexp">Export current data first</button></div>':''}
    <div class="actions impact"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn" data-act="impreplace" ${importBusy?'disabled':''}>Replace my data</button><button type="button" class="btn primary" data-act="impmerge" ${importBusy?'disabled':''}>Add to my data</button></div>
  </div></div>`;
}
function mergeEntries(a, b){ const seen = new Set(a.map(e=>JSON.stringify(e))); const out = [...a]; b.forEach(e=>{ const k = JSON.stringify(e); if(!seen.has(k)){ seen.add(k); out.push(e); } }); return out.sort((x,y)=>x.d.localeCompare(y.d)); }
function mergeWeek(a, b){
  const w = normWeek(a); const o = normWeek(b);
  w.prog = w.prog || o.prog;
  ['moved','ph'].forEach(k=>{ w[k] = {...o[k], ...w[k]}; });
  Object.keys(o.warm).forEach(d=>{ w.warm[d] = {...o.warm[d], ...(w.warm[d]||{})}; });
  w.done = {...o.done, ...w.done}; w.skipped = {...o.skipped, ...w.skipped}; Object.keys(w.done).forEach(id=>delete w.skipped[id]);
  return w;
}
async function applyImport(mode){
  if(!importDraft || importBusy) return;
  importBusy = true; renderImportSheet();
  try{
    const d = importDraft.data; const today = libDate(new Date().toISOString());
    const localWeeks = await allWeeks();
    if(mode==='replace'){
      cfg = {...structuredClone(DEFAULT_CFG), ...structuredClone(d.config), backup: d.config.backup || cfg.backup}; if(!cfg.backup) delete cfg.backup; saveCfg();
      ['A','B'].forEach(k=>{ if(d.programs[k]) saveProgram(k, structuredClone(d.programs[k])); else if(PROGRAMS[k] !== BUILTIN[k]){ PROGRAMS[k] = BUILTIN[k]; removeDoc('programs/'+k); } });
      library = structuredClone(d.library); saveLibrary();
      body = structuredClone(d.body); saveBody();
      Object.keys(logs).forEach(id=>{ if(!d.logs[id]){ delete logs[id]; removeDoc('logs/'+id); } });
      Object.entries(d.logs).forEach(([id,l])=>{ logs[id] = structuredClone(l); saveLog(id); });
      Object.keys(localWeeks).forEach(k=>{ if(WEEK_RE.test(k) && !d.weeks[k]) removeDoc('weeks/'+k); });
      Object.entries(d.weeks).forEach(([k,w])=>{ if(k===weekKey()) return; save('weeks/'+k, w); });
      week = normWeek(d.weeks[weekKey()]); saveWeek();
    } else {
      const C = d.config; let ch = false;
      ['rm','phDef','ex','muscleMap','rxOverride','progNames'].forEach(k=>{ const src = C[k]; if(src && typeof src==='object'){ cfg[k] = cfg[k]||{}; Object.keys(src).forEach(x=>{ if(cfg[k][x]==null){ cfg[k][x] = structuredClone(src[x]); ch = true; } }); } });
      if(ch) saveCfg();
      const lib = [...library]; const have = new Set(lib.map(it=>it.id));
      d.library.forEach(it=>{ if(!have.has(it.id)){ lib.push(structuredClone(it)); have.add(it.id); } });
      ['A','B'].forEach(k=>{ const p = d.programs[k]; if(!p) return;
        if(PROGRAMS[k] === BUILTIN[k]) saveProgram(k, structuredClone(p));
        else if(!sameProg(PROGRAMS[k], p) && !lib.some(it=>sameProg(it.prog, p))) lib.push({id:Date.now().toString(36)+k+Math.random().toString(36).slice(2,6), name:`${progName(k)} from import · ${today}`, from:k, at:new Date().toISOString(), prog:progBody(p)}); });
      if(lib.length !== library.length){ library = lib; saveLibrary(); }
      const addB = d.body.filter(e=>!body.some(x=>x.wk===e.wk)); if(addB.length){ body = [...body, ...addB].sort((a,b)=>a.wk.localeCompare(b.wk)); saveBody(); }
      Object.entries(d.logs).forEach(([id,l])=>{ const m = mergeEntries(logs[id]||[], l); if(m.length !== (logs[id]||[]).length){ logs[id] = m; saveLog(id); } });
      Object.entries(d.weeks).forEach(([k,w])=>{
        if(k===weekKey()){ const m = mergeWeek(week, w); if(JSON.stringify(m)!==JSON.stringify(normWeek(week))){ week = m; saveWeek(); } return; }
        const m = localWeeks[k] ? mergeWeek(localWeeks[k], w) : w; if(!localWeeks[k] || JSON.stringify(m)!==JSON.stringify(normWeek(localWeeks[k]))) save('weeks/'+k, m);
      });
    }
    weekHist = null; importDraft = null; importBusy = false; closeModal(); render(); flag(mode==='replace'?'Data replaced':'Data added');
  }catch(e){ importBusy = false; flag('Import failed'); renderImportSheet(); }
}
function dataPanel(){
  let h = `<section class="panel"><h2>Export &amp; import</h2><p>One file with everything: your log, weekly check-offs, body weight, programs, saved versions and settings. Use it to keep a copy, move to another device or app, or go back to an earlier state.</p>`;
  h += `<div class="actions" style="justify-content:flex-start">${dl?'<button class="btn primary" data-act="dataexp">Export all data</button>':''}<label class="btn filebtn">Import from file<input type="file" id="imp-file" accept=".json,application/json" hidden></label></div>`;
  h += `<details class="imppaste"><summary>Can't pick a file? Paste its contents instead</summary><textarea id="imp-text" rows="4" placeholder="Paste the contents of an iron-log-data file"></textarea><div class="actions" style="justify-content:flex-start"><button class="btn sm" data-act="imppaste">Review import</button></div></details>`;
  return h + `</section>`;
}
