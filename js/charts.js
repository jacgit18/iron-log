/* ---------- Trends: charts on the Progress tab ---------- */
const mdLabel = k => { const d = parse(k); return `${d.getMonth()+1}/${d.getDate()}`; };
const entryWeek = e => e.wk || weekOfDate(e.d);
const setsOf = e => { const n = Number(e.s); return n > 0 ? n : 0; };
const signed = (n, dp=0) => `${n>0?'+':n<0?'−':''}${Math.abs(n).toFixed(dp)}`;

// Week keys for the charts: up to `max` weeks ending this week, starting no earlier than the first logged week (min `min` columns).
function trendWeeks(max, min){
  const thisSun = ymd(monday(new Date()));
  let first = thisSun; Object.values(logs).forEach(L=>L.forEach(e=>{ const k = entryWeek(e); if(k < first) first = k; }));
  const keys = []; let d = parse(thisSun);
  while(keys.length < max && (ymd(d) >= first || keys.length < min)){ keys.unshift(ymd(d)); d = addDays(d, -7); }
  return keys;
}
function setsByWeek(keys){
  const out = {}; keys.forEach(k=>out[k] = {sets:0, sessions:0});
  Object.values(logs).forEach(L=>L.forEach(e=>{ const r = out[entryWeek(e)]; if(r){ r.sets += setsOf(e); r.sessions++; } }));
  return out;
}
function muscleWeeks(keys){
  const out = {}; M_KEYS.forEach(m=>{ out[m] = {}; keys.forEach(k=>out[m][k] = 0); });
  Object.entries(logs).forEach(([id,L])=>{ const tg = tagsOf(id); if(!tg || tg.mob) return;
    L.forEach(e=>{ const k = entryWeek(e); if(!(k in out[M_KEYS[0]])) return; const s = setsOf(e);
      (tg.p||[]).forEach(m=>{ if(out[m]) out[m][k] += s; }); (tg.s||[]).forEach(m=>{ if(out[m]) out[m][k] += s/2; }); }); });
  return out;
}
// First vs latest working weight per exercise and phase, over the window.
function weightChanges(sinceKey){
  const rows = [];
  Object.entries(logs).forEach(([id,L])=>{
    const by = {}; L.forEach(e=>{ const w = Number(e.w); if(!(w>0) || entryWeek(e) < sinceKey) return; (by[e.ph||''] = by[e.ph||''] || []).push(e); });
    Object.entries(by).forEach(([ph,E])=>{ if(E.length < 2) return; E = [...E].sort((a,b)=>a.d.localeCompare(b.d));
      const a = E[0], b = E[E.length-1]; const w0 = Number(a.w), w1 = Number(b.w);
      if(a.d === b.d) return;
      rows.push({id, ph:ph||null, w0, w1, d0:a.d, d1:b.d, n:E.length, pct:(w1-w0)/w0*100}); });
  });
  return rows.sort((x,y)=> y.pct-x.pct || exInfo(x.id).n.localeCompare(exInfo(y.id).n));
}
const niceStep = max => [1,2,5,10,20,25,50,100,200,250,500,1000].find(s=>max/s <= 4) || 1000;

function kpiTiles(keys, byWeek, changes){
  const r = weekSummary(weekKey(), week);
  const k4 = keys.slice(-4), p4 = keys.slice(-8,-4);
  const s4 = k4.reduce((a,k)=>a+(byWeek[k]?byWeek[k].sets:0),0);
  const prev = p4.length===4 && p4.some(k=>byWeek[k] && byWeek[k].sessions) ? p4.reduce((a,k)=>a+byWeek[k].sets,0) : null;
  const up = changes.filter(c=>c.pct>0).length;
  const tile = (label, value, sub) => `<div class="kpi"><span class="kl">${label}</span><span class="kv">${value}</span><span class="ks">${sub}</span></div>`;
  return `<div class="kpis">${
    tile('This week', `${r.ex}<small> of ${r.total}</small>`, `exercises done · ${r.full} of 6 days${r.skipped?` · ${r.skipped} skipped`:''}`)}${
    tile('Sets, last 4 weeks', `${fmtSets(s4)}`, prev==null ? 'A comparison with the previous 4 weeks starts after 8 weeks of logs' : `${signed(s4-prev)} vs the 4 weeks before`)}${
    tile('Lifts going up', changes.length ? `${up}<small> of ${changes.length}</small>` : '—', changes.length ? 'heavier now than at the start of the last 8 weeks' : 'Log a lift with weight on two days to track it')}${bodyTile()}</div>`;
}

function setsChart(keys, byWeek){
  const thisSun = keys[keys.length-1];
  const max = Math.max(...keys.map(k=>byWeek[k].sets), 1); const step = niceStep(max); const top = Math.ceil(max/step)*step;
  const grid = []; for(let v=0; v<=top; v+=step) grid.push(v);
  const total = keys.reduce((a,k)=>a+byWeek[k].sets,0);
  let h = `<section class="panel tchart"><h2>Sets logged per week</h2>`;
  if(!total) return h + `<p class="note">Logged sets show up here, one bar per week.</p></section>`;
  h += `<div class="bars" role="img" aria-label="Sets logged per week: ${keys.map(k=>`week of ${fmtShort(parse(k))}, ${fmtSets(byWeek[k].sets)}`).join('; ')}">`;
  h += `<div class="bgrid">${grid.map(v=>`<span style="bottom:${v/top*100}%"><b>${v}</b></span>`).join('')}</div><div class="bcols">`;
  keys.forEach((k,i)=>{ const r = byWeek[k]; const cur = k===thisSun; const pct = r.sets/top*100;
    const tip = `Week of ${fmtShort(parse(k))}${cur?' (so far)':''}: ${fmtSets(r.sets)} set${r.sets===1?'':'s'} in ${r.sessions} session${r.sessions===1?'':'s'}`;
    h += `<div class="bcol${cur?' cur':''}" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}"><div class="bplot">${r.sets?`<i style="height:${pct}%"></i>`:''}${cur&&r.sets?`<em style="bottom:${pct}%">${fmtSets(r.sets)}</em>`:''}</div><span class="bx${(keys.length-1-i)%2?' alt':''}">${cur?'Now':mdLabel(k)}</span></div>`; });
  h += `</div></div><p class="note">Every set you log, all exercises together. The faded bar is this week so far.</p>`;
  return h + `</section>`;
}

function changeChart(changes){
  let h = `<section class="panel tchart"><h2>Weight change by exercise</h2>`;
  if(!changes.length) return h + `<p class="note">Once you log the same lift with weight on two different days, this shows how much heavier (or lighter) it is now, over the last 8 weeks.</p></section>`;
  const downs = changes.filter(c=>c.pct<0).slice(-4); const shown = [...changes.filter(c=>c.pct>=0).slice(0, 10-downs.length), ...downs]; const lim = Math.max(10, ...shown.map(c=>Math.abs(c.pct)));
  const mixed = shown.some(c=>c.pct<0); const zero = mixed ? 50 : 0, span = mixed ? 50 : 100;
  h += `<div class="chg${mixed?' mixed':''}">`;
  shown.forEach(c=>{
    const w = Math.abs(c.pct)/lim*span; const dir = c.pct>0 ? 'up' : c.pct<0 ? 'down' : 'flat';
    const ph = c.ph ? PHASES[c.ph].label : 'No phase';
    const tip = `${exInfo(c.id).n} · ${ph}: ${c.w0} → ${c.w1} lb (${signed(c.pct,0)}%) from ${fmtShort(parse(c.d0))} to ${fmtShort(parse(c.d1))}, ${c.n} sessions`;
    h += `<div class="chrow" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}"><span class="chn"><span class="dot" data-p="${c.ph||''}"></span>${esc(exInfo(c.id).n)}</span>
      <span class="chbar"><span class="axis"></span>${dir==='flat'?'<i class="flat"></i>':`<i class="${dir}" style="${dir==='up'?'left':'right'}:${dir==='up'?zero:100-zero}%;width:${w}%"></i>`}</span>
      <span class="chv">${signed(c.pct,0)}% <small>${c.w0}→${c.w1}</small></span></div>`;
  });
  h += `</div>`;
  const more = changes.length - shown.length;
  h += `<p class="note">First vs latest weight in the same phase, last 8 weeks.${more>0?` ${more} more in the lift list below.`:''} The dot shows the phase.</p>`;
  return h + `</section>`;
}

function muscleHeat(keys){
  const K = keys.slice(-8); const data = muscleWeeks(K); const thisSun = K[K.length-1];
  const any = M_KEYS.some(m=>K.some(k=>data[m][k]>0));
  let h = `<section class="panel tchart heat-panel"><h2>Muscles trained per week</h2>`;
  if(!any) return h + `<p class="note">Once you log sessions, this shows which muscles got work each week. Grey means none.</p></section>`;
  h += `<div class="heat" style="grid-template-columns:minmax(96px,160px) repeat(${K.length},minmax(0,72px))" role="table" aria-label="Sets per muscle per week">`;
  h += `<span role="columnheader"></span>${K.map((k,i)=>`<span class="hx${(K.length-1-i)%2?' alt':''}" role="columnheader">${k===thisSun?'Now':mdLabel(k)}</span>`).join('')}`;
  M_KEYS.forEach(m=>{
    const row = K.map(k=>data[m][k]); const none = row.every(v=>!v);
    h += `<span class="hn${none?' none':''}" role="rowheader">${MUSCLES[m].n}</span>`;
    h += K.map((k,i)=>{ const v = row[i]; const tip = `${MUSCLES[m].n}, week of ${fmtShort(parse(k))}${k===thisSun?' (so far)':''}: ${v?fmtSets(v)+' set'+(v===1?'':'s'):'not trained'}`;
      return `<i class="hc l${level(v)}${k===thisSun?' cur':''}" role="cell" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></i>`; }).join('');
  });
  h += `</div><div class="legend heatleg"><span class="sw l0"></span>none <span class="sw l1"></span>1–4 <span class="sw l2"></span>5–9 <span class="sw l3"></span>10–20 <span class="sw l4"></span>20+ sets</div>`;
  h += `<p class="note">From what you logged, not the plan. Secondary muscles count as half a set, the same as the Muscles tab.</p>`;
  return h + `</section>`;
}

function renderTrends(){
  const hasLogs = Object.values(logs).some(l=>l&&l.length);
  if(!hasLogs && !body.length) return '';
  const keys = trendWeeks(12, 4); const byWeek = setsByWeek(keys);
  const changes = weightChanges(keys[Math.max(0, keys.length-8)]);
  return kpiTiles(keys, byWeek, changes) + `<div class="tgrid">${setsChart(keys, byWeek)}${changeChart(changes)}${bodyChart()}</div>` + muscleHeat(keys);
}

/* Tooltip for any [data-tip] mark: hover with a mouse, tap or focus on touch/keyboard. */
let tipEl = null;
function showTooltip(t){
  if(!tipEl){ tipEl = document.createElement('div'); tipEl.id = 'tip'; tipEl.setAttribute('role','status'); document.body.appendChild(tipEl); }
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const r = t.getBoundingClientRect(); const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let x = r.left + r.width/2 - tw/2; x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
  let y = r.top - th - 8; if(y < 8) y = r.bottom + 8;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  document.querySelectorAll('.tipon').forEach(e=>e.classList.remove('tipon')); t.classList.add('tipon');
}
function hideTooltip(){ if(tipEl) tipEl.hidden = true; document.querySelectorAll('.tipon').forEach(e=>e.classList.remove('tipon')); }
document.addEventListener('pointerover', e=>{ if(e.pointerType!=='mouse') return; const t = e.target.closest && e.target.closest('[data-tip]'); if(t) showTooltip(t); else hideTooltip(); });
document.addEventListener('pointerdown', e=>{ if(e.pointerType==='mouse') return; const t = e.target.closest && e.target.closest('[data-tip]'); if(t) showTooltip(t); else hideTooltip(); });
document.addEventListener('focusin', e=>{ const t = e.target.closest && e.target.closest('[data-tip]'); if(t) showTooltip(t); });
document.addEventListener('focusout', hideTooltip);
window.addEventListener('scroll', hideTooltip, {passive:true});

/* ---------- Body weight ---------- */
let bwEditing = false;
const bwSorted = () => [...body].filter(e=>e && e.wk && Number(e.w)>0).sort((a,b)=>a.wk.localeCompare(b.wk));
const fmtLb = n => `${Math.round(Number(n)*10)/10}`;
function bwPrevious(wk){ const l = bwSorted().filter(e=>e.wk < wk); return l[l.length-1] || null; }
function bodyRow(){
  const wk = weekKey(); const cur = body.find(e=>e.wk===wk); const prev = bwPrevious(wk);
  const isNow = wk === ymd(monday(new Date()));
  const label = isNow ? 'Body weight this week' : `Body weight, week of ${fmtShort(weekStart)}`;
  if(cur && !bwEditing){
    const diff = prev ? Number(cur.w) - Number(prev.w) : null;
    return `<div class="bwrow"><span class="bwl">${label}</span><b>${fmtLb(cur.w)} lb</b>${diff!=null?`<span class="note">${diff===0?'same as':`${signed(diff,1)} lb vs`} ${fmtShort(parse(prev.d))}</span>`:''}<button class="btn sm ghost" data-act="bwedit">Edit</button></div>`;
  }
  return `<form class="bwrow" id="bwform" novalidate><label class="bwl" for="bw-in">${label}</label><span class="bwin"><input id="bw-in" type="number" inputmode="decimal" step="any" min="0" value="${cur?fmtLb(cur.w):''}" placeholder="${prev?fmtLb(prev.w):'lb'}" aria-label="${label} in pounds"> lb</span><button type="submit" class="btn sm primary">Save</button>${cur?'<button type="button" class="btn sm ghost" data-act="bwcancel">Cancel</button>':''}</form>`;
}
function saveBodyWeight(v){
  const n = Number(v); if(!(n>0 && n<1500)){ flag('Enter your weight in lb'); return; }
  const wk = weekKey(); const today = ymd(new Date()); const d = (today >= wk && today <= ymd(addDays(weekStart,6))) ? today : wk;
  body = [...body.filter(e=>e.wk!==wk), {wk, d, w:Math.round(n*10)/10}].sort((a,b)=>a.wk.localeCompare(b.wk));
  saveBody(); bwEditing = false; render(); flag('Body weight saved');
}
function bodyTile(){
  const L = bwSorted(); if(!L.length) return '';
  const last = L[L.length-1]; const cut = ymd(addDays(parse(last.wk), -28));
  const base = [...L].reverse().find(e=>e.wk <= cut) || (L.length>1 ? L[0] : null);
  const diff = base ? last.w - base.w : null;
  return `<div class="kpi"><span class="kl">Body weight</span><span class="kv">${fmtLb(last.w)}<small> lb</small></span><span class="ks">${diff==null?`Logged ${fmtShort(parse(last.d))}`:`${signed(diff,1)} lb since ${fmtShort(parse(base.d))}`}</span></div>`;
}
function bodyChart(){
  const L = bwSorted();
  let h = `<section class="panel tchart"><h2>Body weight</h2>`;
  if(!L.length) return h + `<p class="note">Log your weight once a week from the top of the Board. It shows here as a trend.</p></section>`;
  h += L.length>1 ? lineChart(L.map(e=>({d:e.d, w:e.w})), 560, 180, 'Body weight over time') : `<p class="note">One more weekly weigh-in and the trend line starts.</p>`;
  const rec = [...L].reverse().slice(0, 6);
  h += `<table class="hist bwtab"><thead><tr><th>Date</th><th class="num">Weight</th><th class="num">Change</th><th></th></tr></thead><tbody>${rec.map((e,i)=>{ const p = rec[i+1]; return `<tr><td>${fmtShort(parse(e.d))}</td><td class="num">${fmtLb(e.w)} lb</td><td class="num">${p?`${signed(e.w-p.w,1)}`:'—'}</td><td class="num"><button class="btn sm ghost" data-act="bwdel" data-wk="${e.wk}" aria-label="Delete ${fmtShort(parse(e.d))}">✕</button></td></tr>`; }).join('')}</tbody></table>`;
  if(L.length>6) h += `<p class="note">Showing the latest 6 of ${L.length}. All of them are in the Excel and data exports.</p>`;
  return h + `</section>`;
}
