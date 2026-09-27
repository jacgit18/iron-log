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
const ready = {cfg:false, logs:false, week:false, programs:false};
const isReady = () => ready.cfg && ready.logs && ready.week && ready.programs;

function programFor(date){
  const m = date.getMonth()+1; // 1..12
  if(cfg.mode===2){ const even = m%2===0; const evenProg = cfg.m2Even||'A'; return even?evenProg:(evenProg==='A'?'B':'A'); }
  if(cfg.mode===3){ const idx = Math.floor((((m - cfg.m3Start)%12)+12)%12/6); return idx===0?cfg.m3First:(cfg.m3First==='A'?'B':'A'); }
  return 'A';
}
const weekKey = () => ymd(weekStart);
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
    storeMode='local'; ready.cfg = ready.logs = ready.programs = true;
    applyProgram('A', LS.get('programs/A')); applyProgram('B', LS.get('programs/B'));
    const c = LS.get('config/main'); if(c) cfg = {...structuredClone(DEFAULT_CFG), ...c};
    Object.keys(EX).forEach(id=>{ const l=LS.get('logs/'+id); if(l&&l.entries) logs[id]=l.entries; });
    subscribeWeek(); return;
  }
  storeMode='db';
  db.collection('programs').onSnapshot(s=>{ if(s.metadata.hasPendingWrites) return; const m={}; s.docs.forEach(d=>m[d.id]=d.data()); applyProgram('A', m.A); applyProgram('B', m.B); ready.programs = true; render(); }, ()=>flag('Couldn’t load your programs. Reload the page.'));
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
function progressionOf(item, ph){
  const byDay = {}; (logs[item.ex]||[]).filter(e=>(e.ph||null)===(ph||null)).forEach(e=>{ byDay[e.d]=e; });
  const L = Object.keys(byDay).sort().map(d=>byDay[d]);
  if(L.length<2) return null;
  const [a, b] = L.slice(-2); const w = Number(b.w);
  if(!(w>0) || !(Number(a.w)>=w)) return null;
  const m = rxOf(item, ph).match(/(\d+)\s*×\s*(\d+)/); if(!m) return null;
  const sets = Number(m[1]), reps = Number(m[2]);
  const full = e => ph==='iso' ? (Number(e.s)>=sets && Number(e.sec)>=30) : (Number(e.s)>=sets && Number(e.r)>=reps);
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
function describe(e){ if(!e) return ''; const load = e.w!=null && e.w!=='' ? `${e.w} lb` : 'BW'; const vol = e.sec? `${e.s||'?'} × ${e.sec}s` : `${e.s||'?'} × ${e.r||'?'}`; return `${load} · ${vol}`; }
const isSkipped = (s, w=week) => !!(w.skipped && w.skipped[s.id]);
function currentLayout(slots){
  const cols = {1:[],2:[],3:[],4:[],5:[],6:[]};
  slots.forEach(s=>{ const d = week.moved[s.id] || s.day; cols[d].push(s); });
  return cols;
}
