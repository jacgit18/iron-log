/* ---------- Muscle map ---------- */
const MUSCLES = {
  traps:{n:'Traps'}, frontdelt:{n:'Front delts'}, sidedelt:{n:'Side delts'}, reardelt:{n:'Rear delts'},
  chest:{n:'Chest'}, biceps:{n:'Biceps'}, triceps:{n:'Triceps'}, forearms:{n:'Forearms & grip'},
  abs:{n:'Abs'}, obliques:{n:'Obliques'}, lats:{n:'Lats'}, upperback:{n:'Upper back'}, lowerback:{n:'Lower back'},
  glutes:{n:'Glutes'}, abductors:{n:'Outer hip (abductors)'}, adductors:{n:'Inner thigh (adductors)'}, hipflexors:{n:'Hip flexors'},
  quads:{n:'Quads'}, hamstrings:{n:'Hamstrings'}, calves:{n:'Calves'}, shins:{n:'Shins'},
};
const M_KEYS = Object.keys(MUSCLES);
// Default tags: p = primary, s = secondary. mob = mobility/stretch, not counted.
const MUSCLE_MAP = {
  latpd:{p:['lats'],s:['biceps','upperback','reardelt']}, latpdbi:{p:['lats'],s:['biceps','upperback','reardelt']},
  wristpd:{p:['forearms']}, platerot:{p:['obliques'],s:['abs']},
  innerthigh:{p:['adductors']}, outerthigh:{p:['abductors'],s:['glutes']}, romanadd:{p:['adductors'],s:['obliques']},
  qlext:{p:['lowerback','obliques']}, chestpress:{p:['chest'],s:['frontdelt','triceps']},
  zercher:{p:['lowerback'],s:['glutes','hamstrings','upperback']}, zottman:{p:['biceps','forearms']},
  kbleg:{p:['abs','hipflexors']}, grip:{p:['forearms']}, canoe:{mob:true},
  suitcase:{p:['forearms','obliques'],s:['traps']}, reardelt:{p:['reardelt'],s:['upperback']}, facepull:{p:['reardelt'],s:['upperback','traps']},
  legext:{p:['quads']}, cablecrunch:{p:['abs']}, hipthrust:{p:['glutes'],s:['hamstrings']},
  dip:{p:['triceps','chest'],s:['frontdelt']}, kneeraise:{p:['abs','hipflexors'],s:['forearms']},
  db6:{p:['frontdelt','sidedelt']}, hack:{p:['quads'],s:['glutes','adductors']},
  pallof:{p:['obliques','abs']}, cablerow:{p:['lats','upperback'],s:['reardelt','biceps']},
  deskbands:{mob:true}, arnold:{p:['frontdelt','sidedelt'],s:['triceps']},
  dbclean:{p:['quads','glutes','frontdelt'],s:['traps','triceps','hamstrings']},
  trxpike:{p:['frontdelt','triceps'],s:['abs']}, trxrow:{p:['upperback','reardelt'],s:['lats','biceps']},
  medball:{p:['obliques'],s:['glutes','abs']}, latwall:{p:['glutes','quads'],s:['abductors','calves']},
  spinal:{mob:true}, pogo:{p:['calves'],s:['shins']},
  skater:{p:['glutes','abductors','quads'],s:['adductors','calves']}, splitjump:{p:['quads','glutes'],s:['calves','hamstrings']},
  depthcombo:{p:['quads','glutes','calves'],s:['hamstrings']},
  farmers:{p:['forearms','traps'],s:['obliques','abs']}, dblunge:{p:['quads','glutes'],s:['adductors','hamstrings']},
  ohtri:{p:['triceps']}, bss:{p:['quads','glutes'],s:['adductors','hamstrings']}, legcurl:{p:['hamstrings'],s:['calves']},
  cablepunch:{p:['obliques','abs'],s:['chest','frontdelt']},
};
const tagsOf = id => (cfg.muscleMap && cfg.muscleMap[id]) || MUSCLE_MAP[id] || null;

// Left-half shapes (x < 100); mirrored for the right side.
const SIL = 'M100 44 L92 44 L92 56 Q72 58 62 62 Q50 66 48 84 L50 132 L44 170 L44 212 Q47 226 54 228 Q60 226 60 212 L64 150 L68 112 L72 150 L72 200 L68 214 Q64 270 72 322 Q68 360 74 404 L70 414 L97 414 L96 372 Q98 340 96 322 Q100 280 99 250 L100 244 Z';
const FRONT = [
  ['traps','M78 60 Q86 54 92 52 L92 58 Q86 60 80 63 Z'],
  ['sidedelt','M64 61 Q51 63 49 78 Q50 84 54 85 Q56 71 67 65 Z'],
  ['frontdelt','M69 64 Q58 70 57 85 Q62 92 70 90 Q74 77 77 66 Z'],
  ['chest','M77 66 Q96 61 99 65 L99 100 Q88 106 75 100 Q70 84 77 66 Z'],
  ['biceps','M55 91 Q51 111 55 132 Q62 136 66 130 Q68 110 67 94 Z'],
  ['forearms','M51 140 Q45 170 48 206 L58 208 Q64 176 64 140 Z'],
  ['obliques','M76 104 Q84 106 87 110 Q84 150 88 190 L78 192 Q72 150 76 104 Z'],
  ['abs','M89 106 L99 106 L99 190 L91 190 Q87 150 89 106 Z'],
  ['hipflexors','M80 197 L95 201 L91 221 L82 212 Z'],
  ['quads','M70 216 Q66 262 74 316 Q84 322 92 316 Q95 292 93 266 Q86 244 83 216 Z'],
  ['adductors','M92 223 Q98 227 98 234 L96 282 Q88 272 87 242 Z'],
  ['shins','M78 336 Q74 362 78 396 L86 396 Q88 362 86 336 Z'],
];
const BACK = [
  ['traps','M84 48 L100 44 L100 98 Q90 86 72 66 Q80 58 84 48 Z'],
  ['reardelt','M66 62 Q52 66 50 82 Q56 88 66 86 Q70 74 72 66 Z'],
  ['lats','M70 78 Q66 102 76 132 Q86 150 97 158 L98 124 Q84 112 78 96 Z'],
  ['upperback','M79 72 Q92 82 99 100 L99 120 Q88 114 80 100 Z'],
  ['triceps','M54 89 Q50 110 54 134 Q62 138 66 132 Q68 110 65 91 Z'],
  ['forearms','M51 140 Q45 170 48 206 L58 208 Q64 176 64 140 Z'],
  ['lowerback','M88 142 L99 152 L99 196 L88 196 Q84 170 88 142 Z'],
  ['abductors','M70 196 Q66 210 70 226 Q74 214 84 202 Z'],
  ['glutes','M73 202 Q70 230 80 246 Q94 250 99 240 L99 204 Q86 196 73 202 Z'],
  ['hamstrings','M72 252 Q68 290 76 322 L94 322 Q98 290 96 254 Q86 258 72 252 Z'],
  ['calves','M76 334 Q70 358 78 382 L90 382 Q96 358 90 334 Z'],
];
let bodyView = null, bodySel = null;
function muscleVolume(progKey){
  const prog = PROGRAMS[progKey]||PROGRAMS.A; const vol = {}; M_KEYS.forEach(k=>vol[k]={sets:0, ex:[]});
  const untagged = new Set();
  const live = progKey===activeProgKey();
  slotsFor(prog).forEach(sl=>sl.items.forEach((it,idx)=>{
    const tg = tagsOf(it.ex); if(!tg){ untagged.add(it.ex); return; } if(tg.mob) return;
    const ph = live ? phaseOf(sl, idx) : (cfg.phDef[`${sl.id}:${idx}`] ?? it.ph ?? null);
    const m = rxOf(it, ph).match(/(\d+)\s*×/); const sets = (m?Number(m[1]):3) * (sl.type==='either' ? 0.5 : 1);
    const day = (live && week.moved[sl.id]) || sl.day;
    (bodySec ? [['p',1],['s',0.5]] : [['p',1]]).forEach(([k,f])=> (tg[k]||[]).forEach(mu=>{ if(!vol[mu]) return; vol[mu].sets += sets*f; vol[mu].ex.push({ex:it.ex, role:k, day, sets, either: sl.type==='either'}); }));
  }));
  return {vol, untagged:[...untagged]};
}
const level = s => s<=0 ? 0 : s<5 ? 1 : s<10 ? 2 : s<=20 ? 3 : 4;
let bodySec = true;
const fmtSets = n => (Math.round(n*2)/2).toString();
function figure(shapes, label, vol){
  const mir = 'matrix(-1 0 0 1 200 0)';
  const parts = shapes.map(([m,d])=>{ const lv=level(vol[m].sets); const cls=`mu l${lv}${bodySel===m?' sel':''}`; const t=`<title>${MUSCLES[m].n}: ${vol[m].sets?fmtSets(vol[m].sets)+' sets/week':'not trained'}</title>`;
    return `<path class="${cls}" d="${d}" data-act="muscle" data-m="${m}">${t}</path><path class="${cls}" d="${d}" transform="${mir}" data-act="muscle" data-m="${m}">${t}</path>`; }).join('');
  return `<figure class="fig"><svg viewBox="30 0 140 420" role="group" aria-label="${label} view"><circle class="sil" cx="100" cy="26" r="17"/><path class="sil" d="${SIL}"/><path class="sil" d="${SIL}" transform="${mir}"/>${parts}</svg><figcaption>${label}</figcaption></figure>`;
}
function renderBody(){
  if(!bodyView) bodyView = activeProgKey();
  const {vol, untagged} = muscleVolume(bodyView);
  const cur = activeProgKey();
  let h = `<div class="edtop"><div class="seg" role="group" aria-label="Program">${['A','B'].map(k=>`<button class="${k===bodyView?'on':''}" data-act="bodyprog" data-p="${k}" aria-pressed="${k===bodyView}">Program ${k}${k===cur?' · on board':''}</button>`).join('')}</div></div>`;
  h += `<div class="bodywrap"><div class="figs">${figure(FRONT,'Front',vol)}${figure(BACK,'Back',vol)}</div><div class="bodyside">`;
  h += `<div class="legend"><span><i class="sw l0"></i>Not trained</span><span><i class="sw l1"></i>1–4 sets</span><span><i class="sw l2"></i>5–9</span><span><i class="sw l3"></i>10–20</span><span><i class="sw l4"></i>Over 20</span><span class="note">per week</span></div>
  <label class="inline"><input type="checkbox" id="body-sec" data-act="bodysec" ${bodySec?'checked':''}> Count secondary work (as half a set)</label>`;
  if(bodySel){
    const v = vol[bodySel]; const grouped = {};
    v.ex.forEach(e=>{ const k=e.ex+'|'+e.role; (grouped[k] = grouped[k] || {...e, days:[]}).days.push(e.day); });
    const rows = Object.values(grouped).sort((a,b)=> a.role===b.role ? a.days[0]-b.days[0] : a.role==='p'?-1:1);
    h += `<section class="panel"><div class="inline" style="justify-content:space-between"><h2>${MUSCLES[bodySel].n}</h2><button class="btn sm ghost" data-act="muscle" data-m="">Close</button></div>
      <p>${v.sets ? `About <b>${fmtSets(v.sets)}</b> sets a week in Program ${bodyView}.${bodySec?' Secondary work counts as half a set.':' Primary work only.'}` : `Nothing in Program ${bodyView} trains this.`}</p>
      ${rows.length?`<div class="mlist">${rows.map(r=>`<div class="mrow"><span class="role ${r.role}">${r.role==='p'?'Primary':'Secondary'}</span><span class="mname">${esc(exInfo(r.ex).n)}${r.either?' <small>(either/or)</small>':''}</span><span class="mdays">${[...new Set(r.days)].sort().map(d=>'D'+d).join(' ')}</span><button class="btn sm ghost" data-act="tagex" data-ex="${r.ex}">Edit</button></div>`).join('')}</div>`:''}
    </section>`;
  } else {
    const ranked = M_KEYS.map(k=>({k, s:vol[k].sets})).sort((a,b)=>b.s-a.s);
    const none = ranked.filter(r=>!r.s);
    h += `<section class="panel"><h2>Weekly sets by muscle</h2><p>Tap a muscle on the body or in this list to see the exercises that train it.</p><div class="mbars">${ranked.filter(r=>r.s).map(r=>`<button class="mbar" data-act="muscle" data-m="${r.k}"><span>${MUSCLES[r.k].n}</span><span class="track"><i class="l${level(r.s)}" style="width:${Math.min(100, r.s/ Math.max(...ranked.map(x=>x.s)) *100)}%"></i></span><b>${fmtSets(r.s)}</b></button>`).join('')}</div>
      ${none.length?`<p><b>Not trained:</b> ${none.map(r=>`<button class="linkbtn" data-act="muscle" data-m="${r.k}">${MUSCLES[r.k].n}</button>`).join(', ')}</p>`:''}</section>`;
  }
  if(untagged.length) h += `<section class="panel"><h2>Not mapped yet</h2><p>These exercises have no muscles tagged, so they don't show on the body.</p><div class="mlist">${untagged.map(id=>`<div class="mrow"><span class="mname">${esc(exInfo(id).n)}</span><button class="btn sm" data-act="tagex" data-ex="${id}">Tag muscles</button></div>`).join('')}</div></section>`;
  h += `<p class="note">Muscle tags are a best guess for each exercise. Tap Edit on any exercise to correct them.</p></div></div>`;
  return h;
}
let tagDraft = null;
function openTagEditor(exId){
  const tg = tagsOf(exId) || {}; tagDraft = {ex:exId, mob:!!tg.mob, st:{}}; (tg.p||[]).forEach(m=>tagDraft.st[m]='p'); (tg.s||[]).forEach(m=>tagDraft.st[m]='s');
  drawTagSheet();
}
function drawTagSheet(){
  const d = tagDraft; const custom = !!(cfg.muscleMap && cfg.muscleMap[d.ex]);
  document.getElementById('modal').innerHTML = `<div class="scrim" data-act="close"><div class="sheet"><h2 class="cond">${esc(exInfo(d.ex).n)}</h2>
    <p class="note">Tap a muscle to cycle: not used → secondary → primary.</p>
    <div class="chips">${M_KEYS.map(m=>`<button class="chip ${d.st[m]||''}" data-act="tagcycle" data-m="${m}" aria-pressed="${!!d.st[m]}">${MUSCLES[m].n}${d.st[m]==='p'?' · P':d.st[m]==='s'?' · S':''}</button>`).join('')}</div>
    <label class="inline"><input type="checkbox" id="tag-mob" ${d.mob?'checked':''} data-act="tagmob"> Mobility or stretch (don't count toward muscles)</label>
    <div class="actions">${custom && MUSCLE_MAP[d.ex] ? '<button class="btn ghost" data-act="tagreset" style="margin-right:auto">Use default</button>':''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="tagsave">Save</button></div></div></div>`;
}
