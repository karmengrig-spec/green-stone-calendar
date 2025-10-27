import {
  auth, onAuthStateChanged, createAccount, signIn, signOutNow,
  db, bookingsCol, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp, userIsAdmin
} from "./firebase.js";

const ROOMS = ['Double','Twin','Deluxe','Standard','Family','Cottage','Sauna'];
function isoLocal(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function parseISO(s){ const [y,m,dd]=s.split('-').map(Number); const d=new Date(y,m-1,dd); d.setHours(0,0,0,0); return d; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfMonth(d){ const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
function gridForMonth(d){ const start=startOfMonth(d); const startWeekDay=(start.getDay()+6)%7; const gridStart=addDays(start,-startWeekDay); const cells=[]; for(let i=0;i<42;i++) cells.push(addDays(gridStart,i)); return {cells,start}; }
function monthLabel(d){ return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'}); }
function sameDate(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

let state = { view: isoLocal(new Date()), bookings: {} };
let currentUser=null, isAdmin=false, unsub=null;

const emailEl = document.getElementById('emailInput');
const passEl = document.getElementById('passwordInput');
const signinBtn = document.getElementById('signinBtn');
const signupBtn = document.getElementById('signupBtn');
const signoutBtn = document.getElementById('signoutBtn');
const roleBadge = document.getElementById('roleBadge');

signinBtn.onclick = async ()=>{ try{ await signIn(emailEl.value.trim(), passEl.value.trim()); }catch(e){ alert(e.message||'Sign-in failed'); } };
signupBtn.onclick = async ()=>{ try{ await createAccount(emailEl.value.trim(), passEl.value.trim()); alert('Account created — you can sign in now.'); }catch(e){ alert(e.message||'Sign-up failed'); } };
signoutBtn.onclick = ()=> signOutNow();

onAuthStateChanged(auth, async (u)=>{
  currentUser = u || null;
  isAdmin = false;
  if (u) {
    signoutBtn.style.display = 'inline-block';
    signinBtn.style.display = 'none';
    signupBtn.style.display = 'none';
    emailEl.style.display = 'none';
    passEl.style.display = 'none';
    isAdmin = await userIsAdmin(u.uid);
  } else {
    signoutBtn.style.display = 'none';
    signinBtn.style.display = 'inline-block';
    signupBtn.style.display = 'inline-block';
    emailEl.style.display = 'inline-block';
    passEl.style.display = 'inline-block';
  }
  roleBadge.textContent = isAdmin ? 'Admin (edit allowed)' : 'Read-only';
  attachMonthListener();
});

const monthLabelEl=document.getElementById('monthLabel');
document.getElementById('prev').onclick=()=>{ const d=parseISO(state.view); d.setMonth(d.getMonth()-1); state.view=isoLocal(d); attachMonthListener(); };
document.getElementById('next').onclick=()=>{ const d=parseISO(state.view); d.setMonth(d.getMonth()+1); state.view=isoLocal(d); attachMonthListener(); };

document.getElementById('exportAllBtn').onclick=()=> downloadCSV('bookings.csv', flattenBookings());
document.getElementById('exportMonthBtn').onclick=()=>{
  const d=parseISO(state.view), m=d.getMonth()+1, y=d.getFullYear();
  const s=isoLocal(new Date(y,m-1,1)), e=isoLocal(new Date(y,m,0));
  const rows=flattenBookings().filter(b=> !(b.end<s || b.start>e));
  downloadCSV(`bookings-${y}-${String(m).padStart(2,'0')}.csv`, rows);
};
function downloadCSV(filename,rows){
  const head=['room','start_date','end_date','guest_name','note','createdBy'];
  const esc=v=>(''+v).replace(/"/g,'""');
  const lines=[head.join(',')].concat(rows.map(r=>[`"${esc(r.room)}"`,`"${esc(r.start)}"`,`"${esc(r.end)}"`,`"${esc(r.name||'')}"`,`"${esc(r.note||'')}"`,`"${esc(r.createdBy||'')}"`].join(',')));
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

function attachMonthListener(){
  if (unsub) { unsub(); unsub=null; }
  const d=parseISO(state.view);
  const startISO = isoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  const endISO   = isoLocal(new Date(d.getFullYear(), d.getMonth()+1, 0));
  const q = query(bookingsCol, where("end", ">=", startISO), where("start", "<=", endISO));
  unsub = onSnapshot(q, (snap)=>{
    const byRoom={}; for(const r of ROOMS) byRoom[r]=[];
    snap.forEach(docSnap=>{ const b=docSnap.data(); if(!byRoom[b.room]) byRoom[b.room]=[]; byRoom[b.room].push({ id: docSnap.id, ...b }); });
    state.bookings = byRoom; paint();
  }, (err)=>{ console.error(err); paint(); });
}

const roomsGrid=document.getElementById('roomsGrid');
function flattenBookings(){ const rows=[]; for(const room of ROOMS){ for(const b of (state.bookings[room]||[])){ rows.push({room, ...b}); } } return rows; }
function isBooked(room, dayISO){ return (state.bookings[room]||[]).some(b=> dayISO>=b.start && dayISO<=b.end); }

function paint(){
  const d=parseISO(state.view); monthLabelEl.textContent=monthLabel(d); roomsGrid.innerHTML='';
  const base=new Date(Date.UTC(2021,7,2));
  const weekdays=[...Array(7)].map((_,i)=>{ const x=new Date(base); x.setDate(x.getDate()+i); return x.toLocaleDateString('en-GB',{weekday:'narrow'}).toUpperCase(); });
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
        const dISO=isoLocal(day);
        el.classList.add(isBooked(room,dISO)?'busy':'free');
        el.textContent = day.getDate();
        if(sameDate(day,new Date())) el.classList.add('today');
        el.onclick=()=>onDayTap(room,day);
      } else { el.classList.add('empty'); el.textContent=''; }
      grid.appendChild(el);
    }
    const title=document.createElement('div'); title.className='room-title'; title.textContent=room;
    card.appendChild(grid); card.appendChild(title); roomsGrid.appendChild(card);
  }
}

const sheet=document.getElementById('sheet'); const backdrop=document.getElementById('sheetBackdrop'); const form=document.getElementById('sheetForm');
const startInput=document.getElementById('startInput'); const endInput=document.getElementById('endInput');
const nameInput=document.getElementById('nameInput'); const noteInput=document.getElementById('noteInput');
const deleteBtn=document.getElementById('deleteBtn'); const closeBtn=document.getElementById('closeBtn'); const saveBtn=document.getElementById('saveBtn');
let currentEdit=null;

function autosize(el){ el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; }
function openSheet(mode, room, booking){
  currentEdit={mode, room, booking};
  sheet.classList.add('open'); backdrop.classList.add('open'); sheet.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  startInput.value=booking.start; endInput.value=booking.end; nameInput.value=booking.name||''; noteInput.value=booking.note||''; autosize(noteInput);
  const canWrite=isAdmin;
  deleteBtn.style.display = (mode==='edit' && canWrite) ? 'inline-block' : 'none';
  saveBtn.disabled=!canWrite; saveBtn.textContent=canWrite?'Save':'Read-only';
  closeBtn.onclick=closeSheet; backdrop.onclick=closeSheet; noteInput.oninput=()=> autosize(noteInput);
}
function closeSheet(){ sheet.classList.remove('open'); backdrop.classList.remove('open'); sheet.setAttribute('aria-hidden','true'); document.body.style.overflow='auto'; currentEdit=null; }

async function onDayTap(room,date){
  const dISO=isoLocal(date);
  const list=state.bookings[room]||[];
  const hit=list.find(b=> dISO>=b.start && dISO<=b.end);
  if(hit){ openSheet('edit', room, hit); return; }
  openSheet('create', room, {start:dISO, end:dISO, name:'', note:''});
}
deleteBtn.onclick = async ()=>{ if(!currentEdit || !isAdmin) return; await deleteDoc(doc(db,"bookings", currentEdit.booking.id)); closeSheet(); };
form.onsubmit = async (e)=>{
  e.preventDefault();
  if(!currentEdit) return;
  const s=startInput.value, eDate=endInput.value;
  const [ss,ee]= s<=eDate ? [s,eDate] : [eDate,s];
  const payload={ room: currentEdit.room, start:ss, end:ee, name:nameInput.value||'', note:noteInput.value||'', updatedAt: serverTimestamp(), createdBy: currentUser ? (currentUser.email || currentUser.uid) : '' };
  if(currentEdit.mode==='edit'){ if(!isAdmin) return; await updateDoc(doc(db,"bookings", currentEdit.booking.id), payload); }
  else { if(!isAdmin) return; payload.createdAt = serverTimestamp(); await addDoc(bookingsCol, payload); }
  closeSheet();
};
paint();
