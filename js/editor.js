/* ---------- Program editor ---------- */
let edProg = null, edDay = 1, slotDraft = null;
const SECTIONS = ['Regular','Supersets','Plyometric','Home'];
function slotSummary(sl){ const names = sl.items.map(i=>exInfo(i.ex).n); return sl.type==='superset' ? names.join(' → ') : sl.type==='either' ? names.join(' or ') : names[0]; }
function renderEditor(){
  if(!edProg) edProg = activeProgKey();
  const prog = PROGRAMS[edProg]; const day = prog.days[edDay-1];
  const custom = prog !== BUILTIN[edProg];
  let h = `<div class="edtop"><div class="seg" role="group" aria-label="Program to edit">${['A','B'].map(k=>`<button class="${k===edProg?'on':''}" data-act="edprog" data-p="${k}" aria-pressed="${k===edProg}">Program ${k}</button>`).join('')}</div>`;
  h += `<div class="seg" role="group" aria-label="Day to edit">${[1,2,3,4,5,6].map(d=>`<button class="${d===edDay?'on':''}" data-act="edday" data-day="${d}" aria-pressed="${d===edDay}">Day ${d}</button>`).join('')}</div></div>`;
  h += `<section class="panel edpanel"><div class="inline" style="flex-wrap:wrap"><h2 style="margin-right:auto">Program ${edProg} · ${esc(day.title)}</h2></div>`;
  h += `<label class="field">Day label<input id="ed-sub" data-act="edsub" value="${esc(day.sub||'')}" placeholder="e.g. Lower body + reactive power"></label>`;
  h += `<div class="edlist">`;
  if(!day.slots.length) h += `<p class="note">No exercises on this day yet.</p>`;
  let lastSec=null;
  day.slots.forEach((sl,i)=>{
    if(sl.sec!==lastSec){ h+=`<div class="sect">${esc(sl.sec||'')}</div>`; lastSec=sl.sec; }
    const tag=[sl.tier, sl.type==='superset'?'Superset':sl.type==='either'?'Either / or':''].filter(Boolean).join(' · ');
    h += `<div class="edrow"><div class="edmain">${tag?`<span class="tag">${tag}</span>`:''}<b>${esc(slotSummary(sl))}</b><span class="note">${sl.items.map(it=>[it.ph?PHASES[it.ph].label:'No phase', it.w!=null?it.w+' lb':(it.bw?'BW':''), it.rx||''].filter(Boolean).join(' · ')).join('  |  ')}</span></div>
      <div class="edbtns"><button class="btn sm" data-act="edup" data-i="${i}" aria-label="Move up" ${i===0?'disabled':''}>↑</button><button class="btn sm" data-act="eddown" data-i="${i}" aria-label="Move down" ${i===day.slots.length-1?'disabled':''}>↓</button><button class="btn sm" data-act="edit" data-i="${i}">Edit</button><button class="btn sm ghost" data-act="eddel" data-i="${i}">Remove</button></div></div>`;
  });
  h += `</div><div class="actions" style="justify-content:flex-start"><button class="btn primary" data-act="edadd">Add exercise</button></div></section>`;
  h += `<p class="note" style="margin-top:12px">Changes apply to every week that uses Program ${edProg}. Your logged sets stay as they are.</p>`;
  if(custom) h += `<p><button class="btn sm ghost" data-act="edreset">Reset Program ${edProg} to the original</button></p>`;
  return h;
}
function saveProgram(k, prog){ const body = structuredClone(prog); delete body.key; PROGRAMS[k] = {...body, key:k}; save('programs/'+k, body); }
function editableProgram(){ return structuredClone(PROGRAMS[edProg]); }
function newSlotId(){ return `${edProg}-x${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`; }
function blankItem(){ return {ex:'', ph:'strength', w:null, bw:false, rx:'', note:''}; }
function openSlotEditor(i){
  const prog = PROGRAMS[edProg];
  const base = i==null ? {id:null, sec:'Regular', tier:'Accessory', type:'single', items:[blankItem()], note:''} : structuredClone(prog.days[edDay-1].slots[i]);
  base.type = base.type||'single'; base.day = edDay; base.idx = i;
  base.items = base.items.map(it=>({...blankItem(), ...it, rx:it.rx||'', note:it.note||''}));
  slotDraft = base; renderSlotSheet();
}
function renderSlotSheet(){
  const d = slotDraft; const exIds = allExIds().sort((a,b)=>exInfo(a).n.localeCompare(exInfo(b).n));
  const itemBlock = (it,k) => `<fieldset class="edit-item"><legend>${d.type==='superset'?(k?'B':'A'):d.type==='either'?(k?'Or':'Option 1'):'Exercise'}</legend>
    <label class="field">Exercise<select id="se-ex-${k}" data-act="sedraft">${it.ex===''?'<option value="" selected>Choose…</option>':''}${exIds.map(id=>`<option value="${id}" ${id===it.ex?'selected':''}>${esc(exInfo(id).n)}</option>`).join('')}<option value="__new" ${it.ex==='__new'?'selected':''}>+ New exercise…</option></select></label>
    ${it.ex==='__new'?`<div class="fields"><label class="field">Name<input id="se-nn-${k}" value="${esc(it.nn||'')}" placeholder="e.g. Cable Lateral Raise"></label><label class="field">Video link (optional)<input id="se-nu-${k}" type="url" value="${esc(it.nu||'')}" placeholder="https://"></label></div>`:''}
    <div class="fields"><label class="field">Phase<select id="se-ph-${k}"><option value="" ${!it.ph?'selected':''}>None</option>${PH_KEYS.map(p=>`<option value="${p}" ${p===it.ph?'selected':''}>${PHASES[p].label}</option>`).join('')}</select></label>
    <label class="field">Weight (lb)<input id="se-w-${k}" type="number" inputmode="decimal" step="any" min="0" value="${it.w??''}" placeholder="—"></label>
    <label class="field">Sets × reps<input id="se-rx-${k}" value="${esc(it.rx)}" placeholder="phase default"></label></div>
    <label class="inline"><input type="checkbox" id="se-bw-${k}" ${it.bw?'checked':''}> Bodyweight</label>
    <label class="field">Note<input id="se-no-${k}" value="${esc(it.note)}" placeholder="Form cue, setup"></label></fieldset>`;
  document.getElementById('modal').innerHTML = `<div class="scrim" data-act="close"><form class="sheet" id="slotform" novalidate>
    <h2 class="cond">${d.idx==null?'Add exercise':'Edit exercise'} · Program ${edProg}</h2>
    <div class="fields">
      <label class="field">Type<select id="se-type" data-act="sedraft"><option value="single" ${d.type==='single'?'selected':''}>Single</option><option value="superset" ${d.type==='superset'?'selected':''}>Superset (A → B)</option><option value="either" ${d.type==='either'?'selected':''}>Either / or</option></select></label>
      <label class="field">Section<select id="se-sec">${[...new Set([...SECTIONS, d.sec])].map(x=>`<option ${x===d.sec?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field">Tier<select id="se-tier"><option value="" ${!d.tier?'selected':''}>None</option><option ${d.tier==='Primary'?'selected':''}>Primary</option><option ${d.tier==='Accessory'?'selected':''}>Accessory</option></select></label>
      <label class="field">Day<select id="se-day">${[1,2,3,4,5,6].map(x=>`<option value="${x}" ${x===d.day?'selected':''}>Day ${x}</option>`).join('')}</select></label>
    </div>
    ${d.items.map(itemBlock).join('')}
    <label class="field">Card note<input id="se-note" value="${esc(d.note||'')}" placeholder="e.g. Whichever is free"></label>
    <p class="note" id="se-err" hidden></p>
    <div class="actions"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary">Save</button></div>
  </form></div>`;
}
function readSlotForm(){
  const d = slotDraft; const g = id => document.getElementById(id);
  d.type = g('se-type').value; d.sec = g('se-sec').value; d.tier = g('se-tier').value; d.day = Number(g('se-day').value); d.note = g('se-note').value.trim();
  d.items.forEach((it,k)=>{ it.ex = g('se-ex-'+k).value; if(g('se-nn-'+k)){ it.nn=g('se-nn-'+k).value.trim(); it.nu=g('se-nu-'+k).value.trim(); }
    it.ph = g('se-ph-'+k).value||null; const w=g('se-w-'+k).value; it.w = w===''?null:Number(w); it.rx=g('se-rx-'+k).value.trim(); it.bw=g('se-bw-'+k).checked; it.note=g('se-no-'+k).value.trim(); });
  const want = d.type==='single'?1:2; while(d.items.length<want) d.items.push(blankItem()); d.items.length = want;
  return d;
}
function slugFor(name){ let base = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'exercise'; let id=base, n=2; while(EX[id] || (cfg.ex[id] && cfg.ex[id].n!==name)) id = `${base}-${n++}`; return id; }
function saveSlotForm(){
  const d = readSlotForm(); const err = document.getElementById('se-err');
  for(const it of d.items){ if(!it.ex || (it.ex==='__new' && !it.nn)){ err.hidden=false; err.textContent='Choose an exercise, or type a name for the new one.'; return; } if(it.ex==='__new' && it.nu && !/^https?:\/\//.test(it.nu)){ err.hidden=false; err.textContent='Video link should start with https://'; return; } }
  let cfgChanged=false;
  const items = d.items.map(it=>{ let ex=it.ex; if(ex==='__new'){ ex=slugFor(it.nn); cfg.ex[ex]={n:it.nn, ...(it.nu?{url:it.nu}:{})}; cfgChanged=true; }
    const o={ex, ph:it.ph||null, w:it.w}; if(it.bw) o.bw=true; if(it.rx) o.rx=it.rx; if(it.note) o.note=it.note; return o; });
  if(cfgChanged) saveCfg();
  const slot = {id: d.id || newSlotId(), sec:d.sec, items}; if(d.tier) slot.tier=d.tier; if(d.type!=='single') slot.type=d.type; if(d.note) slot.note=d.note;
  const prog = editableProgram();
  if(d.idx!=null) prog.days[edDay-1].slots.splice(d.idx,1);
  const target = prog.days[d.day-1].slots;
  const orig = d.idx!=null ? PROGRAMS[edProg].days[edDay-1].slots[d.idx] : null;
  if(orig && d.day===edDay && orig.sec===slot.sec) target.splice(d.idx,0,slot);
  else { let at=-1; target.forEach((x,j)=>{ if(x.sec===slot.sec) at=j; }); if(at<0) at = slot.sec==='Home' ? target.length-1 : target.findIndex(x=>x.sec==='Home')-1; if(at<-1) at=target.length-1; target.splice(at+1,0,slot); }
  saveProgram(edProg, prog); closeModal(); render(); flag(d.day===edDay?'Saved':`Saved to Day ${d.day}`);
}
