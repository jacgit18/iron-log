/* ---------- Events ---------- */
let downOnScrim = false;
document.addEventListener('pointerdown', e=>{ downOnScrim = !!(e.target.classList && e.target.classList.contains('scrim')); }, true);
function blocked(){ if(isReady()) return false; flag('Still loading your data…'); render(); return true; }
const MUTATE = new Set(['tagsave','tagreset','repeat','rests','edsub','edup','eddown','eddel','edreset','edadd','edit','check','day','warm','move','phase','mode','m3s','m3f','m2e','pct','rxo','rm','setprog','pull','dellog','log']);
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]'); if(!t) return;
  const a = t.dataset.act;
  if(MUTATE.has(a) && blocked()) return;
  if(a==='close'){ if(e.target===t && (!t.classList.contains('scrim') || downOnScrim)) closeModal(); return; }
  if(a==='prev'||a==='next'||a==='today'){ mDay=null; weekStart = a==='today'? monday(new Date()) : addDays(weekStart, a==='prev'?-7:7); subscribeWeek(); render(); }
  if(a==='log'){ openLog(t.dataset.slot, Number(t.dataset.idx)); }
  if(a==='detail'){ openDetail(t.dataset.ex); }
  if(a==='fillLast'){ const f=document.getElementById('logform'); const prog=PROGRAMS[activeProgKey()]||PROGRAMS.A; const sl=slotsFor(prog).find(x=>x.id===f.dataset.slot); const i=Number(f.dataset.idx); const L=lastLog(sl.items[i].ex, document.getElementById('f-ph').value||null); if(!L) return; document.getElementById('f-w').value=L.w??''; document.getElementById('f-s').value=L.s??''; document.getElementById('f-r').value=(L.sec??L.r)??''; return; }
  if(a==='muscle'){ bodySel = t.dataset.m || null; render(); return; }
  if(a==='bodyprog'){ bodyView = t.dataset.p; render(); return; }
  if(a==='tagex'){ openTagEditor(t.dataset.ex); return; }
  if(a==='tagcycle'){ const m=t.dataset.m; const c=tagDraft.st[m]; if(!c) tagDraft.st[m]='s'; else if(c==='s') tagDraft.st[m]='p'; else delete tagDraft.st[m]; drawTagSheet(); return; }
  if(a==='tagmob'){ tagDraft.mob = t.checked; return; }
  if(a==='tagreset'){ if(cfg.muscleMap) delete cfg.muscleMap[tagDraft.ex]; saveCfg(); closeModal(); render(); return; }
  if(a==='tagsave'){ const st=tagDraft.st; const o={p:M_KEYS.filter(m=>st[m]==='p'), s:M_KEYS.filter(m=>st[m]==='s')}; if(tagDraft.mob) o.mob=true; cfg.muscleMap = cfg.muscleMap||{}; cfg.muscleMap[tagDraft.ex]=o; saveCfg(); closeModal(); render(); flag('Muscles saved'); return; }
  if(a==='export'){ exportCsv(t); return; }
  if(a==='repeat'){ quickLog(t.dataset.slot, Number(t.dataset.idx)); return; }
  if(a==='rest'){ startRest(); return; }
  if(a==='hold'){ const prog=PROGRAMS[activeProgKey()]||PROGRAMS.A; const sl=slotsFor(prog).find(x=>x.id===t.dataset.slot); if(!sl) return; const i=Number(t.dataset.idx); const hp=holdPlan(sl,i); startHold(exInfo(sl.items[i].ex).n, hp.sets, hp.hold); return; }
  if(a==='tbstop'){ stopTimer(); return; }
  if(a==='tbpause'){ if(T.paused!=null){ T.end=Date.now()+T.paused*1000; T.paused=null; } else T.paused=remaining(); drawTimer(); return; }
  if(a==='tbplus'||a==='tbminus'){ const d=a==='tbplus'?15:-15; if(T.paused!=null) T.paused=Math.max(1,T.paused+d); else T.end=Math.max(Date.now()+1000, T.end+d*1000); T.dur=Math.max(T.dur, remaining()); drawTimer(); return; }
  if(a==='edprog'){ edProg=t.dataset.p; render(); return; }
  if(a==='edday'){ edDay=Number(t.dataset.day); render(); return; }
  if(a==='edadd'){ openSlotEditor(null); return; }
  if(a==='edit'){ openSlotEditor(Number(t.dataset.i)); return; }
  if(a==='edup'||a==='eddown'){ const i=Number(t.dataset.i), j=i+(a==='edup'?-1:1); const prog=editableProgram(); const sl=prog.days[edDay-1].slots; if(j<0||j>=sl.length) return; [sl[i],sl[j]]=[sl[j],sl[i]]; saveProgram(edProg,prog); render(); return; }
  if(a==='eddel'){ if(t.dataset.armed!=='1'){ t.dataset.armed='1'; t.textContent='Remove?'; setTimeout(()=>{ if(t.isConnected){ t.dataset.armed=''; t.textContent='Remove'; } },3000); return; } const prog=editableProgram(); prog.days[edDay-1].slots.splice(Number(t.dataset.i),1); saveProgram(edProg,prog); render(); return; }
  if(a==='edreset'){ if(t.dataset.armed!=='1'){ t.dataset.armed='1'; t.textContent=`Tap again to reset Program ${edProg}`; setTimeout(()=>{ if(t.isConnected){ t.dataset.armed=''; t.textContent=`Reset Program ${edProg} to the original`; } },3000); return; } PROGRAMS[edProg]=BUILTIN[edProg]; removeDoc('programs/'+edProg); render(); flag('Reset'); return; }
  if(a==='hidetip'){ try{ localStorage.setItem('ironlog:hidetip','1'); }catch(e){} render(); return; }
  if(a==='mday'){ mDay=Number(t.dataset.day); render(); window.scrollTo({top:0}); return; }
  if(a==='setprog'){ const k=t.dataset.p; if(k===programFor(weekStart)) week.prog=null; else week.prog=k; saveWeek(); render(); }
  if(a==='pull'){ const prog=PROGRAMS[activeProgKey()]||PROGRAMS.A; slotsFor(prog).forEach(s=>{ if(s.day<5 && (week.moved[s.id]||s.day)<5 && !week.done[s.id]) week.moved[s.id]=5; }); saveWeek(); render(); }
  if(a==='dellog'){ if(t.dataset.armed!=='1'){ t.dataset.armed='1'; t.textContent='Delete?'; setTimeout(()=>{ if(t.isConnected){ t.dataset.armed=''; t.textContent='✕'; } },3000); return; } const ex=t.dataset.ex, i=Number(t.dataset.i); logs[ex].splice(i,1); saveLog(ex); render(); openDetail(ex); }
});
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{ tab=b.dataset.tab; if(tab==='progress') { weekHist=null; } render(); }));

document.addEventListener('change', e=>{
  const t = e.target; const a = t.dataset && t.dataset.act; if(!a) return;
  if(MUTATE.has(a) && blocked()) return;
  if(a==='check'){ if(t.checked) week.done[t.dataset.slot]=true; else delete week.done[t.dataset.slot]; saveWeek(); render(); }
  if(a==='day'){ const prog=PROGRAMS[activeProgKey()]||PROGRAMS.A; const d=Number(t.dataset.day); currentLayout(slotsFor(prog))[d].forEach(s=>{ if(t.checked) week.done[s.id]=true; else delete week.done[s.id]; }); saveWeek(); render(); }
  if(a==='warm'){ const d=t.dataset.day; week.warm[d]=week.warm[d]||{}; week.warm[d][t.dataset.w]=t.checked; saveWeek(); }
  if(a==='move'){ moveSlot(t.dataset.slot, Number(t.value)); }
  if(a==='phase'){ week.ph[`${t.dataset.slot}:${t.dataset.idx}`]=t.value; saveWeek(); render(); }
  if(a==='sedraft'){ readSlotForm(); renderSlotSheet(); return; }
  if(a==='edsub'){ const prog=editableProgram(); const v=t.value.trim(); if(v) prog.days[edDay-1].sub=v; else delete prog.days[edDay-1].sub; saveProgram(edProg,prog); return; }
  if(a==='mode'){ cfg.mode=Number(t.value); saveCfg(); render(); }
  if(a==='m3s'){ cfg.m3Start=Number(t.value); saveCfg(); render(); }
  if(a==='m3f'){ cfg.m3First=t.value; saveCfg(); render(); }
  if(a==='m2e'){ cfg.m2Even=t.value; saveCfg(); render(); }
  if(a==='pct'){ const n=Number(t.value); if(t.value!=='' && !isNaN(n)) { cfg.pct[t.dataset.p]=n; saveCfg(); } }
  if(a==='rxo'){ const v=t.value.trim(); if(v && v!==PHASES[t.dataset.p].rx) cfg.rxOverride[t.dataset.p]=v; else delete cfg.rxOverride[t.dataset.p]; saveCfg(); }
  if(a==='rests'){ const n=Number(t.value); if(t.value!=='' && n>=0){ cfg.rest=n; saveCfg(); } return; }
  if(a==='bodysec'){ bodySec = t.checked; render(); return; }
  if(a==='rm'){ const n=Number(t.value); if(t.value===''||!(n>0)) delete cfg.rm[t.dataset.ex]; else cfg.rm[t.dataset.ex]=n; saveCfg(); }
});

function moveSlot(slotId, day){
  const prog=PROGRAMS[activeProgKey()]||PROGRAMS.A; const s=slotsFor(prog).find(x=>x.id===slotId); if(!s) return;
  if(day===s.day) delete week.moved[slotId]; else week.moved[slotId]=day;
  saveWeek(); render(); flag(`Moved to Day ${day}`);
}

document.addEventListener('submit', e=>{
  if(e.target.id==='slotform'){ e.preventDefault(); if(!blocked()) saveSlotForm(); return; }
  if(e.target.id!=='logform') return; e.preventDefault();
  if(blocked()) return;
  const f=e.target; const slotId=f.dataset.slot, idx=Number(f.dataset.idx);
  const prog=PROGRAMS[activeProgKey()]||PROGRAMS.A; const s=slotsFor(prog).find(x=>x.id===slotId); const it=s.items[idx];
  const ph=document.getElementById('f-ph').value||null;
  const num = id => { const v=document.getElementById(id).value; return v===''?null:Number(v); };
  const entry = {d:document.getElementById('f-d').value||ymd(new Date()), ph, w:num('f-w'), s:num('f-s'), n:document.getElementById('f-n').value.trim()||undefined, slot:slotId, wk:weekKey()};
  if(ph==='iso') entry.sec=num('f-r'); else entry.r=num('f-r');
  const arr = logs[it.ex] = [...(logs[it.ex]||[]), JSON.parse(JSON.stringify(entry))];
  arr.sort((a,b)=>a.d.localeCompare(b.d));
  saveLog(it.ex);
  const key=`${slotId}:${idx}`;
  if(ph && ph!==phaseOf(s,idx)) { week.ph[key]=ph; }
  if(document.getElementById('f-def').checked && ph){ cfg.phDef[key]=ph; delete week.ph[key]; saveCfg(); }
  const rmv=document.getElementById('f-rm').value; const rmn=Number(rmv);
  if(rmv==='' ? cfg.rm[it.ex]!=null : (rmn>0 && rmn!==cfg.rm[it.ex])){ if(rmv==='') delete cfg.rm[it.ex]; else cfg.rm[it.ex]=rmn; saveCfg(); }
  if(document.getElementById('f-done').checked) week.done[slotId]=true;
  saveWeek(); closeModal(); render();
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

/* Drag and drop (desktop) */
let dragId=null;
document.addEventListener('dragstart', e=>{ const c=e.target.closest && e.target.closest('.card'); if(!c) return; dragId=c.dataset.slot; c.classList.add('dragging'); try{ e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed='move'; }catch(_){} });
document.addEventListener('dragend', e=>{ document.querySelectorAll('.dragging,.over').forEach(x=>x.classList.remove('dragging','over')); dragId=null; });
document.addEventListener('dragover', e=>{ const col=e.target.closest && e.target.closest('.col'); if(!col||!dragId) return; e.preventDefault(); document.querySelectorAll('.col.over').forEach(x=>x!==col&&x.classList.remove('over')); col.classList.add('over'); });
document.addEventListener('drop', e=>{ const col=e.target.closest && e.target.closest('.col'); if(!col||!dragId) return; e.preventDefault(); const id=dragId; dragId=null; if(blocked()) return; moveSlot(id, Number(col.dataset.day)); });

/* Swipe between days on phones */
let sx0=null, sy0=null;
document.addEventListener('touchstart', e=>{ if(!e.target.closest('.board')||e.target.closest('select,input,button,a')) { sx0=null; return; } sx0=e.touches[0].clientX; sy0=e.touches[0].clientY; }, {passive:true});
document.addEventListener('touchend', e=>{ if(sx0==null||!window.matchMedia('(max-width:700px)').matches) return; const dx=e.changedTouches[0].clientX-sx0, dy=e.changedTouches[0].clientY-sy0; sx0=null; if(Math.abs(dx)>70 && Math.abs(dy)<45){ const n=Math.min(6,Math.max(1,(mDay||1)+(dx<0?1:-1))); if(n!==mDay){ mDay=n; render(); } } }, {passive:true});
init();
