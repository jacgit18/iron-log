/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
function monday(d){ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate()-x.getDay()); return x; } // week runs Sunday → Saturday
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtShort = d => `${MON[d.getMonth()]} ${d.getDate()}`;

/* ---------- State ---------- */
const DEFAULT_CFG = { muscleMap:{}, ex:{}, mode:1, m3Start:1, m3First:'A', m2Even:'A', pct:{strength:85,iso:75,hyp:65,exp:45}, rxOverride:{}, rm:{}, phDef:{} };
let cfg = structuredClone(DEFAULT_CFG);
let weekStart = monday(new Date());
let week = {done:{}, moved:{}, ph:{}, warm:{}};
let logs = {}; // exId -> [entries]
let tab = 'board';
let mDay = null; // day shown on phones
let db = null;
let unsubWeek = null;
let storeMode = 'loading';
const ready = {cfg:false, logs:false, week:false, programs:false, lib:false, body:false};
const isReady = () => ready.cfg && ready.logs && ready.week && ready.programs && ready.lib && ready.body;
let library = []; // saved program versions
let body = []; // body weight: [{wk, d, w}], one per week

function programFor(date){
  const m = date.getMonth()+1; // 1..12
  if(cfg.mode===2){ const even = m%2===0; const evenProg = cfg.m2Even||'A'; return even?evenProg:(evenProg==='A'?'B':'A'); }
  if(cfg.mode===3){ const idx = Math.floor((((m - cfg.m3Start)%12)+12)%12/6); return idx===0?cfg.m3First:(cfg.m3First==='A'?'B':'A'); }
  return 'A';
}
const weekKey = () => ymd(weekStart);
const progName = k => (cfg.progNames && cfg.progNames[k]) || `Program ${k}`;
function activeProgKey(){ return (cfg.mode===2 && (week.prog==='A'||week.prog==='B')) ? week.prog : programFor(weekStart); }

/* ---------- Storage (db with local fallback) ---------- */
const LS = {
  get(k){ try{ return JSON.parse(localStorage.getItem('ironlog:'+k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem('ironlog:'+k, JSON.stringify(v)); }catch(e){} },
};
const queues = {};
function save(path, data){
  // one write at a time per doc; coalesce to latest
  const q = queues[path] || (queues[path] = {busy:false, next:null});
  q.next = structuredClone(data);
  if(!db){ LS.set(path, q.next); q.next=null; return; }
  if(q.busy) return;
  const run = async () => {
    q.busy = true;
    while(q.next){ const body=q.next; q.next=null;
      try{ if(body.__delete) await db.doc(path).delete(); else await db.doc(path).set(body); flag('Saved'); }
      catch(e){ flag(e && e.code==='quota_exceeded' ? 'Storage full' : 'Not saved, retrying…'); await new Promise(r=>setTimeout(r,1500)); if(!q.next) q.next=body; if(e && (e.code==='invalid_argument'||e.code==='revoked'||e.code==='not_granted')){ q.next=null; flag('Could not save'); } }
    }
    q.busy = false;
  };
  run();
}
let flagT, flagHold=0; function flag(t){ const el=document.getElementById('saveFlag'); const now=Date.now(); if((t==='Saved'||t==='Loading…'||t==='') && now<flagHold) return; if(t!=='Saved' && t!=='Loading…' && t!=='' && !/^Not saved|^Could/.test(t)) flagHold=now+2500; el.textContent=t; clearTimeout(flagT); if(t==='Saved') flagT=setTimeout(()=>el.textContent='',1500); else if(flagHold>now) flagT=setTimeout(()=>{ if(el.textContent===t) el.textContent=''; },3500); }

function removeDoc(path){ if(!db){ try{ localStorage.removeItem('ironlog:'+path); }catch(e){} return; } save(path, {__delete:true}); }
function saveCfg(){ save('config/main', cfg); }
function saveWeek(){ save('weeks/'+weekKey(), week); }
function saveBody(){ save('body/main', {entries: body}); }
function saveLibrary(){ save('library/main', {items: library}); }
function saveLog(exId){ save('logs/'+exId, {entries: logs[exId]||[]}); }

function subscribeWeek(){
  if(unsubWeek){ unsubWeek(); unsubWeek=null; }
  const key = weekKey();
  if(!db){ week = normWeek(LS.get('weeks/'+key)); ready.week = storeMode==='local'; if(ready.week) mDay = null; render(); return; }
  week = normWeek(null); ready.week = false; let first = true;
  unsubWeek = db.doc('weeks/'+key).onSnapshot(s=>{ if(key!==weekKey()) return; if(s.metadata.hasPendingWrites) return; week = normWeek(s.exists? s.data(): null); ready.week = true; if(first){ first = false; mDay = null; } render(); }, ()=>flag('Couldn’t load this week. Reload the page.'));
}
const normWeek = w => ({prog:(w&&w.prog)||null, done:{...(w&&w.done)}, skipped:{...(w&&w.skipped)}, moved:{...(w&&w.moved)}, ph:{...(w&&w.ph)}, warm:JSON.parse(JSON.stringify((w&&w.warm)||{}))});

async function init(){
  render();
  initDownloads();
  initBackup();
  try{ db = (window.claude && window.claude.use) ? await window.claude.use('db') : null; }catch(e){ db=null; }
  if(!db){
    storeMode='local'; ready.cfg = ready.logs = ready.programs = ready.lib = ready.body = true;
    body = ((LS.get('body/main')||{}).entries)||[];
    library = ((LS.get('library/main')||{}).items)||[];
    applyProgram('A', LS.get('programs/A')); applyProgram('B', LS.get('programs/B'));
    const c = LS.get('config/main'); if(c) cfg = {...structuredClone(DEFAULT_CFG), ...c};
    try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.startsWith('ironlog:logs/')){ const l=LS.get(k.slice(8)); if(l&&l.entries) logs[k.slice(13)]=l.entries; } } }catch(e){}
    subscribeWeek(); return;
  }
  storeMode='db';
  db.collection('programs').onSnapshot(s=>{ if(s.metadata.hasPendingWrites) return; const m={}; s.docs.forEach(d=>m[d.id]=d.data()); applyProgram('A', m.A); applyProgram('B', m.B); ready.programs = true; render(); }, ()=>flag('Couldn’t load your programs. Reload the page.'));
  db.doc('body/main').onSnapshot(s=>{ if(s.metadata.hasPendingWrites) return; body = s.exists ? [...((s.data()||{}).entries||[])] : []; ready.body = true; render(); }, ()=>flag('Couldn’t load body weight. Reload the page.'));
  db.doc('library/main').onSnapshot(s=>{ if(s.metadata.hasPendingWrites) return; library = s.exists ? [...((s.data()||{}).items||[])] : []; ready.lib = true; render(); }, ()=>flag('Couldn’t load saved programs. Reload the page.'));
  db.doc('config/main').onSnapshot(s=>{ if(s.metadata.hasPendingWrites) return; if(s.exists) cfg = {...structuredClone(DEFAULT_CFG), ...structuredClone(s.data())}; ready.cfg = true; render(); }, ()=>flag('Couldn’t load settings. Reload the page.'));
  db.collection('logs').onSnapshot(s=>{ if(s.metadata.hasPendingWrites) return; const next={}; s.docs.forEach(d=>{ next[d.id] = [...((d.data()||{}).entries||[])]; }); logs=next; ready.logs = true; render(); }, ()=>flag('Couldn’t load your log. Reload the page.'));
  subscribeWeek();
}

/* ---------- Helpers ---------- */
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round = w => w<50 ? Math.round(w/2.5)*2.5 : Math.round(w/5)*5;
const itemKey = (slot, idx) => `${slot.id}:${idx}`;
function phaseOf(slot, idx){ const k=itemKey(slot,idx); return week.ph[k] ?? cfg.phDef[k] ?? slot.items[idx].ph ?? null; }
function rxOf(item, ph){ if(item.rx && ph===item.ph) return item.rx; if(ph) return cfg.rxOverride[ph] || PHASES[ph].rx; return item.rx || ''; }
// Stall: the last 3 sessions of a lift in one phase (one per day) never went above the first of them in weight,
// the latest didn't beat the first on total reps (or hold time), and they span at least 2 different weeks. Not flagged when the app is already suggesting a heavier weight.
function stallOf(exId, ph){
  const byDay = {}; (logs[exId]||[]).filter(e=>(e.ph||null)===(ph||null)).forEach(e=>{ byDay[e.d]=e; });
  const L = Object.keys(byDay).sort().map(d=>byDay[d]).slice(-3);
  if(L.length<3 || L.some(e=>!(Number(e.w)>0))) return null;
  const w0 = Number(L[0].w); if(L.some(e=>Number(e.w) > w0)) return null;
  if(new Set(L.map(e=>e.wk || ymd(monday(parse(e.d))))).size < 2) return null;
  const work = e => setsOfEntry(e).reduce((a,x)=>a+(Number(x.sec ?? x.r)||0),0); // total reps (or hold seconds)
  if(Number(L[2].w) === w0 && work(L[2]) > work(L[0])) return null; // same weight but more reps: still progressing
  if(progressionOf({ex:exId}, ph)) return null;
  return {w: Number(L[2].w), since: L[0].d, n: 3};
}
function progressionOf(item, ph){
  const byDay = {}; (logs[item.ex]||[]).filter(e=>(e.ph||null)===(ph||null)).forEach(e=>{ byDay[e.d]=e; });
  const L = Object.keys(byDay).sort().map(d=>byDay[d]);
  if(L.length<2) return null;
  const [a, b] = L.slice(-2); const w = Number(b.w);
  if(!(w>0) || !(Number(a.w)>=w)) return null;
  const m = rxOf(item, ph).match(/(\d+)\s*×\s*(\d+)/); if(!m) return null;
  const sets = Number(m[1]), reps = Number(m[2]);
  const full = e => setsOfEntry(e).filter(x=> Number(x.w)>=w && (ph==='iso' ? Number(x.sec)>=30 : Number(x.r)>=reps)).length >= sets;
  if(!full(a) || !full(b)) return null;
  return {w: w + (w<50 ? 2.5 : 5), from: w};
}
function targetOf(item, ph){
  const base = baseTargetOf(item, ph); const up = progressionOf(item, ph);
  if(up && (base.w==null || up.w>base.w)) return {w:up.w, src:`up from ${up.from} lb`, up:true};
  return base;
}
function baseTargetOf(item, ph){
  const rm = cfg.rm[item.ex];
  if(rm && ph){ return {w: round(rm*(cfg.pct[ph]??PHASES[ph].pct)/100), src:`${cfg.pct[ph]??PHASES[ph].pct}% of 1RM`}; }
  const last = lastLog(item.ex, ph);
  if(last && last.w!=null && last.w!=='' && Number(last.w)>0) return {w:Number(last.w), src:'last session'};
  if(item.w!=null) return {w:item.w, src:'program'};
  if(item.bw) return {w:null, src:'bodyweight'};
  return {w:null, src:''};
}
const lastLog = (exId, ph) => { const l=(logs[exId]||[]).filter(e=>ph===undefined || (e.ph||null)===(ph||null)); return l.length? l[l.length-1] : null; };
/* ---------- Per-set logging ----------
   An entry keeps each set in e.sets: [{w, r}] (or [{w, sec}] for holds). It also keeps summary fields that
   the rest of the app reads: w = heaviest weight, s = number of sets, r / sec = the lowest reps / hold,
   so "every set hit the target" is simply r >= target. Older entries have only the summary fields. */
function summarizeSets(sets, iso){
  const ws = sets.map(x=>x.w).filter(v=>v!=null);
  const out = {w: ws.length ? Math.max(...ws) : null, s: sets.length};
  const vals = sets.map(x=> iso ? x.sec : x.r).filter(v=>v!=null);
  if(vals.length) out[iso ? 'sec' : 'r'] = Math.min(...vals);
  out.sets = sets; return out;
}
function setsOfEntry(e){
  if(Array.isArray(e.sets) && e.sets.length) return e.sets;
  const n = Number(e.s)||0; const w = (e.w===''||e.w==null) ? null : Number(e.w);
  return Array.from({length:n}, ()=> e.sec!=null ? {w, sec:Number(e.sec)} : {w, r:e.r==null?null:Number(e.r)});
}
const setVal = x => x.sec!=null ? `${x.sec}s` : (x.r ?? '?');
const isUniform = e => { const S = e.sets; return !S || S.length<2 || S.every(x=>x.w===S[0].w && x.r===S[0].r && x.sec===S[0].sec); };
function volText(e){
  if(isUniform(e)) return e.sec ? `${e.s||'?'} × ${e.sec}s` : `${e.s||'?'} × ${e.r||'?'}`;
  const S = e.sets; if(S.every(x=>x.w===S[0].w)) return S.map(setVal).join(', ');
  const groups = []; S.forEach(x=>{ const g = groups[groups.length-1]; if(g && g.w===x.w) g.v.push(setVal(x)); else groups.push({w:x.w, v:[setVal(x)]}); });
  return groups.map(g=>`${g.w!=null?g.w+' lb':'BW'} × ${g.v.join(', ')}`).join(' · ');
}
function describe(e){
  if(!e) return '';
  const S = e.sets; if(!isUniform(e) && !S.every(x=>x.w===S[0].w)) return volText(e);
  const load = e.w!=null && e.w!=='' ? `${e.w} lb` : 'BW'; return `${load} · ${volText(e)}`;
}
/* ---------- What counts: the one rule every count in the app uses ---------- */
const isSkipped = (s, w=week) => !!(w.skipped && w.skipped[s.id]);
// Done state lives in week.done: done[id] = the whole card is done; done[`${id}#${i}`] = one exercise
// in a paired card (a superset half, or the either/or option that was picked).
const itemKey2 = (s, i) => `${s.id}#${i}`;
const isPaired = s => s.type==='superset' || s.type==='either';
function isItemDone(s, i, w=week){
  const d = w.done || {};
  if(!isPaired(s)) return !!d[s.id];
  if(d[itemKey2(s,i)]) return true;
  if(!d[s.id]) return false;
  if(s.type==='superset') return true;
  return i===0 && !s.items.some((_,j)=>d[itemKey2(s,j)]); // either/or done without a recorded pick: show the first
}
function isDone(s, w=week){
  const d = w.done || {}; if(d[s.id]) return true;
  if(s.type==='superset') return s.items.every((_,i)=>d[itemKey2(s,i)]);
  if(s.type==='either') return s.items.some((_,i)=>d[itemKey2(s,i)]);
  return false;
}
const isOpen = (s, w=week) => !isDone(s, w) && !isSkipped(s, w); // still to do this week
// How many units a card adds to a total, and how many of those are done:
// a superset counts each exercise, an either/or counts once, a single card counts once.
const unitsOf = s => s.type==='superset' ? s.items.length : 1;
const doneUnitsOf = (s, w=week) => s.type==='superset' ? s.items.filter((_,i)=>isItemDone(s,i,w)).length : (isDone(s, w) ? 1 : 0);
const slotById = id => slotsFor(PROGRAMS[activeProgKey()]||PROGRAMS.A).find(x=>x.id===id);
function clearDone(s, w=week){ if(!w.done) return; delete w.done[s.id]; s.items.forEach((_,i)=>delete w.done[itemKey2(s,i)]); }
function setCardDone(s, on, w=week){ clearDone(s, w); if(on){ w.done[s.id] = true; if(w.skipped) delete w.skipped[s.id]; } }
function setItemDone(s, idx, on, w=week){
  if(!isPaired(s)) return setCardDone(s, on, w);
  if(s.type==='superset'){
    const cur = s.items.map((_,i)=>isItemDone(s,i,w)); cur[idx] = on; clearDone(s, w);
    if(cur.every(Boolean)) w.done[s.id] = true; else cur.forEach((v,i)=>{ if(v) w.done[itemKey2(s,i)] = true; });
  } else { clearDone(s, w); if(on){ w.done[s.id] = true; w.done[itemKey2(s,idx)] = true; } }
  if(on && w.skipped) delete w.skipped[s.id];
}
// Totals for any list of cards. Skipped cards are left out of total and done.
function tally(slots, w=week){
  let total = 0, done = 0, skipped = 0;
  slots.forEach(s=>{ if(isSkipped(s, w)){ skipped++; return; } total += unitsOf(s); done += doneUnitsOf(s, w); });
  return {total, done, skipped, full: total > 0 && done === total};
}
function currentLayout(slots){
  const cols = {1:[],2:[],3:[],4:[],5:[],6:[]};
  slots.forEach(s=>{ const d = week.moved[s.id] || s.day; cols[d].push(s); });
  return cols;
}
