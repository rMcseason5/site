/* =====================================================================
   RMC Admin — race control panel
   Access is gated by a password check performed with SHA-256 (Web Crypto).
   The password itself is never stored as plain text in this file.
   After editing, use "Download data.json" and replace the file in your
   GitHub repository (commit + push) so the live site picks up the changes.
   ===================================================================== */

const ADMIN_HASH='b04f3be33c556e6936d1027643b8bb2700c6926b2acbd6be9d83963b6a7dd035';
const SESSION_KEY='rmc_admin_session';

async function sha256(text){
  const enc=new TextEncoder().encode(text);
  const buf=await crypto.subtle.digest('SHA-256',enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* Converts an ISO datetime string to the value format <input type="datetime-local"> expects (YYYY-MM-DDTHH:mm), in local time. Returns '' if empty/invalid. */
function toLocalInputValue(isoString){
  if(!isoString) return '';
  const d=new Date(isoString);
  if(isNaN(d.getTime())) return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let WORKING_DATA=null;
let dirty=false;

function showToast(msg,isError){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='toast show'+(isError?' error':'');
  clearTimeout(showToast._t);
  showToast._t=setTimeout(()=>t.classList.remove('show'),2600);
}

/* ---------- Gate ---------- */
async function tryLogin(pass){
  const hash=await sha256(pass);
  if(hash===ADMIN_HASH){
    sessionStorage.setItem(SESSION_KEY,'1');
    return true;
  }
  return false;
}

document.getElementById('gateForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const input=document.getElementById('gatePass');
  const err=document.getElementById('gateErr');
  const ok=await tryLogin(input.value);
  if(ok){
    err.textContent='';
    enterAdmin();
  }else{
    err.textContent='Palavra-passe incorreta.';
    input.value='';
    input.focus();
  }
});

document.getElementById('logoutBtn')?.addEventListener('click',()=>{
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

async function enterAdmin(){
  document.getElementById('adminGate').style.display='none';
  const shell=document.getElementById('adminShell');
  shell.classList.add('visible');
  const res=await fetch('data.json',{cache:'no-store'});
  WORKING_DATA=await res.json();
  renderAll();
}

/* Auto re-enter if a valid session already exists this tab */
(function checkSession(){
  if(sessionStorage.getItem(SESSION_KEY)==='1'){
    enterAdmin();
  }
})();

/* ---------- Tabs ---------- */
document.querySelectorAll('.admin-tabs button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.admin-tabs button').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
  });
});

function renderAll(){
  renderRaceSelector();
  renderDriversAdmin();
  renderTeamsAdmin();
}

/* ================= RACES / RESULTS TAB ================= */
function renderRaceSelector(){
  const sel=document.getElementById('adminRaceSelect');
  sel.innerHTML=WORKING_DATA.races.map(r=>`<button class="race-pill ${r.completed?'active':''}" data-round="${r.round}">R${r.round} · ${r.name}${r.completed?' ✓':''}</button>`).join('');
  sel.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    sel.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    renderRaceEditor(+b.dataset.round);
  }));
  const firstIncomplete=WORKING_DATA.races.find(r=>!r.completed)||WORKING_DATA.races[0];
  renderRaceEditor(firstIncomplete.round);
}

function renderRaceEditor(round){
  const race=WORKING_DATA.races.find(r=>r.round===round);
  const container=document.getElementById('raceEditorBody');

  if(!race.results.length){
    race.results=WORKING_DATA.drivers.map(d=>({driverSlug:d.slug,gap:'',penalty:0,lapsLed:0,points:0}));
  }
  if(!race.qualifying) race.qualifying={completed:false,results:[],pointsSystem:WORKING_DATA.pointsSystem.slice()};
  if(!race.qualifying.results.length){
    race.qualifying.results=WORKING_DATA.drivers.map(d=>({driverSlug:d.slug,time:'',points:0}));
  }

  container.innerHTML=`
    <div class="admin-card">
      <h3>${race.name} — Round ${race.round}</h3>
      <div class="admin-form-grid" style="margin-bottom:20px">
        <div><label>Data e hora da corrida</label><input type="datetime-local" id="raceDateTime" value="${toLocalInputValue(race.raceDateTime)}"></div>
        <div><label>Fuso horário</label><input type="text" value="Hora local do teu navegador" disabled style="opacity:.5"></div>
        <div><label>Pole position time</label><input type="text" id="poleTime" value="${race.poleTime||''}" placeholder="1:40.994"></div>
        <div><label>Fastest lap time</label><input type="text" id="fastestLapTime" value="${race.fastestLapTime||''}" placeholder="1:41.782"></div>
      </div>

      <div class="session-tabs" id="editorSessionTabs">
        <button class="active" data-s="qualifying">Qualifying</button>
        <button data-s="race">Race</button>
      </div>

      <div class="drag-hint">Arrasta os pilotos pela pega <b>⠿</b> para reordenar por posição. A posição é sempre a ordem da lista.</div>

      <div id="editorPanels">
        <div class="editor-panel" data-panel="qualifying">
          <div class="admin-grid-row admin-grid-head drag-head"><span></span><span>POS</span><span>DRIVER</span><span>TIME</span><span>POINTS</span><span></span></div>
          <div id="qualyRows" class="drag-list"></div>
        </div>
        <div class="editor-panel" data-panel="race" style="display:none">
          <div class="admin-grid-row admin-grid-head drag-head-race"><span></span><span>POS</span><span>DRIVER</span><span>GAP</span><span>PENALTY (s)</span><span>LAPS LED</span><span>POINTS</span><span></span></div>
          <div id="raceRows" class="drag-list"></div>
        </div>
      </div>

      <div class="admin-actions">
        <button class="admin-btn ghost" id="saveDateBtn" type="button">💾 Guardar apenas a data/hora</button>
        <button class="admin-btn ghost" id="autoPointsBtn" type="button">Auto-fill points by current order</button>
        <button class="admin-btn ghost" id="addDriverToSessionBtn" type="button">+ Add missing driver</button>
      </div>
      <div class="admin-actions">
        <button class="admin-btn primary" id="saveRaceBtn" type="button">${race.completed?'Save changes':'Mark race as completed & save'}</button>
        ${race.completed?'<button class="admin-btn danger" id="resetRaceBtn" type="button">Reset this race (clear results)</button>':''}
      </div>
    </div>`;

  let activeSession='qualifying';

  function driverName(slug){
    const d=WORKING_DATA.drivers.find(x=>x.slug===slug);
    return d?d.name:'(piloto removido)';
  }

  function makeDragList(listEl, dataArr, rowRenderer, onReorder){
    listEl.innerHTML=dataArr.map((item,i)=>rowRenderer(item,i)).join('');
    let dragFrom=null;

    listEl.querySelectorAll('.admin-grid-row').forEach(row=>{
      row.addEventListener('dragstart',()=>{ dragFrom=+row.dataset.i; row.classList.add('dragging'); });
      row.addEventListener('dragend',()=>{ row.classList.remove('dragging'); listEl.querySelectorAll('.drag-over').forEach(r=>r.classList.remove('drag-over')); });
      row.addEventListener('dragover',e=>{
        e.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
      row.addEventListener('drop',e=>{
        e.preventDefault();
        row.classList.remove('drag-over');
        const dragTo=+row.dataset.i;
        if(dragFrom===null||dragFrom===dragTo) return;
        const moved=dataArr.splice(dragFrom,1)[0];
        dataArr.splice(dragTo,0,moved);
        dirty=true;
        onReorder();
      });
    });
  }

  function renderQualyRows(){
    race.qualifying.results.forEach((r,i)=>{ r.position=i+1; });
    makeDragList(document.getElementById('qualyRows'), race.qualifying.results, (res,i)=>`
      <div class="admin-grid-row" data-i="${i}" draggable="true">
        <span class="drag-handle">⠿</span>
        <span class="pos-badge">${i+1}</span>
        <span class="driver-name-cell">${driverName(res.driverSlug)}</span>
        <input type="text" class="q-time" data-i="${i}" value="${res.time||''}" placeholder="1:40.994">
        <input type="number" class="q-points" data-i="${i}" value="${res.points||0}" min="0" step="1">
        <button class="rm-btn" type="button" data-i="${i}" title="Remover">✕</button>
      </div>`, renderQualyRows);

    const rowsEl=document.getElementById('qualyRows');
    rowsEl.querySelectorAll('.q-time').forEach(inp=>inp.addEventListener('input',e=>{race.qualifying.results[+e.target.dataset.i].time=e.target.value;dirty=true;}));
    rowsEl.querySelectorAll('.q-points').forEach(inp=>inp.addEventListener('input',e=>{race.qualifying.results[+e.target.dataset.i].points=+e.target.value;dirty=true;}));
    rowsEl.querySelectorAll('.rm-btn').forEach(btn=>btn.addEventListener('click',()=>{race.qualifying.results.splice(+btn.dataset.i,1);dirty=true;renderQualyRows();}));
  }

  function renderRaceRows(){
    race.results.forEach((r,i)=>{ r.position=i+1; });
    makeDragList(document.getElementById('raceRows'), race.results, (res,i)=>`
      <div class="admin-grid-row race-row" data-i="${i}" draggable="true">
        <span class="drag-handle">⠿</span>
        <span class="pos-badge">${i+1}</span>
        <span class="driver-name-cell">${driverName(res.driverSlug)}</span>
        <input type="text" class="r-gap" data-i="${i}" value="${res.gap||''}" placeholder="+2.4s">
        <input type="number" class="r-penalty" data-i="${i}" value="${res.penalty||0}" min="0" step="1">
        <input type="number" class="r-laps" data-i="${i}" value="${res.lapsLed||0}" min="0" step="1">
        <input type="number" class="r-points" data-i="${i}" value="${res.points||0}" min="0" step="1">
        <button class="rm-btn" type="button" data-i="${i}" title="Remover">✕</button>
      </div>`, renderRaceRows);

    const rowsEl=document.getElementById('raceRows');
    rowsEl.querySelectorAll('.r-gap').forEach(inp=>inp.addEventListener('input',e=>{race.results[+e.target.dataset.i].gap=e.target.value;dirty=true;}));
    rowsEl.querySelectorAll('.r-penalty').forEach(inp=>inp.addEventListener('input',e=>{race.results[+e.target.dataset.i].penalty=+e.target.value;dirty=true;}));
    rowsEl.querySelectorAll('.r-laps').forEach(inp=>inp.addEventListener('input',e=>{race.results[+e.target.dataset.i].lapsLed=+e.target.value;dirty=true;}));
    rowsEl.querySelectorAll('.r-points').forEach(inp=>inp.addEventListener('input',e=>{race.results[+e.target.dataset.i].points=+e.target.value;dirty=true;}));
    rowsEl.querySelectorAll('.rm-btn').forEach(btn=>btn.addEventListener('click',()=>{race.results.splice(+btn.dataset.i,1);dirty=true;renderRaceRows();}));
  }

  renderQualyRows();
  renderRaceRows();

  document.getElementById('editorSessionTabs').querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.getElementById('editorSessionTabs').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      activeSession=btn.dataset.s;
      document.querySelectorAll('.editor-panel').forEach(p=>{ p.style.display = p.dataset.panel===activeSession ? '' : 'none'; });
    });
  });

  document.getElementById('addDriverToSessionBtn').addEventListener('click',()=>{
    const arr = activeSession==='qualifying' ? race.qualifying.results : race.results;
    const usedSlugs=new Set(arr.map(r=>r.driverSlug));
    const free=WORKING_DATA.drivers.find(d=>!usedSlugs.has(d.slug));
    if(!free){ showToast('Todos os pilotos já estão nesta sessão.',true); return; }
    if(activeSession==='qualifying'){ arr.push({driverSlug:free.slug,time:'',points:0}); renderQualyRows(); }
    else{ arr.push({driverSlug:free.slug,gap:'',penalty:0,lapsLed:0,points:0}); renderRaceRows(); }
    dirty=true;
  });

  document.getElementById('autoPointsBtn').addEventListener('click',()=>{
    const arr = activeSession==='qualifying' ? race.qualifying.results : race.results;
    arr.forEach((r,i)=>{ r.points=WORKING_DATA.pointsSystem[i]||0; });
    if(activeSession==='qualifying') renderQualyRows(); else renderRaceRows();
    dirty=true;
    showToast('Pontos preenchidos automaticamente pela ordem atual.');
  });

  function readDateTimeInput(){
    const val=document.getElementById('raceDateTime').value;
    if(!val) return null;
    return new Date(val).toISOString();
  }

  document.getElementById('saveDateBtn').addEventListener('click',()=>{
    race.raceDateTime=readDateTimeInput();
    dirty=true;
    showToast(race.raceDateTime?'Data e hora guardadas.':'Data removida (ainda por anunciar).');
  });

  document.getElementById('saveRaceBtn').addEventListener('click',()=>{
    race.results.forEach((r,i)=>{ r.position=i+1; });
    race.qualifying.results.forEach((r,i)=>{ r.position=i+1; });
    race.raceDateTime=readDateTimeInput();
    race.poleTime=document.getElementById('poleTime').value;
    race.fastestLapTime=document.getElementById('fastestLapTime').value;
    race.completed=true;
    race.qualifying.completed=race.qualifying.results.some(r=>r.time||r.points);
    dirty=true;
    renderRaceSelector();
    const next=WORKING_DATA.races.find(r=>!r.completed);
    if(next) renderRaceEditor(next.round);
    showToast(`${race.name} guardado. `+(next?`Próxima corrida: ${next.name}.`:'Época concluída!'));
  });

  const resetBtn=document.getElementById('resetRaceBtn');
  resetBtn?.addEventListener('click',()=>{
    if(!confirm('Repor esta corrida? Os resultados serão apagados.')) return;
    race.completed=false;
    race.results=[];
    race.qualifying={completed:false,results:[],pointsSystem:WORKING_DATA.pointsSystem.slice()};
    race.poleTime='';
    race.fastestLapTime='';
    race.raceDateTime=null;
    dirty=true;
    renderRaceSelector();
    showToast('Corrida reposta.');
  });
}

/* ================= DRIVERS TAB ================= */
function renderDriversAdmin(){
  const list=document.getElementById('driversList');
  const teamOptions=WORKING_DATA.teams.map(t=>`<option value="${t.slug}">${t.name}</option>`).join('');

  function draw(){
    list.innerHTML=WORKING_DATA.drivers.map((d,i)=>{
      const team=WORKING_DATA.teams.find(t=>t.slug===d.teamSlug);
      return `
      <div class="driver-entity-item">
        <label class="driver-photo-upload" data-i="${i}" title="Clicar para mudar a foto">
          ${driverAvatarHTML(d)}
          <input type="file" accept="image/*" class="driver-photo-input" data-i="${i}" hidden>
          <span class="upload-hint">Mudar</span>
        </label>
        <span class="driver-entity-name">#${d.number} · ${d.name} <small style="color:#657080">(${team?team.name:'sem equipa'})</small></span>
        <button class="rm-btn" data-i="${i}" title="Remover">✕</button>
      </div>`;
    }).join('');

    list.querySelectorAll('.driver-photo-input').forEach(inp=>inp.addEventListener('change',async e=>{
      const i=+e.target.dataset.i;
      const file=e.target.files[0];
      if(!file) return;
      try{
        const dataUrl=await fileToResizedDataURL(file,200);
        WORKING_DATA.drivers[i].photoData=dataUrl;
        dirty=true;
        draw();
        showToast('Foto do piloto atualizada.');
      }catch(err){
        showToast('Não foi possível processar essa imagem.',true);
      }
    }));

    list.querySelectorAll('.rm-btn').forEach(b=>b.addEventListener('click',()=>{
      if(!confirm('Remover este piloto?')) return;
      WORKING_DATA.drivers.splice(+b.dataset.i,1);
      dirty=true;
      draw();
    }));
  }
  draw();

  const form=document.getElementById('addDriverForm');
  form.querySelector('#newDriverTeam').innerHTML=teamOptions;
  form.onsubmit=async e=>{
    e.preventDefault();
    const name=form.querySelector('#newDriverName').value.trim();
    const number=+form.querySelector('#newDriverNumber').value;
    const teamSlug=form.querySelector('#newDriverTeam').value;
    const photoInput=form.querySelector('#newDriverPhoto');
    if(!name||!number) return;
    const parts=name.split(' ');
    const initials=(parts[0][0]+(parts[1]?parts[1][0]:'')).toUpperCase();
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

    let photoData=null;
    if(photoInput&&photoInput.files&&photoInput.files[0]){
      try{ photoData=await fileToResizedDataURL(photoInput.files[0],200); }
      catch(err){ showToast('Piloto adicionado, mas a foto não pôde ser processada.',true); }
    }

    WORKING_DATA.drivers.push({slug,name,number,teamSlug,initials,photoData});
    dirty=true;
    form.reset();
    draw();
    showToast('Piloto adicionado.');
  };
}

/* ================= IMAGE HELPER ================= */
/* Resizes an uploaded image client-side and returns a compact base64 JPEG/PNG,
   so logos stored inside data.json stay small even if the original photo is huge. */
function fileToResizedDataURL(file, maxSize){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('read failed'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('decode failed'));
      img.onload=()=>{
        let {width,height}=img;
        if(width>height){ if(width>maxSize){ height=Math.round(height*maxSize/width); width=maxSize; } }
        else{ if(height>maxSize){ width=Math.round(width*maxSize/height); height=maxSize; } }
        const canvas=document.createElement('canvas');
        canvas.width=width; canvas.height=height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,width,height);
        resolve(canvas.toDataURL('image/png',0.9));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ================= TEAMS TAB ================= */
function renderTeamsAdmin(){
  const list=document.getElementById('teamsList');

  function draw(){
    list.innerHTML=WORKING_DATA.teams.map((t,i)=>`
      <div class="team-entity-item">
        <label class="team-logo-upload" data-i="${i}" title="Clicar para mudar o logo">
          ${teamLogoHTML(t,'lg')}
          <input type="file" accept="image/*" class="team-logo-input" data-i="${i}" hidden>
          <span class="upload-hint">Mudar</span>
        </label>
        <span class="team-entity-name">${t.name}</span>
        <input type="color" class="team-color-input" data-i="${i}" value="${t.color}" title="Cor da equipa">
        <button class="rm-btn" data-i="${i}" title="Remover">✕</button>
      </div>`).join('');

    list.querySelectorAll('.team-logo-input').forEach(inp=>inp.addEventListener('change',async e=>{
      const i=+e.target.dataset.i;
      const file=e.target.files[0];
      if(!file) return;
      try{
        const dataUrl=await fileToResizedDataURL(file,240);
        WORKING_DATA.teams[i].logoData=dataUrl;
        dirty=true;
        draw();
        renderDriversAdmin();
        showToast('Logo atualizado.');
      }catch(err){
        showToast('Não foi possível processar essa imagem.',true);
      }
    }));

    list.querySelectorAll('.team-color-input').forEach(inp=>inp.addEventListener('input',e=>{
      WORKING_DATA.teams[+e.target.dataset.i].color=e.target.value;
      dirty=true;
    }));

    list.querySelectorAll('.rm-btn').forEach(b=>b.addEventListener('click',()=>{
      if(!confirm('Remover esta equipa? Pilotos associados ficam sem equipa.')) return;
      WORKING_DATA.teams.splice(+b.dataset.i,1);
      dirty=true;
      draw();
      renderDriversAdmin();
    }));
  }
  draw();

  const form=document.getElementById('addTeamForm');
  form.onsubmit=async e=>{
    e.preventDefault();
    const name=form.querySelector('#newTeamName').value.trim();
    const color=form.querySelector('#newTeamColor').value;
    const photoInput=form.querySelector('#newTeamPhoto');
    if(!name) return;
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

    let logoData=null;
    if(photoInput.files&&photoInput.files[0]){
      try{ logoData=await fileToResizedDataURL(photoInput.files[0],240); }
      catch(err){ showToast('Equipa adicionada, mas o logo não pôde ser processado.',true); }
    }

    WORKING_DATA.teams.push({slug,name,color,logoData});
    dirty=true;
    form.reset();
    draw();
    renderDriversAdmin();
    showToast('Equipa adicionada.');
  };
}

/* ================= EXPORT ================= */
document.getElementById('downloadJsonBtn')?.addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(WORKING_DATA,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='data.json';
  a.click();
  URL.revokeObjectURL(url);
  dirty=false;
  showToast('data.json descarregado — substitui o ficheiro no teu repositório GitHub e faz commit.');
});

window.addEventListener('beforeunload',e=>{
  if(dirty){ e.preventDefault(); e.returnValue=''; }
});
