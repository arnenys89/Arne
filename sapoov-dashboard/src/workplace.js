const PREFIX='/api/werkplekreservatie';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const uuid=()=>crypto.randomUUID();
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'));
const validTime=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const stamp=(date,time)=>date+'T'+time+':00';
const dateString=d=>d.toISOString().slice(0,10);
async function getLegacyUser(db,identity){
 let user=await db.prepare('SELECT id,email,name FROM wp_users WHERE lower(email)=lower(?) LIMIT 1').bind(identity.email).first();
 if(!user){const userId=uuid(),name=identity.name||identity.email.split('@')[0];await db.prepare('INSERT INTO wp_users(id,email,name,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').bind(userId,identity.email,name).run();user={id:userId,email:identity.email,name};}
 return user;
}
async function audit(db,user,action,workstationId,workstationName,details){
 await db.prepare('INSERT INTO wp_audit_logs(id,created_at,user_id,user_email,user_name,workstation_id,workstation_name,action,details) VALUES(?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?)')
 .bind(uuid(),user.id,user.email,user.name,workstationId||null,workstationName||null,action,JSON.stringify(details||{})).run();
}
function addMonths(date,months){
 const base=new Date(date+'T12:00:00Z'),target=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+months,1));
 target.setUTCDate(Math.min(base.getUTCDate(),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));
 return dateString(target);
}
function makeSlots(date,from,to,recurrence){
 let count=1;if(recurrence==='weekly')count=8;if(recurrence==='monthly')count=6;
 if(recurrence==='schoolyear'){const start=new Date(date+'T12:00:00Z'),month=start.getUTCMonth(),endYear=start.getUTCFullYear()+(month>=6?1:0),end=new Date(Date.UTC(endYear,5,30));count=Math.max(1,Math.floor((end-start)/(7*86400000))+1);}
 const slots=[];
 for(let i=0;i<count;i++){let day=date;if(recurrence==='weekly'||recurrence==='schoolyear'){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*i);day=dateString(d);}if(recurrence==='monthly')day=addMonths(date,i);slots.push({start:stamp(day,from),end:stamp(day,to)});}
 return slots;
}
export async function handleWorkplace(request,env,identity,centralUser){
 const url=new URL(request.url),path='/api'+url.pathname.slice(PREFIX.length),db=env.DB;
 if(!db)return json({error:'De centrale database is niet beschikbaar.'},503);
 const app=await db.prepare('SELECT id,access_audience,status FROM applications WHERE id=?').bind('werkplekreservatie').first();
 const dashboardAudience='054dbe1a5080009991cecfb82474037a7efb146c6815ade0ccc5c8919183ee98';
 if(!app||app.status!=='active'||!app.access_audience||(!identity.audiences.includes(app.access_audience)&&!identity.audiences.includes(dashboardAudience)))return json({error:'Je hebt geen toegang tot Werkplekreservatie.'},403);
 const roleRows=await db.prepare('SELECT r.id,r.name,r.permissions_json,uar.scope_json FROM user_app_roles uar JOIN roles r ON r.id=uar.role_id WHERE uar.user_id=? AND uar.application_id=?').bind(centralUser.id,'werkplekreservatie').all();
 if(!roleRows.results.length)return json({error:'Je hebt geen rol toegewezen voor Werkplekreservatie.'},403);
 const permissions=[...new Set(roleRows.results.flatMap(r=>{try{return JSON.parse(r.permissions_json||'[]')}catch{return []}}))];
 const user=await getLegacyUser(db,identity);
 if(path==='/api/page'&&request.method==='GET'){
  if(!env.ASSETS)return json({error:'De dashboardbestanden zijn niet beschikbaar.'},503);
  return env.ASSETS.fetch(new Request(new URL('/werkplekreservatie.html',request.url),{method:'GET',headers:request.headers}));
 }
 if(path==='/api/bootstrap'&&request.method==='GET'){
  const [campuses,floors,rooms,workstations,photo]=await Promise.all([
   db.prepare('SELECT id,name FROM wp_campuses ORDER BY name').all(),
   db.prepare('SELECT id,campus_id,name FROM wp_floors ORDER BY name').all(),
   db.prepare('SELECT id,floor_id,name FROM wp_rooms ORDER BY name').all(),
   db.prepare("SELECT w.id,w.room_id,w.name,w.active,w.extra_info,r.name AS room_name,f.name AS floor_name,c.id AS campus_id,c.name AS campus_name FROM wp_workstations w JOIN wp_rooms r ON r.id=w.room_id JOIN wp_floors f ON f.id=r.floor_id JOIN wp_campuses c ON c.id=f.campus_id WHERE w.active=1 ORDER BY c.name,f.name,r.name,w.name").all(),
   db.prepare('SELECT picture_url FROM wp_user_profile_photos WHERE user_id=?').bind(user.id).first()
  ]);
  return json({user:{id:user.id,email:user.email,name:user.name,role:permissions.includes('*')?'admin':permissions.includes('reservations.manage_team')?'teamleider':'medewerker',permissions,picture_url:photo?.picture_url||''},campuses:campuses.results,floors:floors.results,rooms:rooms.results,workstations:workstations.results});
 }
 if(path==='/api/favorites'&&request.method==='GET'){const rows=await db.prepare('SELECT workstation_id FROM wp_user_favorite_workstations WHERE user_id=? ORDER BY created_at').bind(user.id).all();return json({favorites:rows.results.map(x=>x.workstation_id)});}
 if(path==='/api/favorites'&&request.method==='POST'){
  const body=await request.json().catch(()=>null),deskId=typeof body?.workstation_id==='string'?body.workstation_id:'';
  if(!deskId)return json({error:'Kies een geldige werkplek.'},400);
  const desk=await db.prepare('SELECT id FROM wp_workstations WHERE id=? AND active=1').bind(deskId).first();if(!desk)return json({error:'Deze werkplek is niet beschikbaar.'},404);
  await db.prepare('INSERT OR IGNORE INTO wp_user_favorite_workstations(user_id,workstation_id) VALUES(?,?)').bind(user.id,deskId).run();return json({ok:true});
 }
 if(path.startsWith('/api/favorites/')&&request.method==='DELETE'){const deskId=decodeURIComponent(path.slice('/api/favorites/'.length));await db.prepare('DELETE FROM wp_user_favorite_workstations WHERE user_id=? AND workstation_id=?').bind(user.id,deskId).run();return json({ok:true});}
 if(path==='/api/availability'&&request.method==='GET'){
  const date=url.searchParams.get('date')||'';if(!validDate(date))return json({error:'Ongeldige datum.'},400);
  const rows=await db.prepare("SELECT r.id,r.user_id,r.workstation_id,r.start_at,r.end_at,r.user_name,r.user_email,p.picture_url AS user_picture_url FROM wp_reservations r LEFT JOIN wp_user_profile_photos p ON p.user_id=r.user_id WHERE r.status='active' AND r.start_at < ? AND r.end_at > ?").bind(date+'T23:59:59',date+'T00:00:00').all();
  return json({reservations:rows.results});
 }
 if(path==='/api/my-reservations'&&request.method==='GET'){
  const rows=await db.prepare('SELECT r.id,r.series_id,r.workstation_id,w.name AS workstation_name,r.start_at,r.end_at,r.recurrence,r.remarks,r.status,c.name AS campus_name,rm.name AS room_name FROM wp_reservations r JOIN wp_workstations w ON w.id=r.workstation_id JOIN wp_rooms rm ON rm.id=w.room_id JOIN wp_floors f ON f.id=rm.floor_id JOIN wp_campuses c ON c.id=f.campus_id WHERE r.user_id=? ORDER BY r.start_at DESC LIMIT 200').bind(user.id).all();
  return json({reservations:rows.results});
 }
 if(path==='/api/reservations'&&request.method==='POST'){
  const body=await request.json().catch(()=>null),workstationId=typeof body?.workstation_id==='string'?body.workstation_id:'',date=body?.date,from=body?.from,to=body?.to,recurrence=body?.recurrence||'once',remarks=typeof body?.remarks==='string'?body.remarks.trim().slice(0,1000):'';
  if(!workstationId||!validDate(date)||!validTime(from)||!validTime(to)||to<=from||!['once','weekly','monthly','schoolyear'].includes(recurrence))return json({error:'Controleer werkplek, datum en tijdstip.'},400);
  if(!permissions.includes('*')&&!permissions.includes('reservations.create')&&!permissions.includes('reservations.manage_team'))return json({error:'Je hebt geen rechten om reservaties aan te maken.'},403);
  const desk=await db.prepare('SELECT id,name FROM wp_workstations WHERE id=? AND active=1').bind(workstationId).first();if(!desk)return json({error:'Deze werkplek bestaat niet of is niet beschikbaar.'},404);
  const slots=makeSlots(date,from,to,recurrence);
  for(const slot of slots){const conflict=await db.prepare("SELECT id FROM wp_reservations WHERE workstation_id=? AND status='active' AND start_at < ? AND end_at > ? LIMIT 1").bind(workstationId,slot.end,slot.start).first();if(conflict)return json({error:'De werkplek is niet vrij op '+slot.start.slice(0,10)+'. Er werd niets gereserveerd.'},409);}
  const seriesId=uuid(),statements=[];
  for(const slot of slots){const reservationId=uuid();
   statements.push(db.prepare("INSERT INTO wp_reservations(id,series_id,user_id,user_email,user_name,workstation_id,start_at,end_at,recurrence,remarks,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?, 'active',CURRENT_TIMESTAMP)").bind(reservationId,seriesId,user.id,user.email,user.name,workstationId,slot.start,slot.end,recurrence,remarks));
   statements.push(db.prepare("INSERT INTO wp_audit_logs(id,created_at,user_id,user_email,user_name,workstation_id,workstation_name,action,details) VALUES(?,CURRENT_TIMESTAMP,?,?,?,?,?,'reservation_created',?)").bind(uuid(),user.id,user.email,user.name,workstationId,desk.name,JSON.stringify({reservation_id:reservationId,start_at:slot.start,end_at:slot.end,series_id:seriesId})));
  }
  await db.batch(statements);return json({ok:true,series_id:seriesId,created:slots.length},201);
 }
 if(path==='/api/reservations'&&request.method==='PATCH'){
  const body=await request.json().catch(()=>null),idValue=typeof body?.id==='string'?body.id:'',workstationId=typeof body?.workstation_id==='string'?body.workstation_id:'',start=typeof body?.start_at==='string'?body.start_at:'',finish=typeof body?.end_at==='string'?body.end_at:'';
  const validStamp=v=>/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:00$/.test(v);
  if(!idValue||!workstationId||!validStamp(start)||!validStamp(finish)||finish<=start)return json({error:'Controleer de werkplek en de nieuwe begin- en eindtijd.'},400);
  const current=await db.prepare("SELECT id,workstation_id,start_at,end_at,user_id FROM wp_reservations WHERE id=? AND status='active'").bind(idValue).first();
  if(!current||current.user_id!==user.id)return json({error:'Je kan alleen je eigen actieve reservaties verplaatsen.'},403);
  const desk=await db.prepare('SELECT id,name FROM wp_workstations WHERE id=? AND active=1').bind(workstationId).first();if(!desk)return json({error:'Deze werkplek is niet beschikbaar.'},404);
  const conflict=await db.prepare("SELECT id FROM wp_reservations WHERE workstation_id=? AND status='active' AND id<>? AND start_at < ? AND end_at > ? LIMIT 1").bind(workstationId,idValue,finish,start).first();if(conflict)return json({error:'De werkplek is op dat tijdstip al gereserveerd.'},409);
  await db.prepare("UPDATE wp_reservations SET workstation_id=?,start_at=?,end_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='active'").bind(workstationId,start,finish,idValue,user.id).run();
  await audit(db,user,'reservation_updated',workstationId,desk.name,{reservation_id:idValue,previous_workstation_id:current.workstation_id,previous_start_at:current.start_at,previous_end_at:current.end_at,new_start_at:start,new_end_at:finish});return json({ok:true});
 }
 const cancelMatch=path.match(/^\/api\/reservations\/([a-f0-9-]+)$/i);
 if(cancelMatch&&request.method==='DELETE'){
  const idValue=decodeURIComponent(cancelMatch[1]),current=await db.prepare("SELECT id,workstation_id FROM wp_reservations WHERE id=? AND user_id=? AND status='active'").bind(idValue,user.id).first();
  if(!current)return json({error:'Reservatie niet gevonden of niet annuleerbaar.'},404);
  const result=await db.prepare("UPDATE wp_reservations SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='active'").bind(idValue,user.id).run();if(!result.meta?.changes)return json({error:'Reservatie niet gevonden of niet annuleerbaar.'},404);
  const desk=await db.prepare('SELECT name FROM wp_workstations WHERE id=?').bind(current.workstation_id).first();await audit(db,user,'reservation_cancelled',current.workstation_id,desk?.name,{reservation_id:idValue});return json({ok:true});
 }
 return json({error:'Werkplekreservatie-eindpunt niet gevonden.'},404);
}