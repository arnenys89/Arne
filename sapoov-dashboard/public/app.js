const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconSvg = icon => { const paths = {"shopping-cart":"<path d=\"M3 4h2l2.5 12h11L21 8H6\"/><circle cx=\"10\" cy=\"20\" r=\"1.5\"/><circle cx=\"18\" cy=\"20\" r=\"1.5\"/><path d=\"M9 11h9\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18M7 14h3m3 0h4m-10 3h3\"/>","graduation-cap":"<path d=\"m2 9 10-5 10 5-10 5z\"/><path d=\"M6 11v5c3 3 9 3 12 0v-5m4-2v7\"/>","calendar-check":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18m4 5 2 2 4-5\"/>","book-open":"<path d=\"M3 5c4-1 7 0 9 2v13c-2-2-5-3-9-2zM21 5c-4-1-7 0-9 2v13c2-2 5-3 9-2z\"/>","layout-dashboard":"<rect x=\"3\" y=\"3\" width=\"8\" height=\"8\" rx=\"1\"/><rect x=\"13\" y=\"3\" width=\"8\" height=\"5\" rx=\"1\"/><rect x=\"13\" y=\"10\" width=\"8\" height=\"11\" rx=\"1\"/><rect x=\"3\" y=\"13\" width=\"8\" height=\"8\" rx=\"1\"/>","network":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><circle cx=\"4\" cy=\"4\" r=\"2\"/><circle cx=\"20\" cy=\"4\" r=\"2\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/><circle cx=\"20\" cy=\"20\" r=\"2\"/><path d=\"m10 10-4-4m8 4 4-4m-8 8-4 4m8-4 4 4\"/>","clipboard-list":"<rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2h6v2M9 10h6m-6 4h6m-6 4h4\"/>","compass":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m15.5 8.5-2.5 6-6 2.5 2.5-6z\"/>"}; const path = paths[icon] || '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>'; return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>'; };
let me=null, users=[], apps=[], roles=[], assignments=[], selectedApp='', selectedUser='', editingRole=null;
async function api(path,options={}) {
 const response=await fetch(path,{...options,headers:{'accept':'application/json','content-type':'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(data.error||`HTTP ${response.status}`);
 return data;
}
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
async function loadAdmin(){
 const [u,a,audit]=await Promise.all([api('/api/admin/users'),api('/api/admin/applications'),api('/api/admin/audit')]);
 users=u.users;assignments=u.assignments.map(x=>({...x,scope:JSON.parse(x.scope_json||'{}')}));apps=a.applications;roles=a.roles;
 if(!selectedApp||!apps.some(x=>x.id===selectedApp))selectedApp=apps[0]?.id||'';
 if(!selectedUser||!users.some(x=>x.id===selectedUser))selectedUser=users[0]?.id||'';
 renderAdmin();$('audit').innerHTML=audit.events.map(e=>`<div class="audit-row"><b>${esc(e.action)}</b><span>${esc(e.actor_email)}</span><small>${esc(e.created_at)}</small></div>`).join('')||'<p class="muted">Nog geen wijzigingen.</p>';
}
function renderAdmin(){
 $('user-count').textContent=users.length;
 $('user-list').innerHTML=users.map(u=>`<button class="user-item ${u.id===selectedUser?'selected':''}" data-user="${esc(u.id)}"><b>${esc(u.display_name||u.email)}</b><small>${esc(u.email)}</small><span>${u.application_count} toepassingen</span></button>`).join('')||'<p class="muted">Er zijn nog geen gebruikers geregistreerd. Een gebruiker verschijnt na de eerste beveiligde aanmelding.</p>';
 $('app-select').innerHTML=apps.map(a=>`<option value="${esc(a.id)}" ${a.id===selectedApp?'selected':''}>${esc(a.name)}</option>`).join('');
 const app=apps.find(a=>a.id===selectedApp), appRoles=roles.filter(r=>r.application_id===selectedApp);
 $('access-audience').value=app?.access_audience||'';
 $('role-count').textContent=appRoles.length;
 $('role-list').innerHTML=appRoles.map(r=>`<div class="role-item"><div><b>${esc(r.name)}</b><p>${esc(r.description)}</p><small>${esc((r.permissions||[]).join(' · ')||'Geen rechten gedefinieerd')}</small></div><div class="role-actions"><button class="small-btn" data-edit-role="${esc(r.id)}">Aanpassen</button><button class="small-btn danger" data-delete-role="${esc(r.id)}">Verwijderen</button></div></div>`).join('')||'<p class="muted">Nog geen rollen voor deze toepassing.</p>';
 const user=users.find(u=>u.id===selectedUser), userRoles=assignments.filter(x=>x.user_id===selectedUser&&x.application_id===selectedApp);
 $('selected-user').textContent=user?(user.display_name||user.email):'Selecteer een gebruiker';
 $('selected-email').textContent=user?.email||'';
 $('assigned-list').innerHTML=userRoles.map(x=>`<div class="assigned-role"><span>${esc(x.role_name)}<br><small>${esc(JSON.stringify(x.scope||{}))}</small></span><button class="small-btn danger" data-revoke="${esc(x.role_id)}" aria-label="Recht verwijderen">Verwijderen</button></div>`).join('')||'<p class="muted">Geen rollen toegewezen voor deze toepassing.</p>';
 $('assign-role').innerHTML='<option value="">Kies een rol…</option>'+appRoles.filter(r=>!userRoles.some(x=>x.role_id===r.id)).map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
 $('assign-role').disabled=!user;
 $('assign-button').disabled=!user||!appRoles.some(r=>!userRoles.some(x=>x.role_id===r.id));
 $('role-editor').classList.toggle('hidden',!editingRole);
 if(editingRole){$('role-name').value=editingRole.id?editingRole.name:'';$('role-description').value=editingRole.id?editingRole.description:'';$('role-permissions').value=editingRole.id?(editingRole.permissions||[]).join(', '):'';$('role-editor-title').textContent=editingRole.id?'Rol aanpassen':'Nieuwe rol';}
}
function renderApps(){
 $('apps').innerHTML=apps.filter(a=>me.superadmin||assignments.some(x=>x.application_id===a.id)).map(a=>{const internal=['werkplekreservatie','beleidskompas'].includes(a.id);const target=a.id==='werkplekreservatie'?'/werkplekreservatie':a.id==='beleidskompas'?'/beleidskompas':(a.url||'#');return `<a class="app" href="${esc(target)}" ${internal?'':'target="_blank" rel="noopener noreferrer"'}><span class="app-icon">${iconSvg(a.icon)}</span><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p></a>`}).join('')||'<div class="message">Er zijn nog geen toepassingen aan je account toegewezen.</div>';
}
async function start(){
 try{
  const data=await api('/api/me');me=data;$('identity').textContent=data.user.display_name||data.user.email;
  $('message').textContent=`Aangemeld als ${data.user.email}.`;apps=data.applications;assignments=data.assignments;renderApps();
  if(data.superadmin){$('admin').classList.remove('hidden');$('admin-nav').classList.remove('hidden');await loadAdmin();}
 }catch(error){notice(error.message,true);$('message').textContent=error.message;$('apps').innerHTML='';}
}
$('admin-nav').addEventListener('click',()=>{$('admin').scrollIntoView({behavior:'smooth'});});
$('user-list').addEventListener('click',e=>{const b=e.target.closest('[data-user]');if(b){selectedUser=b.dataset.user;renderAdmin();}});
$('app-select').addEventListener('change',e=>{selectedApp=e.target.value;editingRole=null;renderAdmin();});
$('save-audience').addEventListener('click',async()=>{try{await api('/api/admin/applications',{method:'POST',body:JSON.stringify({id:selectedApp,accessAudience:$('access-audience').value.trim()})});await loadAdmin();notice('Cloudflare Access-koppeling opgeslagen.');}catch(e){notice(e.message,true);}});
$('new-role').addEventListener('click',()=>{editingRole={};renderAdmin();$('role-name').focus();});
$('cancel-role').addEventListener('click',()=>{editingRole=null;renderAdmin();});
$('save-role').addEventListener('click',async()=>{
 try{const payload={applicationId:selectedApp,name:$('role-name').value.trim(),description:$('role-description').value.trim(),permissions:$('role-permissions').value.split(',').map(x=>x.trim()).filter(Boolean)};
 if(!payload.name)throw new Error('Geef de rol een naam.');
 if(editingRole.id){payload.id=editingRole.id;await api('/api/admin/roles',{method:'PUT',body:JSON.stringify(payload)});}else await api('/api/admin/roles',{method:'POST',body:JSON.stringify(payload)});
 editingRole=null;await loadAdmin();notice('Rol en rechten opgeslagen.');
 }catch(e){notice(e.message,true);}
});
$('role-list').addEventListener('click',async e=>{
 const edit=e.target.closest('[data-edit-role]'),del=e.target.closest('[data-delete-role]');
 if(edit){editingRole=roles.find(r=>r.id===edit.dataset.editRole);renderAdmin();}
 if(del&&confirm('Deze rol definitief verwijderen?')){try{await api('/api/admin/roles?id='+encodeURIComponent(del.dataset.deleteRole),{method:'DELETE'});await loadAdmin();notice('Rol verwijderd.');}catch(err){notice(err.message,true);}}
});
$('assign-button').addEventListener('click',async()=>{try{const roleId=$('assign-role').value;if(!roleId)throw new Error('Kies eerst een rol.');const scopeText=$('assign-scope').value.trim();let scope={};if(scopeText)scope=JSON.parse(scopeText);await api('/api/admin/assignments',{method:'POST',body:JSON.stringify({userId:selectedUser,applicationId:selectedApp,roleId,scope})});await loadAdmin();notice('Recht toegewezen.');}catch(e){notice(e.message,true);}});
$('assigned-list').addEventListener('click',async e=>{const b=e.target.closest('[data-revoke]');if(!b)return;if(!confirm('Deze roltoewijzing verwijderen?'))return;try{await api('/api/admin/assignments?userId='+encodeURIComponent(selectedUser)+'&applicationId='+encodeURIComponent(selectedApp)+'&roleId='+encodeURIComponent(b.dataset.revoke),{method:'DELETE'});await loadAdmin();notice('Recht verwijderd.');}catch(err){notice(err.message,true);}});
start();
