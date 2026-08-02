/* =====================================================================
   RMC — shared app logic
   Data lives in data.json (teams, drivers, races+results).
   Admin panel edits this in-memory and lets you export an updated
   data.json to commit back to your GitHub repo.
   ===================================================================== */

const POINTS_SYSTEM=[30,27,25,23,21,19,17,15,13,12,11,10,9,8,7,6,5,4,3,2,2,1,1,1,1,1,1,1,1,1];

/* ---------- Mobile nav ---------- */
const menu=document.querySelector('.hamb'),nav=document.querySelector('.topbar nav');
menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open)});
document.querySelectorAll('.topbar nav a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false')}));

/* ---------- Data loading ---------- */
let RMC_DATA=null;

async function loadData(){
  if(RMC_DATA) return RMC_DATA;
  try{
    const res=await fetch('data.json',{cache:'no-store'});
    RMC_DATA=await res.json();
  }catch(e){
    console.error('Could not load data.json',e);
    RMC_DATA={teams:[],drivers:[],races:[],pointsSystem:POINTS_SYSTEM};
  }
  return RMC_DATA;
}

/* ---------- Avatar / logo rendering with graceful fallback ---------- */
function driverAvatarHTML(driver,size){
  const cls = size==='lg' ? 'avatar lg' : 'avatar';
  const team=RMC_DATA.teams.find(t=>t.slug===driver.teamSlug);
  const color=team?team.color:'#2a3441';
  if(driver.photoData){
    return `<span class="${cls}" style="--av-color:${color}"><img src="${driver.photoData}" alt="${driver.name}"></span>`;
  }
  return `<span class="${cls}" style="--av-color:${color}">${driver.initials}</span>`;
}
function teamLogoHTML(team,size){
  const cls = size==='lg' ? 'team-logo-lg' : 'team-logo-fallback';
  const mono=team.name.split(' ').map(w=>w[0]).slice(0,2).join('');
  if(team.logoData){
    return `<span class="${cls}" style="--team-color:${team.color}"><img src="${team.logoData}" alt="${team.name}"></span>`;
  }
  return `<span class="${cls}" style="--team-color:${team.color}">${mono}</span>`;
}

/* ---------- Standings calculations ---------- */
function computeDriverStandings(data){
  const perRaceRace=data.races.map(r=>{
    const map={};
    r.results.forEach(res=>{ map[res.driverSlug]=res.points||0; });
    return map;
  });
  const perRaceQualy=data.races.map(r=>{
    const map={};
    (r.qualifying?.results||[]).forEach(res=>{ map[res.driverSlug]=res.points||0; });
    return map;
  });
  return data.drivers.map(d=>{
    const raceResults=perRaceRace.map(m=>m[d.slug]||0);
    const qualyResults=perRaceQualy.map(m=>m[d.slug]||0);
    const results=raceResults.map((v,i)=>v+qualyResults[i]);
    const total=results.reduce((a,b)=>a+b,0);
    const wins=data.races.filter(r=>r.results.find(res=>res.driverSlug===d.slug&&res.position===1)).length;
    const poles=data.races.filter(r=>(r.qualifying?.results||[]).find(res=>res.driverSlug===d.slug&&res.position===1)).length;
    return {...d,results,raceResults,qualyResults,total,wins,poles};
  }).sort((a,b)=>b.total-a.total||b.wins-a.wins||a.number-b.number);
}

function computeTeamStandings(data){
  const driverStandings=computeDriverStandings(data);
  return data.teams.map(t=>{
    const teamDrivers=driverStandings.filter(d=>d.teamSlug===t.slug);
    const perRace=data.races.map((r,i)=>teamDrivers.reduce((sum,d)=>sum+(d.results[i]||0),0));
    const total=perRace.reduce((a,b)=>a+b,0);
    return {...t,drivers:teamDrivers,perRace,total};
  }).sort((a,b)=>b.total-a.total);
}

/* ---------- Next race (first without results) ---------- */
function getNextRace(data){
  return data.races.find(r=>!r.completed) || null;
}
function getLastCompletedRace(data){
  const done=data.races.filter(r=>r.completed);
  return done.length ? done[done.length-1] : null;
}

/* ---------- Countdown ---------- */
function initCountdown(data){
  const daysEl=document.getElementById('days');
  if(!daysEl) return;
  const next=getNextRace(data);
  const notSetEl=document.getElementById('countdownNotSet');

  if(!next || !next.raceDateTime){
    daysEl.textContent='--';
    document.getElementById('hours').textContent='--';
    document.getElementById('mins').textContent='--';
    if(notSetEl) notSetEl.style.display = next ? '' : 'none';
    return;
  }
  if(notSetEl) notSetEl.style.display='none';

  const target=new Date(next.raceDateTime).getTime();
  function tick(){
    const x=Math.max(0,target-Date.now());
    const d=Math.floor(x/86400000),h=Math.floor(x/3600000)%24,m=Math.floor(x/60000)%60;
    daysEl.textContent=String(d).padStart(2,'0');
    document.getElementById('hours').textContent=String(h).padStart(2,'0');
    document.getElementById('mins').textContent=String(m).padStart(2,'0');
  }
  tick();setInterval(tick,30000);
}

/* ---------- Page renderers ---------- */
function renderHome(data){
  const next=getNextRace(data);
  const last=getLastCompletedRace(data);
  const completedCount=data.races.filter(r=>r.completed).length;

  const roundNowEl=document.getElementById('roundNow');
  if(roundNowEl) roundNowEl.textContent=String((next?next.round:data.races.length+1)).padStart(2,'0');
  const nextTrackEl=document.getElementById('nextTrackName');
  if(nextTrackEl) nextTrackEl.textContent=next?next.name:'Season complete';

  const briefTrack=document.getElementById('briefTrackName');
  if(briefTrack && next){
    briefTrack.textContent=next.name;
    document.getElementById('briefTrackFull').textContent=next.track;
    document.getElementById('briefRoundNum').textContent='ROUND '+String(next.round).padStart(2,'0');
  }

  const countdownDateEl=document.getElementById('countdownDate');
  if(countdownDateEl && next && next.raceDateTime){
    const dt=new Date(next.raceDateTime);
    countdownDateEl.textContent=dt.toLocaleString('pt-PT',{weekday:'long',day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});
  }

  const progressStrip=document.getElementById('progressStrip');
  if(progressStrip){
    progressStrip.innerHTML=data.races.map(r=>{
      const cls = r.completed ? 'done' : (next&&r.round===next.round ? 'active' : '');
      return `<span class="${cls}" title="R${r.round} ${r.name}"></span>`;
    }).join('');
  }

  const latestResultEl=document.getElementById('latestResult');
  if(latestResultEl){
    if(last){
      const rows=[...last.results].sort((a,b)=>a.position-b.position).slice(0,5);
      const qualyPosMap={};
      (last.qualifying?.results||[]).forEach(r=>{ qualyPosMap[r.driverSlug]=r.position; });
      latestResultEl.innerHTML=rows.map(res=>{
        const d=data.drivers.find(x=>x.slug===res.driverSlug);
        const startPos=qualyPosMap[res.driverSlug];
        let delta='<span class="pos-delta same">–</span>';
        if(startPos!=null){
          const diff=startPos-res.position;
          if(diff>0) delta=`<span class="pos-delta up">▲${diff}</span>`;
          else if(diff<0) delta=`<span class="pos-delta down">▼${Math.abs(diff)}</span>`;
        }
        return `<div class="result-item">${d?`<span class="rp">${String(res.position).padStart(2,'0')}</span>${driverAvatarHTML(d)}<strong>${d.name}</strong>`:'<span></span><span></span><strong>—</strong>'}<small>${res.gap||''}</small>${delta}<span class="rpoints">${res.points||0} PTS</span></div>`;
      }).join('');
      const dataBig=document.getElementById('latestWinner');
      if(dataBig){
        const winner=data.drivers.find(x=>x.slug===rows[0]?.driverSlug);
        dataBig.textContent=winner?winner.name:'—';
        document.getElementById('latestRaceName').textContent=last.name;
        document.getElementById('latestFastestLap').textContent=last.fastestLapTime||'—';
        document.getElementById('latestPole').textContent=last.poleTime||'—';
      }
    }else{
      latestResultEl.innerHTML='<div style="padding:32px 22px;color:#657080;font-size:11px">No race has been run yet this season. Check back after Round 01.</div>';
    }
  }

  const infoCards=document.getElementById('infoCards');
  if(infoCards){
    const leader=computeDriverStandings(data)[0];
    const leaderTeam=computeTeamStandings(data)[0];
    infoCards.innerHTML=`
      <div class="info-card"><b>${data.drivers.length}</b><span>Drivers</span><p>${data.teams.length} teams on the Season ${data.season} grid.</p></div>
      <div class="info-card"><b>${completedCount}/${data.races.length}</b><span>Rounds completed</span><p>${next?`Next up: ${next.name}.`:'Season complete.'}</p></div>
      <div class="info-card"><b>${leader&&leader.total>0?leader.name.split(' ')[0]:'—'}</b><span>Championship leader</span><p>${leaderTeam&&leaderTeam.total>0?leaderTeam.name+' lead the teams standings.':'Standings open after Round 01.'}</p></div>`;
  }
}

function renderStandings(data){
  const standings=computeDriverStandings(data);
  const standingsBody=document.getElementById('standingsBody');
  if(standingsBody){
    standingsBody.innerHTML=standings.map((d,i)=>`<div class="lb-row">
      <span class="pos">${String(i+1).padStart(2,'0')}</span>
      <span class="driver-cell">${driverAvatarHTML(d)}<strong>${d.name}</strong></span>
      <span class="team-cell">${teamLogoHTML(RMC_DATA.teams.find(t=>t.slug===d.teamSlug))}&nbsp;${RMC_DATA.teams.find(t=>t.slug===d.teamSlug)?.name||''}</span>
      ${d.results.map(x=>`<span>${x||'—'}</span>`).join('')}
      <span class="pts">${d.total}</span>
    </div>`).join('');
  }

  const rosterGrid=document.getElementById('rosterGrid');
  if(rosterGrid){
    function renderRoster(list){
      rosterGrid.innerHTML=list.map(d=>{
        const pos=standings.findIndex(s=>s.slug===d.slug)+1;
        const team=data.teams.find(t=>t.slug===d.teamSlug);
        return `<article class="driver-card">
          <span class="driver-card-pos">P${String(pos).padStart(2,'0')}</span>
          <div class="driver-card-top">${driverAvatarHTML(d,'lg')}<div><h4>${d.name}</h4><span class="dnum">#${String(d.number).padStart(2,'0')}</span></div></div>
          <div class="driver-card-team">${team?teamLogoHTML(team):''}${team?team.name:''}</div>
          <div class="driver-card-pts"><b>${d.total}</b><span>Points</span></div>
        </article>`;
      }).join('') || '<p style="color:#5e6977;font-size:11px;grid-column:1/-1">No drivers match your search.</p>';
    }
    renderRoster(standings);
    const searchInput=document.getElementById('rosterSearch');
    searchInput?.addEventListener('input',()=>{
      const q=searchInput.value.trim().toLowerCase();
      renderRoster(standings.filter(d=>d.name.toLowerCase().includes(q)||(data.teams.find(t=>t.slug===d.teamSlug)?.name||'').toLowerCase().includes(q)));
    });
    const viewButtons=document.querySelectorAll('.view-toggle button');
    const tableWrap=document.getElementById('tableView');
    const cardWrap=document.getElementById('cardView');
    viewButtons.forEach(btn=>btn.addEventListener('click',()=>{
      viewButtons.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const isCards=btn.dataset.view==='cards';
      tableWrap.style.display=isCards?'none':'';
      cardWrap.style.display=isCards?'':'none';
    }));
  }
}

function renderTeamsStandings(data){
  const teamStandings=computeTeamStandings(data);
  const body=document.getElementById('teamsBody');
  if(!body) return;
  body.innerHTML=teamStandings.map((t,i)=>`<div class="team-row">
    <span class="pos">${String(i+1).padStart(2,'0')}</span>
    <span class="team-cell-name">${teamLogoHTML(t,'lg')}<span><b>${t.name}</b><small>${t.drivers.length} drivers</small></span></span>
    ${t.perRace.map(x=>`<span>${x||'—'}</span>`).join('')}
    <span class="pts">${t.total}</span>
  </div>`).join('');
}

function computeBiggestMover(race){
  const qualyRows=race.qualifying?.results||[];
  if(!qualyRows.length || !race.results.length) return null;
  const qualyPos={};
  qualyRows.forEach(r=>{ qualyPos[r.driverSlug]=r.position; });
  let best=null;
  race.results.forEach(res=>{
    const startPos=qualyPos[res.driverSlug];
    if(startPos==null) return;
    const gained=startPos-res.position;
    if(!best || gained>best.gained){ best={driverSlug:res.driverSlug,gained,startPos,finishPos:res.position}; }
  });
  return best && best.gained>0 ? best : null;
}

function renderResultsPage(data){
  const resultsPage=document.getElementById('resultsPage');
  if(!resultsPage) return;
  const picker=document.getElementById('racePicker');
  const list=document.getElementById('raceResultList');
  const fastestBox=document.getElementById('raceFastestBox');
  const sessionTabs=document.getElementById('sessionTabs');
  const moverBox=document.getElementById('biggestMoverBox');

  let currentSession='race';

  function positionDeltaHTML(driverSlug,race){
    const qualyRows=race.qualifying?.results||[];
    const qRow=qualyRows.find(r=>r.driverSlug===driverSlug);
    const rRow=race.results.find(r=>r.driverSlug===driverSlug);
    if(!qRow||!rRow) return '';
    const delta=qRow.position-rRow.position;
    if(delta>0) return `<span class="pos-delta up">▲${delta}</span>`;
    if(delta<0) return `<span class="pos-delta down">▼${Math.abs(delta)}</span>`;
    return `<span class="pos-delta same">–</span>`;
  }

  function renderRows(race,session){
    const isQualy=session==='qualifying';
    const source = isQualy ? (race.qualifying?.results||[]) : race.results;
    const completed = isQualy ? race.qualifying?.completed : race.completed;

    if(completed && source.length){
      const rows=[...source].sort((a,b)=>a.position-b.position);
      list.innerHTML=rows.map(res=>{
        const d=data.drivers.find(x=>x.slug===res.driverSlug);
        const penalty=(!isQualy&&res.penalty)?` <span style="color:#ff6b6b">(+${res.penalty}s)</span>`:'';
        const delta=(!isQualy)?positionDeltaHTML(res.driverSlug,race):'';
        const detail = isQualy ? (res.time||'') : `${res.gap||''}${res.lapsLed?` · ${res.lapsLed} laps led`:''}`;
        return `<div class="result-item">${d?`<span class="rp">${String(res.position).padStart(2,'0')}</span>${driverAvatarHTML(d)}<strong>${d.name}${penalty}</strong>`:'<span></span><span></span><strong>—</strong>'}<small>${detail}</small>${delta}<span class="rpoints">${res.points||0} PTS</span></div>`;
      }).join('');
      if(fastestBox && !isQualy){
        const winner=data.drivers.find(x=>x.slug===rows[0]?.driverSlug);
        fastestBox.innerHTML=`<span class="label">RACE DATA</span><div class="data-big">${String(rows[0]?.position||1).padStart(2,'0')} <small>WINNER</small></div><p>${winner?winner.name:'—'}</p><hr><small>FASTEST LAP</small><strong>${race.fastestLapTime||'—'}</strong><small>POLE POSITION</small><strong>${race.poleTime||'—'}</strong>`;
      }else if(fastestBox && isQualy){
        const poleD=data.drivers.find(x=>x.slug===rows[0]?.driverSlug);
        fastestBox.innerHTML=`<span class="label">QUALIFYING DATA</span><div class="data-big">${String(rows[0]?.position||1).padStart(2,'0')} <small>POLE</small></div><p>${poleD?poleD.name:'—'}</p><hr><small>POLE TIME</small><strong>${rows[0]?.time||'—'}</strong>`;
      }
      if(moverBox){
        if(!isQualy){
          const mover=computeBiggestMover(race);
          if(mover){
            const d=data.drivers.find(x=>x.slug===mover.driverSlug);
            moverBox.style.display='';
            moverBox.innerHTML=`<span class="label">BIGGEST MOVER</span><div class="mover-content">${d?driverAvatarHTML(d,'lg'):''}<div><h4>${d?d.name:'—'}</h4><span class="mover-gain">+${mover.gained} positions</span><small>P${mover.startPos} → P${mover.finishPos}</small></div></div>`;
          }else{
            moverBox.style.display='none';
          }
        }else{
          moverBox.style.display='none';
        }
      }
    }else{
      list.innerHTML=`<div style="padding:40px 22px;color:#657080;font-size:11px">This ${isQualy?'qualifying session':'round'} hasn't been ${isQualy?'set':'raced'} yet.</div>`;
      if(fastestBox) fastestBox.innerHTML=isQualy
        ? `<span class="label">QUALIFYING DATA</span><div class="data-big">— <small>POLE</small></div><p>Not yet set</p><hr><small>POLE TIME</small><strong>—:—.—</strong>`
        : `<span class="label">RACE DATA</span><div class="data-big">— <small>WINNER</small></div><p>Not yet raced</p><hr><small>FASTEST LAP</small><strong>—:—.—</strong><small>POLE POSITION</small><strong>—:—.—</strong>`;
      if(moverBox) moverBox.style.display='none';
    }
  }

  function renderRace(idx){
    const race=data.races[idx];
    renderRows(race,currentSession);
    picker.querySelectorAll('.race-pill').forEach((p,i)=>p.classList.toggle('active',i===idx));
    picker.dataset.current=idx;
  }

  picker.innerHTML=data.races.map((r,i)=>`<button class="race-pill" data-i="${i}">R${r.round} · ${r.name}</button>`).join('');
  picker.querySelectorAll('.race-pill').forEach(p=>p.addEventListener('click',()=>renderRace(+p.dataset.i)));

  if(sessionTabs){
    sessionTabs.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
      sessionTabs.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentSession=btn.dataset.session;
      renderRace(+(picker.dataset.current||0));
    }));
  }

  const lastIdx=Math.max(0,data.races.filter(r=>r.completed).length-1);
  renderRace(lastIdx);
}

function renderCalendar(data){
  const calWrap=document.getElementById('calendarWrap');
  if(!calWrap) return;
  const next=getNextRace(data);
  calWrap.innerHTML=data.races.map(r=>{
    const cls = r.completed ? 'done' : (next&&r.round===next.round ? 'next' : '');
    const badge = r.completed ? '✓' : (next&&r.round===next.round?'NEXT':'—');
    return `<article class="round ${cls}">
      <div class="rno">${String(r.round).padStart(2,'0')}</div>
      <div class="rinfo"><small>${r.completed?'COMPLETED':(next&&r.round===next.round?'NEXT UP':'UPCOMING')} · ${r.country.toUpperCase()}</small><h3>${r.name}</h3><span>${r.type}</span></div>
      <strong class="round-toggle">${badge==='✓'?'✓ Details':badge==='NEXT'?'Details':'Details'}</strong>
      <div class="round-detail">${r.track} — ${r.type} round in ${r.country}.${r.completed?' Final classification is available on the Results page.':''}</div>
    </article>`;
  }).join('');
  document.querySelectorAll('.round-toggle').forEach(el=>{
    el.addEventListener('click',()=>el.closest('.round').classList.toggle('expanded'));
  });
}

function renderPointsTable(data){
  const el=document.getElementById('pointsTable');
  if(!el) return;
  el.innerHTML=data.pointsSystem.map((p,i)=>`<div class="pt-cell"><b>${p}</b><span>P${i+1}</span></div>`).join('');
}

/* ---------- Scroll reveal ---------- */
function initScrollReveal(){
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    },{threshold:.12,rootMargin:'0px 0px -40px 0px'});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  }else{
    document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  }
}

/* ---------- Boot ---------- */
(async function boot(){
  const data=await loadData();
  initCountdown(data);
  renderHome(data);
  renderStandings(data);
  renderTeamsStandings(data);
  renderResultsPage(data);
  renderCalendar(data);
  renderPointsTable(data);
  initScrollReveal();
})();
