/* ---------- Timers ---------- */
const T = {mode:null, label:'', end:0, dur:0, paused:null, sets:0, set:0, hold:0, iv:null, lock:null, beeped:{}};
let actx=null;
function beep(freq=880, ms=160){ try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); const o=actx.createOscillator(), g=actx.createGain(); o.frequency.value=freq; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(0.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime+ms/1000); o.start(); o.stop(actx.currentTime+ms/1000); }catch(e){} }
function buzz(p){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }
async function wake(on){ try{ if(on && !T.lock && navigator.wakeLock){ T.lock = await navigator.wakeLock.request('screen'); T.lock.addEventListener && T.lock.addEventListener('release',()=>{ T.lock=null; }); } else if(!on && T.lock){ await T.lock.release(); T.lock=null; } }catch(e){ T.lock=null; } }
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && T.mode) wake(true); });
const restSecs = () => Math.max(0, Number(cfg.rest ?? 90));
function startTimer(mode, secs, label){ T.mode=mode; T.dur=secs; T.end=Date.now()+secs*1000; T.paused=null; T.label=label; T.beeped={}; clearInterval(T.iv); T.iv=setInterval(tick,250); wake(true); try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); actx.resume && actx.resume(); }catch(e){} tick(); }
function startRest(){ T.sets=0; startTimer('rest', restSecs()||90, 'Rest'); }
function startHold(exName, sets, hold){ T.sets=sets; T.set=1; T.hold=hold; T.exName=exName; startTimer('hold', hold, `Hold · ${exName}`); }
function stopTimer(){ clearInterval(T.iv); T.iv=null; T.mode=null; wake(false); drawTimer(); }
function remaining(){ return T.paused!=null ? T.paused : Math.max(0, (T.end-Date.now())/1000); }
function tick(){
  const r = remaining(); const whole=Math.ceil(r);
  if(T.paused==null && whole<=3 && whole>0 && !T.beeped[whole]){ T.beeped[whole]=1; beep(660,90); }
  if(T.paused==null && r<=0){
    beep(990,300); buzz([200,80,200]);
    if(T.mode==='hold' && T.sets){ const rs=restSecs(); if(T.set<T.sets){ if(rs>0){ startTimer('holdrest', rs, `Rest · then hold ${T.set+1}/${T.sets}`); return; } T.set++; startTimer('hold', T.hold, `Hold · ${T.exName}`); return; } stopTimer(); flag(`${T.exName}: all ${T.sets} holds done`); return; }
    if(T.mode==='holdrest'){ T.set++; startTimer('hold', T.hold, `Hold · ${T.exName}`); return; }
    stopTimer(); return;
  }
  drawTimer();
}
const mmss = sec => { const s=Math.ceil(sec); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
function drawTimer(){
  let el = document.getElementById('timerbar'); document.body.classList.toggle('timing', !!T.mode);
  if(!T.mode){ if(el) el.hidden=true; const f=document.getElementById('restfab'); if(f) f.hidden = tab!=='board'; return; }
  const f=document.getElementById('restfab'); if(f) f.hidden=true;
  el.hidden=false; const r=remaining();
  el.dataset.mode = T.mode.startsWith('hold') && T.mode!=='holdrest' ? 'hold' : 'rest';
  document.getElementById('tb-label').textContent = T.mode==='hold' && T.sets ? `Hold ${T.set}/${T.sets} · ${T.exName}` : T.label;
  document.getElementById('tb-time').textContent = mmss(r);
  document.getElementById('tb-bar').style.width = `${Math.max(0,Math.min(100, (1-r/T.dur)*100))}%`;
  document.getElementById('tb-pause').textContent = T.paused!=null ? 'Resume' : 'Pause';
}
function holdPlan(slot, idx){
  const it = slot.items[idx]; const ph = phaseOf(slot, idx); const rx = rxOf(it, ph);
  const m = rx.match(/(\d+)\s*×\s*(\d+)(?:\s*[–-]\s*(\d+))?/); const sets = m?Number(m[1]):4;
  const last = lastLog(it.ex, 'iso'); const hold = (last && last.sec) ? Number(last.sec) : (m?Number(m[2]):30);
  return {sets, hold};
}

function addEntry(slot, idx, entry, {check}={}){
  const it = slot.items[idx]; const arr = logs[it.ex] = [...(logs[it.ex]||[]), JSON.parse(JSON.stringify(entry))];
  arr.sort((a,b)=>a.d.localeCompare(b.d)); saveLog(it.ex);
  if(check){ week.done[slot.id]=true; if(week.skipped) delete week.skipped[slot.id]; }
  saveWeek();
}
function quickLog(slotId, idx){
  const prog=PROGRAMS[activeProgKey()]||PROGRAMS.A; const sl=slotsFor(prog).find(x=>x.id===slotId); if(!sl) return;
  const ph = phaseOf(sl, idx); const last = lastLog(sl.items[idx].ex, ph); if(!last) return;
  const e = {d:defaultLogDate(), ph:last.ph||null, w:last.w, s:last.s, slot:slotId, wk:weekKey()}; if(last.sec!=null) e.sec=last.sec; else e.r=last.r;
  addEntry(sl, idx, e, {check: sl.items.length===1 || sl.items.every((it,k)=>k===idx || (logs[it.ex]||[]).some(x=>x.wk===weekKey() && x.slot===slotId))});
  render(); flag(`Logged ${describe(e)}`);
}
