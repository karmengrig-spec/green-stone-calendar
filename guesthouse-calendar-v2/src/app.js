
const ROOMS = [
  'Double Room',
  'Double or Twin Room',
  'Standard Double Room',
  'Deluxe Double Room',
  'Family Room with Balcony',
  'Cottage in the Garden',
  'Sauna'
];

const STORAGE_KEY = 'guesthouse_calendar_v2';
let state = loadState();

function loadState(){
  try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch(e){}
  return { view: iso(new Date()), bookings: {}, tentative:null };
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function startOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function iso(d){ return d.toISOString().slice(0,10); }
function parseISO(s){ const [y,m,dd]=s.split('-').map(Number); const d=new Date(y,m-1,dd); d.setHours(0,0,0,0); return d; }
function weekdayLabels(){ const base = new Date(Date.UTC(2021, 7, 2)); return [...Array(7)].map((_,i)=>{ const d=new Date(base); d.setDate(d.getDate()+i); return d.toLocaleDateString('en-GB',{weekday:'narrow'}).toUpperCase(); }); }
function monthLabel(d){ return d.toLocaleDateString('en-GB',{month:'long', year:'numeric'}); }
function gridForMonth(d){ const start=startOfMonth(d); const startWeekDay=(start.getDay()+6)%7; const gridStart=addDays(start,-startWeekDay); const cells=[]; for(let i=0;i<42;i++) cells.push(addDays(gridStart,i)); return {cells,start}; }
function sameDate(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function getBookings(room){ return state.bookings[room] || (state.bookings[room]=[]); }
function overlapsAny(list, aISO, bISO){ const A = aISO<bISO?aISO:bISO; const B = aISO<bISO?bISO:aISO; return list.some(x => !(B < x.start || A > x.end)); }
function isBooked(room, dayISO){ return getBookings(room).some(b => dayISO >= b.start && dayISO <= b.end); }
function overlapsTentative(aISO, bISO, xISO){ const A=aISO<bISO?aISO:bISO; const B=aISO<bISO?bISO:aISO; return xISO>=A && xISO<=B; }

const roomsGrid = document.getElementById('roomsGrid');
const monthLabelEl = document.getElementById('monthLabel');
document.getElementById('prev').onclick = ()=>{ const d=parseISO(state.view); d.setMonth(d.getMonth()-1); state.view=iso(d); paint(); save(); };
document.getElementById('next').onclick = ()=>{ const d=parseISO(state.view); d.setMonth(d.getMonth()+1); state.view=iso(d); paint(); save(); };

document.getElementById('exportAllBtn').onclick = ()=>{
  const rows = [];
  for(const room of ROOMS) for(const b of getBookings(room)) rows.push({room,start:b.start,end:b.end,name:b.name||''});
  downloadCSV('bookings.csv', rows);
};
document.getElementById('exportMonthBtn').onclick = ()=>{
  const d=parseISO(state.view), {start}=gridForMonth(d);
  const month = d.getMonth()+1, year=d.getFullYear();
  const monthStart = iso(new Date(year, month-1, 1));
  const monthEnd = iso(new Date(year, month, 0));
  const rows=[];
  for(const room of ROOMS){
    for(const b of getBookings(room)){
      if(!(b.end < monthStart || b.start > monthEnd)) rows.push({room,start:b.start,end:b.end,name:b.name||''});
    }
  }
  downloadCSV(`bookings-${year}-${String(month).padStart(2,'0')}.csv`, rows);
};
function downloadCSV(filename, rows){
  const head = ['room','start_date','end_date','guest_name'];
  const esc = v => (''+v).replace(/"/g,'""');
  const lines = [head.join(',')].concat(rows.map(r=> [`"${esc(r.room)}"`,`"${esc(r.start)}"`,`"${esc(r.end)}"`,`"${esc(r.name)}"`].join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

function paint(){
  const d = parseISO(state.view);
  monthLabelEl.textContent = monthLabel(d);
  roomsGrid.innerHTML='';
  const weekdays = weekdayLabels();
  for(const room of ROOMS){
    const card = document.createElement('section'); card.className='room-card';

    const head = document.createElement('div'); head.className='month-head';
    for(const w of weekdays){ const x=document.createElement('div'); x.className='wk'; x.textContent=w; head.appendChild(x); }
    card.appendChild(head);

    const grid = document.createElement('div'); grid.className='month-grid';
    const {cells} = gridForMonth(d);
    for(const day of cells){
      const el = document.createElement('div');
      const outside = day.getMonth() !== d.getMonth();
      el.className = 'day ' + (outside ? 'out' : '');
      if(!outside){
        el.classList.add('free');
        el.textContent = day.getDate();
        const dISO = iso(day);
        if(isBooked(room, dISO)){ el.classList.remove('free'); el.classList.add('busy'); }
        if(state.tentative && state.tentative.room===room){
          if(overlapsTentative(state.tentative.start, dISO, dISO)) el.classList.add('tent');
        }
        if(sameDate(day,new Date())) el.classList.add('today');
        el.onclick = ()=> onDayTap(room, day);
      }else{
        el.classList.add('empty');
        el.textContent = '';
      }
      grid.appendChild(el);
    }
    const title = document.createElement('div'); title.className='room-title'; title.textContent=room;
    card.appendChild(grid); card.appendChild(title);
    roomsGrid.appendChild(card);
  }
}

function onDayTap(room, date){
  const dISO = iso(date);
  const list = getBookings(room);
  const hit = list.find(b => dISO >= b.start && dISO <= b.end);
  if(hit){
    const choice = prompt('Booking options:\n1 = Edit dates\n2 = Rename guest\n3 = Cancel booking\n(Press Esc to keep)','');
    if(choice==='1'){
      const ns = prompt('New start YYYY-MM-DD:', hit.start); if(!ns) return;
      const ne = prompt('New end YYYY-MM-DD:', hit.end); if(!ne) return;
      const others = list.filter(x=>x.id!==hit.id);
      if(others.some(x => !((ne < x.start) || (ns > x.end)))){ alert('Dates overlap another booking.'); return; }
      hit.start=ns; hit.end=ne; save(); paint(); return;
    }else if(choice==='2'){
      const nm = prompt('Guest name:', hit.name||''); if(nm===null) return; hit.name=nm; save(); paint(); return;
    }else if(choice==='3'){
      if(confirm('Cancel this booking?')){ const i=list.findIndex(x=>x.id===hit.id); if(i>=0) list.splice(i,1); save(); paint(); return; }
    }
    return;
  }
  if(state.tentative && state.tentative.room===room){
    const aISO = state.tentative.start, bISO = dISO;
    let s=aISO, e=bISO; if(e<s){ const t=s; s=e; e=t; }
    if(overlapsAny(list,s,e)){ alert('That range overlaps an existing booking.'); state.tentative=null; paint(); save(); return; }
    const nm = prompt('Guest name (optional):','')||'';
    list.push({id:crypto.randomUUID(), start:s, end:e, name:nm}); list.sort((x,y)=>x.start.localeCompare(y.start));
    state.tentative=null; save(); paint();
  }else{
    state.tentative = {room, start: dISO}; save(); paint();
  }
}

paint();
