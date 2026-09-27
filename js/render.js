/* ---------- Render ---------- */
function render(){
  const progKey = activeProgKey();
  const prog = PROGRAMS[progKey] || PROGRAMS.A;
  document.getElementById('progPill').textContent = progName(progKey);
  document.getElementById('modePill').textContent = `Mode ${cfg.mode}`;
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===tab)));
  const v = document.getElementById('view');
  const bd = v.querySelector('.board'); const sl = bd ? bd.scrollLeft : 0;
  const fid = document.activeElement && v.contains(document.activeElement) ? document.activeElement.id : null;
  if(tab==='board') v.innerHTML = renderBoard(progKey, prog);
  else if(tab==='progress') v.innerHTML = renderProgress();
  else if(tab==='program') v.innerHTML = renderEditor();
  else if(tab==='body') v.innerHTML = renderBody();
  else v.innerHTML = renderSettings();
  const nb = v.querySelector('.board'); if(nb && sl) nb.scrollLeft = sl;
  if(fid){ const f = document.getElementById(fid); if(f) f.focus({preventScroll:true}); }
  drawTimer();
  if(!isReady()) flag('Loading…'); else if(document.getElementById('saveFlag').textContent==='Loading…') flag('');
}

function renderBoard(progKey, prog){
  const slots = slotsFor(prog);
  const cols = currentLayout(slots);
  const skippedN = slots.filter(s=>isSkipped(s)).length;
  const total = slots.length - skippedN, done = slots.filter(s=>week.done[s.id] && !isSkipped(s)).length;
  const pct = total? Math.round(done/total*100):0;
  const end = addDays(weekStart,6);
  let h = '';
  h += `<div class="weekbar"><div class="weeknav"><button class="btn sm" data-act="prev" aria-label="Previous week">‹</button><h2 class="cond">${fmtShort(weekStart)} – ${fmtShort(end)}</h2><button class="btn sm" data-act="next" aria-label="Next week">›</button>`;
  if(ymd(monday(new Date()))!==weekKey()) h+=`<button class="btn sm ghost" data-act="today">This week</button>`;
  h += `<label class="seg modesel" for="board-mode"><span class="sr">Mode</span><select id="board-mode" data-act="mode" aria-label="Program mode">${[[1,'Mode 1 · A only'],[2,'Mode 2 · monthly'],[3,'Mode 3 · 6 months']].map(([m,t])=>`<option value="${m}" ${cfg.mode===m?'selected':''}>${t}</option>`).join('')}</select></label>`;
  if(cfg.mode===2){ const auto=programFor(weekStart); h += `<div class="seg" role="group" aria-label="Program this week">${['A','B'].map(k=>`<button class="${k===progKey?'on':''}" data-act="setprog" data-p="${k}" aria-pressed="${k===progKey}">${esc(progName(k))}</button>`).join('')}</div><span class="saveflag">${progKey===auto?'Set by month':`Switched · month default is ${esc(progName(auto))}`}</span>`; }
  h += `</div><div class="progress"><span>${done} of ${total} done${skippedN?` · ${skippedN} skipped`:''}</span><div class="bar"><i style="width:${pct}%"></i></div></div></div>`;
  if(!PROGRAMS[progKey]) h += `<div class="notice">${esc(progName(progKey))} is scheduled this week but hasn't been added yet, so ${esc(progName('A'))} is shown.</div>`;
  if(!Object.keys(cfg.rm).length && !hideTip()) h += `<div class="notice tip"><span>Targets use your last logged weight. Add a 1RM (in Settings or when you log a set) to get phase-based targets instead.</span><button class="btn sm ghost" data-act="hidetip">Got it</button></div>`;
  const since = daysSinceBackup(); const anyLogs = Object.values(logs).some(l=>l&&l.length);
  if(mcp && anyLogs && !backupSnoozed && (since==null || since>=7)) h += `<div class="notice tip"><span>${since==null?'Your training data hasn\u2019t been backed up to GitHub yet.':`Last GitHub backup was ${since} days ago.`}</span><span><button class="btn sm" data-act="backup" ${backupBusy?'disabled':''}>${backupBusy?'Backing up…':'Back up now'}</button> <button class="btn sm ghost" data-act="snooze">Later</button></span></div>`;
  if(storeMode==='local' && !hideTip('hidelocal')) h += `<div class="notice tip"><span>${window.claude ? 'Saving on this device only. Open the published page on claude.ai to keep your log everywhere.' : 'Your data is saved in this browser only. Use Export on the Progress tab to back it up.'}</span><button class="btn sm ghost" data-act="hidetip" data-k="hidelocal">Got it</button></div>`;
  h += bodyRow();
  if(mDay==null){ mDay = 1; for(let d=1; d<=6; d++){ const l=cols[d]; if(l.some(s=>!week.done[s.id] && !isSkipped(s))){ mDay=d; break; } } }
  h += `<div class="daytabs" role="tablist" aria-label="Day">${[1,2,3,4,5,6].map(d=>{ const l=cols[d].filter(s=>!isSkipped(s)), n=l.filter(s=>week.done[s.id]).length; const full=l.length&&n===l.length; return `<button role="tab" data-act="mday" data-day="${d}" aria-selected="${d===mDay}" class="${full?'full':''}"><b>D${d}</b><span>${full?'✓':`${n}/${l.length}`}</span></button>`; }).join('')}</div>`;
  h += `<div class="board">`;
  for(let d=1; d<=6; d++){
    const dayDef = prog.days[d-1];
    const list = cols[d];
    const act = list.filter(s=>!isSkipped(s)); const dn = act.filter(s=>week.done[s.id]).length;
    const all = act.length>0 && dn===act.length;
    h += `<section class="col${all?' complete':''}${d===mDay?' sel':''}" data-day="${d}"><div class="colhead"><input type="checkbox" class="chk" id="day-${d}" data-act="day" data-day="${d}" ${all?'checked':''} aria-label="Mark all of Day ${d} done"><div><h3>${dayDef.title}</h3>${dayDef.sub?`<div class="sub">${esc(dayDef.sub)}</div>`:''}</div><span class="count">${dn}/${act.length}</span></div>`;
    const w = week.warm[d]||{};
    h += `<div class="warm"><span class="tag">Warm-up</span>${WARMUP.map(x=>`<label><input type="checkbox" class="chk" id="warm-${d}-${x.id}" data-act="warm" data-day="${d}" data-w="${x.id}" ${w[x.id]?'checked':''}>${x.id==='sled'&&prog.warm?prog.warm:x.n} <span class="rx">· ${x.rx}</span></label>`).join('')}</div>`;
    if(dayDef.makeup){
      const pending = slots.filter(s=>s.day<5 && (week.moved[s.id]||s.day)<5 && !week.done[s.id] && !isSkipped(s)).length;
      h += `<div class="makeup">Make-up day for anything skipped. ${pending?`<button class="btn sm" data-act="pull">Pull in ${pending} unfinished</button>`:''}</div>`;
    }
    // Unfinished cards first (grouped by section); done and skipped ones drop to the bottom.
    const open = list.filter(s=>!week.done[s.id] && !isSkipped(s));
    const finished = [...list.filter(s=>week.done[s.id] && !isSkipped(s)), ...list.filter(s=>isSkipped(s))];
    let lastSec = null;
    open.forEach(s=>{ const sec = s.day===d ? s.sec : 'Moved here'; if(sec!==lastSec){ h+=`<div class="sect">${esc(sec)}</div>`; lastSec=sec; } h += renderCard(s, d); });
    if(finished.length){ const nd = finished.filter(s=>!isSkipped(s)).length, ns = finished.length - nd;
      h += `<div class="sect donesect">${[nd?`${nd} done`:'', ns?`${ns} skipped`:''].filter(Boolean).join(' · ')}</div>`;
      finished.forEach(s=>{ h += renderCard(s, d); }); }
    h += `</section>`;
  }
  h += `</div>`;
  return h;
}

function renderCard(s, curDay){
  const done = !!week.done[s.id]; const sk = isSkipped(s);
  const label = s.type==='superset' ? 'Superset' : s.type==='either' ? 'Either / or' : '';
  let h = `<article class="card${done?' done':''}${sk?' skipped':''}" draggable="true" data-slot="${s.id}">`;
  h += `<div class="row1"><input type="checkbox" class="chk" id="chk-${s.id}" data-act="check" data-slot="${s.id}" ${done?'checked':''} aria-label="Mark done"><div style="flex:1;display:flex;flex-direction:column;gap:2px">`;
  if(label || s.tier) h += `<span class="tag">${[s.tier,label].filter(Boolean).join(' · ')}</span>`;
  if(s.day!==curDay) h += `<span class="moved">From Day ${s.day}</span>`;
  if(sk) h += `<span class="skiptag">Skipped this week</span>`;
  h += `</div></div>`;
  s.items.forEach((it,idx)=>{
    if(idx>0 && s.type==='either') h += `<div class="or">or</div>`;
    const ph = phaseOf(s, idx), ex = exInfo(it.ex), t = targetOf(it, ph), last = lastLog(it.ex, ph);
    h += `<div class="ex"><div class="exname">${s.type==='superset'?(idx===0?'A · ':'B · '):''}${esc(ex.n)}${ex.url?`<a href="${ex.url}" target="_blank" rel="noopener" aria-label="Video">▶ video</a>`:''}</div>`;
    h += `<div class="exline"><select class="phase" data-p="${ph||''}" data-act="phase" data-slot="${s.id}" data-idx="${idx}" aria-label="Phase">${!ph?'<option value="" selected>Set phase</option>':''}${PH_KEYS.map(k=>`<option value="${k}" ${k===ph?'selected':''}>${PHASES[k].label}</option>`).join('')}</select>`;
    const rx = rxOf(it, ph);
    if(rx) h += `<span class="rx">${esc(rx)}</span>`;
    if(t.w!=null) h += `<span class="tw${t.up?' up':''}">${t.up?'↑ ':''}${t.w} lb <small>${esc(t.src)}</small></span>`; else if(t.src) h += `<span class="rx">${esc(t.src)}</span>`;
    if(ph==='iso'){ const hp=holdPlan(s, idx); h += `<button class="btn sm" data-act="hold" data-slot="${s.id}" data-idx="${idx}">Hold ${hp.sets}×${hp.hold}s</button>`; }
    if(last) h += `<button class="btn sm" data-act="repeat" data-slot="${s.id}" data-idx="${idx}" title="Log ${esc(describe(last))} again">Same as last</button>`;
    h += `<button class="btn sm logbtn" data-act="log" data-slot="${s.id}" data-idx="${idx}">Log</button></div>`;
    if(it.note) h += `<div class="note">${esc(it.note)}</div>`;
    if(last) h += `<div class="lastlog">Last: ${esc(describe(last))} · ${fmtShort(parse(last.d))}</div>`;
    h += `</div>`;
  });
  if(s.note) h += `<div class="note">${esc(s.note)}</div>`;
  const cur = week.moved[s.id]||s.day;
  h += `<div class="cardfoot"><label for="mv-${s.id}">Move to</label><select id="mv-${s.id}" data-act="move" data-slot="${s.id}">${[1,2,3,4,5,6].map(d=>`<option value="${d}" ${d===cur?'selected':''}>Day ${d}${d===s.day?' (planned)':''}</option>`).join('')}</select><button class="btn sm ghost skipbtn" data-act="skip" data-slot="${s.id}" aria-pressed="${sk}">${sk?'Undo skip':'Skip'}</button></div>`;
  return h + `</article>`;
}

function lineChart(entries, w=560, hgt=180, label='Weight over time'){
  const pts = entries.filter(e=>e.w!=null && e.w!=='').map(e=>({x:parse(e.d).getTime(), y:Number(e.w)}));
  if(pts.length<2) return `<p class="note">Log at least two sessions with a weight to see a trend.</p>`;
  const L=40,R=12,T=12,B=26;
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  let x0=Math.min(...xs), x1=Math.max(...xs); if(x0===x1){x0-=864e5;x1+=864e5}
  let y0=Math.min(...ys), y1=Math.max(...ys); const span=Math.max(y1-y0,10); const step = [2.5,5,10,20,25,50,100].find(s=>span/s<=5)||100;
  y0=Math.floor((y0-step*0.5)/step)*step; if(y0<0)y0=0; y1=Math.ceil((y1+step*0.5)/step)*step;
  const sx=x=>L+(x-x0)/(x1-x0)*(w-L-R), sy=y=>T+(1-(y-y0)/(y1-y0))*(hgt-T-B);
  let g=''; for(let v=y0; v<=y1+1e-9; v+=step){ g+=`<line class="grid" x1="${L}" x2="${w-R}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L-6}" y="${sy(v)+4}" text-anchor="end">${v}</text>`; }
  const d = pts.map((p,i)=>`${i?'L':'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = `${d}L${sx(pts[pts.length-1].x).toFixed(1)},${sy(y0)}L${sx(pts[0].x).toFixed(1)},${sy(y0)}Z`;
  const dots = pts.map((p,i)=> (i===pts.length-1 ? `<circle class="end" cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.5"/>` : `<circle class="pt" cx="${sx(p.x)}" cy="${sy(p.y)}" r="3"/>`) + `<circle class="hit" cx="${sx(p.x)}" cy="${sy(p.y)}" r="11" data-tip="${fmtShort(new Date(p.x))}: ${p.y} lb"/>`).join('');
  const lab = `<text x="${L}" y="${hgt-6}">${fmtShort(new Date(x0))}</text><text x="${w-R}" y="${hgt-6}" text-anchor="end">${fmtShort(new Date(x1))}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${hgt}" width="100%" role="img" aria-label="${esc(label)}">${g}<path class="ar" d="${area}"/><path class="ln" d="${d}"/>${dots}${lab}</svg>`;
}

let dl = undefined; // downloads namespace: undefined = not checked, null = unavailable
const blobSave = { save: async ({filename, data}) => { const url=URL.createObjectURL(new Blob([data],{type:'text/csv'})); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); return {status:'saved'}; } };
async function initDownloads(){ try{ dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : blobSave; }catch(e){ dl=null; } if(tab==='progress') render(); }
function csvCell(v){ const t = v==null ? '' : String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g,'""') + '"' : t; }
function buildCsv(){
  const rows = [['date','exercise','phase','weight_lb','sets','reps','hold_s','primary_muscles','secondary_muscles','note','program_slot','week_of']];
  Object.keys(logs).forEach(id=> (logs[id]||[]).forEach(e=> rows.push([e.d, exInfo(id).n, e.ph?PHASES[e.ph].label:'', e.w??'', e.s??'', e.r??'', e.sec??'', muscleNames(id,'p'), muscleNames(id,'s'), e.n||'', e.slot||'', e.wk||''])));
  const body = rows.slice(1).sort((a,b)=> a[0]===b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]));
  return [rows[0], ...body].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
async function exportCsv(btn){
  if(!dl) return; const csv = buildCsv();
  btn.disabled = true;
  try{ await dl.save({filename:`iron-log-${ymd(new Date())}.csv`, data:csv}); flag('Exported'); }
  catch(e){ const c = e && e.code; if(c==='declined'){} else if(c==='rate_limited') flag('A save prompt is already open'); else { flag('Export isn’t available here'); dl=null; render(); } }
  finally{ if(btn.isConnected) btn.disabled = false; }
}
let weekHist = null, historyLoading = false;
async function loadHistory(){
  if(historyLoading) return; historyLoading = true;
  const out = {};
  try{
    if(db){ const snap = await db.collection('weeks').get(); snap.docs.forEach(d=>{ if(d.exists) out[d.id]=d.data(); }); }
    else { for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.startsWith('ironlog:weeks/')){ const v=LS.get(k.slice(8)); if(v) out[k.slice(14)]=v; } } }
  }catch(e){}
  weekHist = out; historyLoading = false; if(tab==='progress') render();
}
function weekSummary(key, w){
  const start = parse(key); const pk = (cfg.mode===2 && (w.prog==='A'||w.prog==='B')) ? w.prog : programFor(start);
  const prog = PROGRAMS[pk]||PROGRAMS.A; const slots = slotsFor(prog);
  const cols = {1:[],2:[],3:[],4:[],5:[],6:[]}; slots.forEach(s=>cols[(w.moved&&w.moved[s.id])||s.day].push(s));
  const done = w.done||{}; const skip = s => isSkipped(s, w);
  const days = [1,2,3,4,5,6].map(d=>{ const l=cols[d].filter(s=>!skip(s)); const n=l.filter(s=>done[s.id]).length; return l.length ? (n===l.length ? 2 : n>0 ? 1 : 0) : 0; });
  const skipped = slots.filter(skip).length;
  return {key, start, pk, days, full: days.filter(x=>x===2).length, ex: slots.filter(s=>done[s.id] && !skip(s)).length, total: slots.length - skipped, skipped};
}
function renderHistory(){
  const weeks = {...(weekHist||{})}; weeks[weekKey()] = week; // live view of the shown week
  const thisSun = ymd(monday(new Date()));
  if(!weekHist && historyLoading) return `<section class="panel"><h2>Weekly history</h2><p>Loading…</p></section>`;
  const active = Object.keys(weeks).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k) && k<=thisSun && weekSummary(k, weeks[k]).ex>0).sort();
  const keys = []; if(active.length){ let d=parse(thisSun); const first=parse(active[0]); while(d>=first && keys.length<12){ keys.push(ymd(d)); d=addDays(d,-7); } } else keys.push(thisSun);
  const empty = {done:{}, moved:{}};
  const rows = keys.map(k=>weekSummary(k, weeks[k]||empty));
  if(!rows.length) return '';
  const avg = rows.filter(r=>r.key!==thisSun); const mean = avg.length ? (avg.reduce((a,r)=>a+r.full,0)/avg.length).toFixed(1) : null;
  return `<section class="panel hist-panel"><div class="inline" style="justify-content:space-between;flex-wrap:wrap"><h2>Weekly history</h2>${mean?`<span class="note">Average ${mean} of 6 days completed over ${avg.length} past week${avg.length>1?'s':''}</span>`:''}</div>
  <div class="weeks">${rows.map(r=>`<div class="wkrow"><span class="wkdate">${fmtShort(r.start)}${r.key===thisSun?' <small>this week</small>':''}</span><span class="pill">${r.pk}</span><span class="cells" aria-label="${r.full} of 6 days complete">${r.days.map((x,i)=>`<i class="c${x}" title="Day ${i+1}: ${x===2?'complete':x===1?'partial':'not started'}"></i>`).join('')}</span><span class="wknum"><b>${r.full}</b>/6 days · ${r.ex}/${r.total}</span></div>`).join('')}</div>
  <p class="note"><i class="cleg c2"></i> complete <i class="cleg c1"></i> partly done <i class="cleg c0"></i> not started</p></section>`;
}
function renderProgress(){
  if(!weekHist && !historyLoading) loadHistory();
  const hasLogs = Object.values(logs).some(l=>l&&l.length);
  const exp = dl && hasLogs ? `<div class="actions" style="justify-content:flex-end;margin-bottom:12px">${mcp?`<button class="btn primary" data-act="backup" ${backupBusy?'disabled':''}>${backupBusy?'Backing up…':'Back up to GitHub'}</button>`:''}<button class="btn" data-act="xlsx" data-w="all">Download Excel</button><button class="btn" data-act="xlsx" data-w="week">This week (Excel)</button><button class="btn" data-act="export">CSV</button></div>${backupMsg?`<p class="bkmsg ${backupMsg.kind}" style="text-align:right">${esc(backupMsg.text)}${backupMsg.url?` <a href="${esc(backupMsg.url)}" target="_blank" rel="noopener">View commit</a>`:''}</p>`:''}` : '';
  return renderTrends() + renderHistory() + exp + renderLifts();
}
function renderLifts(){
  const ids = Object.keys(logs).filter(id=>logs[id].length);
  if(!ids.length) return `<div class="empty">No sessions logged yet. Tap <b>Log</b> on any exercise card to record weight, sets and reps.</div>`;
  ids.sort((a,b)=> (lastLog(b).d).localeCompare(lastLog(a).d));
  return `<div class="plist">${ids.map(id=>{
    const L = logs[id], last=L[L.length-1];
    const same = L.filter(e=>(e.ph||null)===(last.ph||null));
    const ws = same.map(e=>Number(e.w)).filter(n=>!isNaN(n)&&n>0);
    const best = ws.length? Math.max(...ws): null;
    const phName = last.ph ? PHASES[last.ph].label : 'No phase';
    return `<button class="pcard" data-act="detail" data-ex="${id}"><h3>${esc(exInfo(id).n)}</h3><div class="pstats"><span>Last <b>${esc(describe(last))}</b></span>${best!=null?`<span>Best <b>${best} lb</b></span>`:''}<span>Sessions <b>${L.length}</b></span></div><span class="note"><span class="dot" data-p="${last.ph||''}"></span> ${phName} trend${same.length<L.length?` · ${L.length-same.length} other-phase session${L.length-same.length>1?'s':''} not shown`:''}</span>${lineChart(same,320,110)}</button>`;
  }).join('')}</div>`;
}

function renderSettings(){
  const now = new Date(); const yr = now.getFullYear();
  const months = Array.from({length:12},(_,i)=>{ const dt=new Date(yr,i,1); const p=programFor(dt); return `<div class="${p==='B'?'b':''}${i===now.getMonth()?' now':''}">${MON[i][0]}<br>${p}</div>`; }).join('');
  let h = `<div class="settings">`;
  h += `<section class="panel"><h2>Program mode</h2><div class="modes">
    ${[[1,`${esc(progName('A'))} only`,`Run ${esc(progName('A'))} every week.`],[2,'Alternate monthly',`${esc(progName('A'))} and ${esc(progName('B'))} take turns by month.`],[3,'Swap every 6 months','Six months on one program, then six on the other.']].map(([m,t,dsc])=>`<label class="mode"><input type="radio" name="mode" id="mode-${m}" value="${m}" data-act="mode" ${cfg.mode===m?'checked':''}><div><b>Mode ${m} · ${t}</b><span>${dsc}</span></div></label>`).join('')}
  </div>`;
  if(cfg.mode===3) h += `<div class="inline" style="flex-wrap:wrap"><label for="m3s">First block starts in</label><select id="m3s" class="btn sm" data-act="m3s">${MON.map((m,i)=>`<option value="${i+1}" ${cfg.m3Start===i+1?'selected':''}>${m}</option>`).join('')}</select><label for="m3f">on</label><select id="m3f" class="btn sm" data-act="m3f">${['A','B'].map(p=>`<option ${cfg.m3First===p?'selected':''}>${p}</option>`).join('')}</select></div>`;
  if(cfg.mode===2) h += `<div class="inline"><label for="m2e">Even months run</label><select id="m2e" class="btn sm" data-act="m2e">${['A','B'].map(p=>`<option ${cfg.m2Even===p?'selected':''}>${p}</option>`).join('')}</select></div>`;
  h += `<p>${yr} at a glance. Weeks run Sunday to Saturday; a week follows the month its Sunday falls in. In Mode 2 you can also switch a single week to A or B from the board.</p><div class="months">${months}</div>`;
  if(!PROGRAMS.B) h += `<p>Program B hasn't been added yet. Weeks scheduled for B show Program A until it is.</p>`;
  h += `</section>`;

  h += `<section class="panel"><h2>Phases</h2><p>Target weight = your 1RM × the phase %. Rounded to 2.5 lb under 50 lb, 5 lb above.</p><div class="tbl"><table><thead><tr><th>Phase</th><th>% of 1RM</th><th>Sets × reps</th></tr></thead><tbody>
    ${PH_KEYS.map(k=>`<tr><td><span class="dot" data-p="${k}"></span> ${PHASES[k].label}</td><td><input type="number" id="pct-${k}" min="0" max="110" step="1" value="${cfg.pct[k]??PHASES[k].pct}" data-act="pct" data-p="${k}"> %</td><td><input class="wide" id="rx-${k}" value="${esc(cfg.rxOverride[k]||PHASES[k].rx)}" data-act="rxo" data-p="${k}"></td></tr>`).join('')}
  </tbody></table></div><label class="inline" for="rest-s">Rest between sets <input type="number" id="rest-s" min="0" max="600" step="any" value="${cfg.rest??90}" data-act="rests" style="width:80px"> seconds</label><p>The percentages are placeholders until you set your own. Isometric holds are usually judged by time and effort more than by % of a lifting max.</p></section>`;

  h += dataPanel();
  h += backupPanel();

  const ALL_SLOTS=[...slotsFor(PROGRAMS.A),...slotsFor(PROGRAMS.B)];
  const weighted = allExIds().filter(id=> ALL_SLOTS.some(s=>s.items.some(i=>i.ex===id && i.w!=null)));
  h += `<section class="panel" style="grid-column:1/-1"><h2>1-rep maxes</h2><p>Enter a 1RM to switch that exercise's target from the program weight to a phase-based weight. Leave blank to keep the program weight.</p><div class="tbl"><table><thead><tr><th>Exercise</th><th>Program weight</th><th>1RM (lb)</th><th>Best logged</th></tr></thead><tbody>
    ${weighted.map(id=>{ const ws=[...new Set(ALL_SLOTS.flatMap(s=>s.items.filter(i=>i.ex===id&&i.w!=null).map(i=>i.w)))]; const best=(logs[id]||[]).map(e=>Number(e.w)).filter(n=>n>0); return `<tr><td>${esc(exInfo(id).n)}</td><td>${ws.join(' / ')} lb</td><td><input type="number" id="rm-${id}" min="0" step="any" value="${cfg.rm[id]??''}" data-act="rm" data-ex="${id}" placeholder="—"></td><td>${best.length?Math.max(...best)+' lb':'—'}</td></tr>`; }).join('')}
  </tbody></table></div></section>`;
  return h + `</div>`;
}

/* ---------- Log sheet ---------- */
function openLog(slotId, idx){
  const progKey = activeProgKey(); const prog = PROGRAMS[progKey]||PROGRAMS.A;
  const s = slotsFor(prog).find(x=>x.id===slotId); const it = s.items[idx]; const ex = exInfo(it.ex);
  const ph = phaseOf(s, idx); const t = targetOf(it, ph);
  const iso = ph==='iso';
  const rx = rxOf(it, ph); const m = rx.match(/(\d+)\s*×\s*(\d+)/);
  const hist = (logs[it.ex]||[]).slice(-6).reverse();
  document.getElementById('modal').innerHTML = `<div class="scrim" data-act="close"><form class="sheet" id="logform" novalidate data-slot="${slotId}" data-idx="${idx}">
    <h2 class="cond">${esc(ex.n)}</h2>
    <div class="target"><span>Target<br><b>${t.w!=null?t.w+' lb':(t.src||'—')}</b></span><span>Prescription<br><b>${esc(rx||'—')}</b></span>${t.w!=null?`<span class="note" style="align-self:end">${esc(t.src)}</span>`:''}</div>
    <div class="fields">
      <label class="field">Phase<select id="f-ph">${!ph?'<option value="">None</option>':''}${PH_KEYS.map(k=>`<option value="${k}" ${k===ph?'selected':''}>${PHASES[k].label}</option>`).join('')}</select></label>
      <label class="field">Weight (lb)<input id="f-w" type="number" inputmode="decimal" step="any" min="0" value="${t.w??''}" placeholder="BW"></label>
      <label class="field">Sets<input id="f-s" type="number" inputmode="numeric" value="${m?m[1]:''}"></label>
      <label class="field" id="f-r-wrap">${iso?'Hold (s)':'Reps'}<input id="f-r" type="number" inputmode="numeric" value="${iso?(m?m[2]:''):(m?m[2]:'')}"></label>
      <label class="field">1RM (lb)<input id="f-rm" type="number" inputmode="decimal" step="any" min="0" value="${cfg.rm[it.ex]??''}" placeholder="not set"></label>
      <label class="field">Date<input id="f-d" type="date" value="${defaultLogDate()}"></label>
    </div>
    <label class="field">Note<input id="f-n" type="text" placeholder="Form, how it felt, equipment"></label>
    <label class="inline"><input type="checkbox" id="f-def"> Make this phase the default for this slot</label>
    <label class="inline"><input type="checkbox" id="f-done" ${s.items.length===1?'checked':''}> Check off the card</label>
    <div class="actions">${lastLog(it.ex, ph)?`<button type="button" class="btn" data-act="fillLast" style="margin-right:auto">Fill last: ${esc(describe(lastLog(it.ex, ph)))}</button>`:''}<button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary">Save set</button></div>
    ${hist.length?`<div><div class="sect" style="padding:0 0 4px">Recent</div><table class="hist"><thead><tr><th>Date</th><th>Phase</th><th class="num">Load</th><th class="num">Volume</th></tr></thead><tbody>${hist.map(e=>`<tr><td>${fmtShort(parse(e.d))}</td><td>${e.ph?PHASES[e.ph].label:'—'}</td><td class="num">${e.w!=null&&e.w!==''?e.w+' lb':'BW'}</td><td class="num">${e.sec?`${e.s}×${e.sec}s`:`${e.s||'?'}×${e.r||'?'}`}</td></tr>`).join('')}</tbody></table></div>`:''}
  </form></div>`;
  const phSel = document.getElementById('f-ph');
  phSel.addEventListener('change', ()=>{ const p=phSel.value; const nt=targetOf(it,p||null); document.getElementById('f-w').value = nt.w??''; const r=rxOf(it,p||null).match(/(\d+)\s*×\s*(\d+)/); document.getElementById('f-s').value=r?r[1]:''; document.getElementById('f-r').value=r?r[2]:''; document.getElementById('f-r-wrap').firstChild.textContent = p==='iso'?'Hold (s)':'Reps'; });
  document.getElementById('f-w').focus();
}
function hideTip(k='hidetip'){ try{ return localStorage.getItem('ironlog:'+k)==='1'; }catch(e){ return false; } }
function defaultLogDate(){ const today=new Date(); const end=addDays(weekStart,6); return (today>=weekStart && today<=addDays(end,1)) ? ymd(today) : ymd(weekStart); }
function closeModal(){ document.getElementById('modal').innerHTML=''; }

function openDetail(exId){
  const L = (logs[exId]||[]);
  document.getElementById('modal').innerHTML = `<div class="scrim" data-act="close"><div class="sheet" style="max-width:640px"><h2 class="cond">${esc(exInfo(exId).n)}</h2>${(()=>{ const last=L[L.length-1]; if(!last) return ''; const same=L.filter(e=>(e.ph||null)===(last.ph||null)); return `<p class="note">${last.ph?PHASES[last.ph].label:'No phase'} trend (the phase you logged most recently). The table lists every session.</p>`+lineChart(same); })()}
  <table class="hist"><thead><tr><th>Date</th><th>Phase</th><th class="num">Load</th><th class="num">Volume</th><th>Note</th><th></th></tr></thead><tbody>
  ${L.map((e,i)=>({e,i})).reverse().map(({e,i})=>`<tr><td>${fmtShort(parse(e.d))}</td><td>${e.ph?PHASES[e.ph].label:'—'}</td><td class="num">${e.w!=null&&e.w!==''?e.w+' lb':'BW'}</td><td class="num">${e.sec?`${e.s}×${e.sec}s`:`${e.s||'?'}×${e.r||'?'}`}</td><td>${esc(e.n||'')}</td><td><button class="btn sm ghost" data-act="dellog" data-ex="${exId}" data-i="${i}" aria-label="Delete entry">✕</button></td></tr>`).join('')}
  </tbody></table><div class="actions"><button class="btn" data-act="close">Close</button></div></div></div>`;
}
