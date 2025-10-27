
// v5.2
const ROOMS = ['Double','Twin','Deluxe','Standard','Family','Cottage','Sauna'];
const STORAGE_KEY = 'guesthouse_calendar_v5_2';
let state = loadState();
function loadState(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw);}catch(e){} return { view: iso(new Date()), bookings: {}, tentative:null }; }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function startOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function iso(d){ return d.toISOString().slice(0,10); }
function parseISO(s){ const [y,m,dd]=s.split('-').map(Number); const d=new Date(y,m-1,dd); d.setHours(0,0,0,0); return d; }
function weekdayLabels(){ const base=new Date(Date.UTC(2021,7,2)); return [...Array(7)].map((_,i)=>{ const d=new Date(base); d.setDate(d.getDate()+i); return d.toLocaleDateString('en-GB',{weekday:'narrow'}).toUpperCase(); }); }
function monthLabel(d){ return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'}); }
function gridForMonth(d){ const start=startOfMonth(d); const startWeekDay=(start.getDay()+6)%7; const gridStart=addDays(start,-startWeekDay); const cells=[]; for(let i=0;i<42;i++) cells.push(addDays(gridStart,i)); return {cells,start}; }
function sameDate(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function getBookings(room){ return state.bookings[room] || (state.bookings[room]=[]); }
function isBooked(room, dayISO){ return getBookings(room).some(b=> dayISO>=b.start && dayISO<=b.end); }

const roomsGrid=document.getElementById('roomsGrid'); const monthLabelEl=document.getElementById('monthLabel');
document.getElementById('prev').onclick=()=>{ const d=parseISO(state.view); d.setMonth(d.getMonth()-1); state.view=iso(d); paint(); save(); };
document.getElementById('next').onclick=()=>{ const d=parseISO(state.view); d.setMonth(d.getMonth()+1); state.view=iso(d); paint(); save(); };

document.getElementById('exportAllBtn').onclick=()=>{
  const rows=[]; for(const room of ROOMS){ for(const b of getBookings(room)){ rows.push({room,start:b.start,end:b.end,name:b.name||'',note:b.note||''}); } }
  downloadCSV('bookings.csv', rows);
};
document.getElementById('exportMonthBtn').onclick=()=>{
  const d=parseISO(state.view), m=d.getMonth()+1, y=d.getFullYear();
  const s=iso(new Date(y,m-1,1)), e=iso(new Date(y,m,0));
  const rows=[]; for(const room of ROOMS){ for(const b of getBookings(room)){ if(!(b.end<s || b.start>e)) rows.push({room,start:b.start,end:b.end,name:b.name||'',note:b.note||''}); } }
  downloadCSV(`bookings-${y}-${String(m).padStart(2,'0')}.csv`, rows);
};
function downloadCSV(filename,rows){ const head=['room','start_date','end_date','guest_name','note']; const esc=v=>(''+v).replace(/"/g,'""'); const lines=[head.join(',')].concat(rows.map(r=>[`"${esc(r.room)}"`,`"${esc(r.start)}"`,`"${esc(r.end)}"`,`"${esc(r.name)}"`,`"${esc(r.note)}"`].join(','))); const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }

function paint(){
  const d=parseISO(state.view); monthLabelEl.textContent=monthLabel(d); roomsGrid.innerHTML=''; const weekdays=weekdayLabels();
  for(const room of ROOMS){
    const card=document.createElement('section'); card.className='room-card';
    const head=document.createElement('div'); head.className='month-head';
    for(const w of weekdays){ const x=document.createElement('div'); x.className='wk'; x.textContent=w; head.appendChild(x); }
    card.appendChild(head);
    const grid=document.createElement('div'); grid.className='month-grid';
    const {cells}=gridForMonth(d);
    for(const day of cells){
      const el=document.createElement('div'); const outside=day.getMonth()!==d.getMonth();
      el.className='day '+(outside?'out':'');
      if(!outside){
        el.classList.add('free'); el.textContent=day.getDate(); const dISO=iso(day);
        if(isBooked(room,dISO)){ el.classList.remove('free'); el.classList.add('busy'); }
        if(sameDate(day,new Date())) el.classList.add('today');
        el.onclick=()=>onDayTap(room,day);
      }else{ el.classList.add('empty'); el.textContent=''; }
      grid.appendChild(el);
    }
    const title=document.createElement('div'); title.className='room-title'; title.textContent=room;
    card.appendChild(grid); card.appendChild(title); roomsGrid.appendChild(card);
  }
}

function onDayTap(room,date){
  const dISO=iso(date); const list=getBookings(room); const hit=list.find(b=> dISO>=b.start && dISO<=b.end );
  if(hit){ openSheet('edit', room, hit); return; }
  openSheet('create', room, {start:dISO, end:dISO, name:'', note:''});
}

const sheet=document.getElementById('sheet'); const backdrop=document.getElementById('sheetBackdrop'); const form=document.getElementById('sheetForm'); const startInput=document.getElementById('startInput'); const endInput=document.getElementById('endInput'); const nameInput=document.getElementById('nameInput'); const noteInput=document.getElementById('noteInput'); const deleteBtn=document.getElementById('deleteBtn'); const closeBtn=document.getElementById('closeBtn');
function autosize(el){ el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; }
function openSheet(mode, room, booking){
  sheet.classList.add('open'); backdrop.classList.add('open'); sheet.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  startInput.value=booking.start; endInput.value=booking.end; nameInput.value=booking.name||''; noteInput.value=booking.note||''; autosize(noteInput);
  deleteBtn.style.display = mode==='edit' ? 'inline-block' : 'none';
  deleteBtn.onclick=()=>{ if(mode!=='edit')return; const list=getBookings(room); const idx=list.findIndex(x=>x.id===booking.id); if(idx>=0) list.splice(idx,1); save(); closeSheet(); paint(); };
  closeBtn.onclick=()=>{ closeSheet(); }; backdrop.onclick=closeBtn.onclick; noteInput.oninput=()=> autosize(noteInput);
  form.onsubmit=(e)=>{ e.preventDefault(); const s=startInput.value, eDate=endInput.value; const [ss,ee]=s<=eDate?[s,eDate]:[eDate,s]; const list=getBookings(room);
    if(mode==='edit'){ const excludeId=booking.id; if(list.some(x=> x.id!==excludeId && !(ee<x.start || ss>x.end))){ alert('Those dates overlap another booking.'); return; } booking.start=ss; booking.end=ee; booking.name=nameInput.value||''; booking.note=noteInput.value||''; }
    else { if(list.some(x=> !(ee<x.start || ss>x.end))){ alert('Those dates overlap another booking.'); return; } list.push({id:crypto.randomUUID(),start:ss,end:ee,name:nameInput.value||'',note:noteInput.value||''}); list.sort((a,b)=>a.start.localeCompare(b.start)); }
    save(); closeSheet(); paint();
  };
}
function closeSheet(){ sheet.classList.remove('open'); backdrop.classList.remove('open'); sheet.setAttribute('aria-hidden','true'); document.body.style.overflow='auto'; }
paint();
