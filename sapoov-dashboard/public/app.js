const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconSvg = icon => { const paths = {"shopping-cart":"<path d=\"M3 4h2l2.5 12h11L21 8H6\"/><circle cx=\"10\" cy=\"20\" r=\"1.5\"/><circle cx=\"18\" cy=\"20\" r=\"1.5\"/><path d=\"M9 11h9\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18M7 14h3m3 0h4m-10 3h3\"/>","graduation-cap":"<path d=\"m2 9 10-5 10 5-10 5z\"/><path d=\"M6 11v5c3 3 9 3 12 0v-5m4-2v7\"/>","calendar-check":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18m4 5 2 2 4-5\"/>","book-open":"<path d=\"M3 5c4-1 7 0 9 2v13c-2-2-5-3-9-2zM21 5c-4-1-7 0-9 2v13c2-2 5-3 9-2z\"/>","layout-dashboard":"<rect x=\"3\" y=\"3\" width=\"8\" height=\"8\" rx=\"1\"/><rect x=\"13\" y=\"3\" width=\"8\" height=\"5\" rx=\"1\"/><rect x=\"13\" y=\"10\" width=\"8\" height=\"11\" rx=\"1\"/><rect x=\"3\" y=\"13\" width=\"8\" height=\"8\" rx=\"1\"/>","network":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><circle cx=\"4\" cy=\"4\" r=\"2\"/><circle cx=\"20\" cy=\"4\" r=\"2\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/><circle cx=\"20\" cy=\"20\" r=\"2\"/><path d=\"m10 10-4-4m8 4 4-4m-8 8-4 4m8-4 4 4\"/>","clipboard-list":"<rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2h6v2M9 10h6m-6 4h6m-6 4h4\"/>","compass":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m15.5 8.5-2.5 6-6 2.5 2.5-6z\"/>"}; const path = paths[icon] || '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>'; return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>'; };
let me=null, users=[], dashboardApps=[], adminApps=[], roles=[], assignments=[], organizationUnits=[], accessScopes=[], roleScopes=[], selectedOrganizationUnit=null, availableContexts=[], education={classes:[],campuses:[],school_years:[]}, personnel=[], students=[], selectedApp='', selectedUser='', editingRole=null;
async function api(path,options={}) {
 const response=await fetch(path,{...options,headers:{'accept':'application/json','content-type':'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(data.error||`HTTP ${response.status}`);
 return data;
}
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
async function loadAdmin(){
 const [matrix,audit]=await Promise.all([api('/api/admin/rights-matrix'),api('/api/admin/audit')]);
 users=matrix.users;
 adminApps=matrix.applications;
 roles=matrix.roles;
 assignments=(matrix.assignments||[]).map(x=>({...x,scope:JSON.parse(x.scope_json||'{}')}));
 organizationUnits=matrix.organizationUnits||[];
 accessScopes=matrix.accessScopes||[];
 roleScopes=matrix.roleScopes||[];
 const accessCounts=new Map();
 for(const x of accessScopes){if(Number(x.enabled)===1)accessCounts.set(x.user_id,(accessCounts.get(x.user_id)||0)+1);}
 users=users.map(u=>({...u,application_count:accessCounts.get(u.id)||0}));
 if(!selectedApp||!adminApps.some(x=>x.id===selectedApp))selectedApp=adminApps[0]?.id||'';
 if(!selectedUser||!users.some(x=>x.id===selectedUser))selectedUser=users[0]?.id||'';
 renderAdmin();
 renderRightsMatrix();
 $('audit').innerHTML=audit.events.map(e=>`<div class="audit-row"><b>${esc(e.action)}</b><span>${esc(e.actor_email)}</span><small>${esc(e.created_at)}</small></div>`).join('')||'<p class="muted">Nog geen wijzigingen.</p>';
}
function renderAdmin(){
 $('user-count').textContent=users.length;
 $('user-list').innerHTML=users.map(u=>`<button class="user-item ${u.id===selectedUser?'selected':''}" data-user="${esc(u.id)}"><b>${esc(u.display_name||u.email)}</b><small>${esc(u.email)}</small><span>${u.application_count} toepassingen</span></button>`).join('')||'<p class="muted">Er zijn nog geen gebruikers geregistreerd. Een gebruiker verschijnt na de eerste beveiligde aanmelding.</p>';
 $('app-select').innerHTML=adminApps.map(a=>`<option value="${esc(a.id)}" ${a.id===selectedApp?'selected':''}>${esc(a.name)}</option>`).join('');
 const app=adminApps.find(a=>a.id===selectedApp), appRoles=roles.filter(r=>r.application_id===selectedApp);
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
function renderRightsMatrix(){
 const term=$('matrix-search').value.trim().toLowerCase();
 const filtered=users.filter(u=>{const email=String(u.email||'').toLowerCase(),domain=email.includes('@')?email.split('@').pop():'';return (String(u.display_name||'')+' '+email+' '+domain).toLowerCase().includes(term);});
 const children=new Map();for(const unit of organizationUnits){const key=unit.parent_id||'';if(!children.has(key))children.set(key,[]);children.get(key).push(unit);}
 const roots=children.get('')||[],appList=adminApps.filter(a=>a.status!=='hidden'),rolesFor=app=>roles.filter(r=>r.application_id===app.id);
 const accessMap=new Map(accessScopes.map(x=>[x.user_id+'|'+x.application_id+'|'+x.organization_unit_id,Number(x.enabled)===1]));
 const roleMap=new Map(roleScopes.map(x=>[x.user_id+'|'+x.application_id+'|'+x.role_id+'|'+x.organization_unit_id,Number(x.enabled)===1]));
 const ownWidth=appList.reduce((sum,a)=>sum+1+rolesFor(a).length,0);
 const width=node=>ownWidth+(children.get(node.id)||[]).reduce((sum,c)=>sum+width(c),0);
 const depth=node=>Math.max(0,...(children.get(node.id)||[]).map(c=>1+depth(c)));
 const maxDepth=Math.max(0,...roots.map(depth)),totalRows=2*maxDepth+3,headerRows=Array.from({length:totalRows},()=>[]);
 const addNodeHeader=(node,level)=>{
  const kids=children.get(node.id)||[];
  headerRows[2*level].push('<th colspan="'+width(node)+'" class="matrix-org-head matrix-level-'+level+'" title="'+esc(node.name)+'">'+esc(node.name)+' <small>'+esc(({koepel:'Koepel',schoolbestuur:'Schoolbestuur',school:'School',locatie:'Campus/vestiging'}[node.unit_type]||node.unit_type))+'</small></th>');
  for(const a of appList){
   const rr=rolesFor(a);headerRows[2*level+1].push('<th colspan="'+(1+rr.length)+'" class="matrix-app-head" title="'+esc(a.name)+'">'+esc(a.name)+'</th>');
   const rowspan=kids.length?1:Math.max(1,totalRows-(2*level+2));
   headerRows[2*level+2].push('<th rowspan="'+rowspan+'" class="matrix-subhead">Toegang</th>');
   for(const role of rr)headerRows[2*level+2].push('<th rowspan="'+rowspan+'" class="matrix-subhead" title="'+esc(role.description||role.name)+'">'+esc(role.name)+'</th>');
  }
  for(const child of kids)addNodeHeader(child,level+1);
 };
 for(const root of roots)addNodeHeader(root,0);
 const header='<thead>'+headerRows.map((row,i)=>'<tr>'+(i===0?'<th class="matrix-user-head" rowspan="'+totalRows+'">Gebruiker</th>':'')+row.join('')+'</tr>').join('')+'</thead>';
 const renderCells=(node,user)=>{
  let cells='';
  for(const a of appList){
   const enabled=accessMap.get(user.id+'|'+a.id+'|'+node.id)===true;
   cells+='<td class="matrix-check"><input type="checkbox" data-org-access data-user="'+esc(user.id)+'" data-app="'+esc(a.id)+'" data-org-unit="'+esc(node.id)+'" aria-label="Toegang '+esc(a.name)+' voor '+esc(user.email)+' binnen '+esc(node.name)+'" '+(enabled?'checked':'')+'></td>';
   for(const role of rolesFor(a)){
    const assigned=roleMap.get(user.id+'|'+a.id+'|'+role.id+'|'+node.id)===true;
    cells+='<td class="matrix-check"><input type="checkbox" data-org-role data-user="'+esc(user.id)+'" data-app="'+esc(a.id)+'" data-org-unit="'+esc(node.id)+'" data-role="'+esc(role.id)+'" aria-label="Rol '+esc(role.name)+' voor '+esc(user.email)+' binnen '+esc(node.name)+'" '+(assigned?'checked':'')+'></td>';
   }
  }
  return cells+(children.get(node.id)||[]).map(child=>renderCells(child,user)).join('');
 };
 let body='';
 for(const user of filtered){body+='<tr><th scope="row" class="matrix-user"><b>'+esc(user.display_name||user.email)+'</b><small>'+esc(user.email)+'</small>'+(user.status!=='active'?'<span class="matrix-status">'+esc(user.status)+'</span>':'')+'</th>'+roots.map(root=>renderCells(root,user)).join('')+'</tr>';}
 if(!filtered.length)body+='<tr><td class="matrix-empty" colspan="'+(1+roots.reduce((n,r)=>n+width(r),0))+'">Geen gebruikers gevonden.</td></tr>';
 $('rights-matrix').innerHTML=header+'<tbody>'+body+'</tbody>';
}

function renderEducation(){
 const classes=education.classes||[], campuses=education.campuses||[], years=education.school_years||[];
 $('class-count').textContent=classes.length;
 $('education-summary').innerHTML=[{label:'Klassen',value:classes.length},{label:'Campussen',value:campuses.length},{label:'Schooljaren',value:years.length}].map(x=>'<div class="education-stat"><b>'+x.value+'</b><span>'+esc(x.label)+'</span></div>').join('');
 const campusValue=$('campus-filter').value, yearValue=$('year-filter').value;
 $('campus-filter').innerHTML='<option value="">Alle campussen</option>'+campuses.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join(''); $('campus-filter').value=campusValue;
 $('year-filter').innerHTML='<option value="">Alle schooljaren</option>'+years.map(y=>'<option value="'+esc(y.id)+'">'+esc(y.label)+'</option>').join(''); $('year-filter').value=yearValue;
 const term=$('class-search').value.trim().toLowerCase();
 const filtered=classes.filter(c=>(!campusValue||c.campus_id===campusValue)&&(!yearValue||c.school_year_id===yearValue)&&(!term||(c.class_code+' '+c.display_name+' '+c.campus_name).toLowerCase().includes(term)));
 $('class-rows').innerHTML=filtered.map(c=>'<tr><td><b>'+esc(c.display_name||c.class_code)+'</b><small>'+esc(c.class_code)+'</small></td><td>'+esc(c.campus_name)+'</td><td>'+esc((years.find(y=>y.id===c.school_year_id)||{}).label||c.school_year_id)+'</td><td><span class="status-pill '+(c.active?'active':'inactive')+'">'+(c.active?'Actief':'Inactief')+'</span></td></tr>').join('')||'<tr><td colspan="4" class="empty-row">Geen klassen gevonden.</td></tr>';
}
function renderPersonnel(){
 $('personnel-count').textContent=personnel.length;
 $('personnel-campus').innerHTML='<option value="">Niet toegewezen</option>'+education.campuses.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
 $('personnel-rows').innerHTML=personnel.map(p=>'<tr><td><b>'+esc(p.display_name||p.email)+'</b><small>'+esc(p.email)+'</small></td><td>'+esc(p.campus_name||'—')+'</td><td>'+esc(({active:'Actief',inactive:'Niet actief',leave:'Afwezig / verlof',unknown:'Niet ingesteld'})[p.employment_status]||p.employment_status)+'</td><td><button class="small-btn" data-personnel="'+esc(p.user_id)+'">Beheren</button></td></tr>').join('');
}
function renderStudents(){
 $('student-count').textContent=students.count||0;
 $('student-rows').innerHTML=(students.students||[]).map(s=>'<tr><td>'+esc(s.preferred_name||s.first_name)+' '+esc(s.last_name)+'</td><td>'+esc(s.student_number)+'</td><td>'+esc(s.class_code||'—')+'</td><td>'+esc((students.school_years||[]).find(y=>y.id===s.school_year_id)?.label||s.school_year_id||'—')+'</td><td>'+esc(s.status)+'</td></tr>').join('')||'<tr><td colspan="5" class="empty-row">Nog geen leerlinggegevens ingevoerd.</td></tr>';
 $('enrol-student').innerHTML='<option value="">Selecteer leerling</option>'+(students.students||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.first_name+' '+s.last_name+' ('+s.student_number+')')+'</option>').join('');
 $('enrol-year').innerHTML='<option value="">Selecteer schooljaar</option>'+(students.school_years||[]).map(y=>'<option value="'+esc(y.id)+'">'+esc(y.label)+'</option>').join('');
 updateEnrolClasses();
}
function updateEnrolClasses(){const y=$('enrol-year').value;$('enrol-class').innerHTML='<option value="">Selecteer klas</option>'+(students.classes||[]).filter(c=>c.school_year_id===y).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.campus_name+' · '+c.class_code)+'</option>').join('');}
function contextUrl(target){const u=new URL(target,window.location.origin);if(selectedOrganizationUnit)u.searchParams.set('organizationUnitId',selectedOrganizationUnit.id);return u.href;}
function applyContextToLinks(){document.querySelectorAll('.sapoov-side-link').forEach(link=>{const base=link.dataset.baseHref||link.getAttribute('href');if(!link.dataset.baseHref)link.dataset.baseHref=base;link.href=selectedOrganizationUnit?contextUrl(base):base;});}
function renderApps(){
 const needsContext=!selectedOrganizationUnit;
 if(needsContext&&!me?.superadmin){
  $('apps').innerHTML='<div class="message">Kies eerst de organisatiecontext waarin je wilt werken.</div>';applyContextToLinks();return;
 }
 $('apps').innerHTML=dashboardApps.map(a=>{
  const internal=['werkplekreservatie','beleidskompas'].includes(a.id);
  const target=a.id==='werkplekreservatie'?'/werkplekreservatie':a.id==='beleidskompas'?'/beleidskompas':(a.url||'#');
  return `<a class="app" data-app-target="${esc(target)}" href="${needsContext?'#':esc(contextUrl(target))}" ${needsContext?'aria-label="'+esc(a.name)+' — kies eerst een organisatiecontext"':(internal?'':'target="_blank" rel="noopener noreferrer"')}><span class="app-icon">${iconSvg(a.icon)}</span><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p>${needsContext?'<small>Kies een school of bestuur om te openen</small>':''}</a>`;
 }).join('')||'<div class="message">Er zijn momenteel geen actieve toepassingen beschikbaar.</div>';
 applyContextToLinks();
}
async function selectOrganizationContext(unitId){
 const data=await api('/api/me?organizationUnitId='+encodeURIComponent(unitId));
 me=data;selectedOrganizationUnit=data.selectedOrganizationUnit;dashboardApps=data.applications;assignments=data.assignments;
 $('organization-context').value=unitId;$('message').textContent='Actieve organisatiecontext: '+selectedOrganizationUnit.name+'.';renderApps();
}
async function start(){
 try{
  const data=await api('/api/me');me=data;$('identity').textContent=(data.user.display_name||data.user.email)+' · '+data.user.email+' · '+(data.superadmin?'Superadmin':'Standaardaccount');availableContexts=data.contexts||[];
  $('organization-context').innerHTML='<option value="">Kies een organisatiecontext…</option>'+availableContexts.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(({koepel:'Koepel',schoolbestuur:'Schoolbestuur',school:'School',locatie:'Campus/vestiging'}[x.unit_type]||x.unit_type))+'</option>').join('');
  $('context-picker').classList.toggle('hidden',availableContexts.length===0);
  if(availableContexts.length===1){$('context-picker').classList.remove('hidden');await selectOrganizationContext(availableContexts[0].id);}
  else if(availableContexts.length>1){
   selectedOrganizationUnit=null;
   if(data.superadmin){dashboardApps=data.applications||[];$('message').textContent='Superadministrator: alle actieve modules van alle besturen en scholen zijn zichtbaar. Kies een organisatiecontext om een module te openen.';}
   else{$('message').textContent='Kies de organisatiecontext waarin je wilt werken. Je ziet alleen toepassingen waarvoor je daar expliciet toegang hebt.';dashboardApps=[];}
   renderApps();
  }
  else if(data.superadmin){selectedOrganizationUnit=null;dashboardApps=data.applications||[];$('message').textContent='Superadministrator: alle actieve modules zijn zichtbaar. Kies een organisatiecontext om een module te openen.';renderApps();}
  else{$('message').textContent='Er is nog geen organisatiecontext met expliciet toegekende toepassingstoegang aan je account gekoppeld.';dashboardApps=[];renderApps();}
  if(data.superadmin){
   $('admin').classList.remove('hidden');$('admin-nav').classList.remove('hidden');
   try{await loadAdmin();}
   catch(adminError){notice('Het dashboard is geladen, maar het gebruikersbeheer kon niet volledig worden geladen: '+adminError.message,true);}
   if(Array.isArray(data.applications))dashboardApps=data.applications;
   renderApps();
  }
 }catch(error){notice(error.message,true);$('message').textContent='Dashboardinitialisatie onvolledig: '+error.message;if(dashboardApps.length)renderApps();}
}
$('organization-context').addEventListener('change',async e=>{if(!e.target.value){selectedOrganizationUnit=null;if(me?.superadmin){dashboardApps=me.applications||dashboardApps;}else{dashboardApps=[];}renderApps();return;}try{await selectOrganizationContext(e.target.value);}catch(error){notice(error.message,true);}});
$('apps').addEventListener('click',e=>{const card=e.target.closest('[data-app-target]');if(!card||selectedOrganizationUnit)return;e.preventDefault();$('message').textContent='Kies eerst de school, campus of het bestuur waarin je deze module wilt openen.';$('organization-context').focus();});

$('admin-nav').addEventListener('click',()=>{$('admin').scrollIntoView({behavior:'smooth'});});
$('matrix-search').addEventListener('input',renderRightsMatrix);
$('rights-matrix').addEventListener('change',async e=>{
 const input=e.target.closest('input[data-org-access],input[data-org-role]');if(!input)return;
 const userId=input.dataset.user,applicationId=input.dataset.app,organizationUnitId=input.dataset.orgUnit,checked=input.checked;input.disabled=true;
 try{
  if(input.hasAttribute('data-org-access'))await api('/api/admin/organization-access',{method:'POST',body:JSON.stringify({userId,applicationId,organizationUnitId,enabled:checked})});
  else await api('/api/admin/organization-roles',{method:'POST',body:JSON.stringify({userId,applicationId,roleId:input.dataset.role,organizationUnitId,enabled:checked})});
  await loadAdmin();notice(checked?'Expliciet recht of toegang toegekend.':'Expliciet recht of toegang ingetrokken.');
 }catch(err){input.checked=!checked;input.disabled=false;notice(err.message,true);}
});

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
$('personnel-rows').addEventListener('click',e=>{const b=e.target.closest('[data-personnel]');if(!b)return;const p=personnel.find(x=>x.user_id===b.dataset.personnel);if(!p)return;$('personnel-user-id').value=p.user_id;$('personnel-number').value=p.staff_number||'';$('personnel-campus').value=p.campus_id||'';$('personnel-status').value=p.employment_status||'unknown';$('personnel-start').value=p.start_date||'';$('personnel-end').value=p.end_date||'';$('personnel-editor').classList.remove('hidden');$('personnel-editor').scrollIntoView({behavior:'smooth',block:'center'});});
$('cancel-personnel').addEventListener('click',()=>$('personnel-editor').classList.add('hidden'));
$('save-personnel').addEventListener('click',async()=>{try{await api('/api/admin/personnel',{method:'POST',body:JSON.stringify({userId:$('personnel-user-id').value,staffNumber:$('personnel-number').value.trim()||null,campusId:$('personnel-campus').value||null,employmentStatus:$('personnel-status').value,startDate:$('personnel-start').value||null,endDate:$('personnel-end').value||null})});$('personnel-editor').classList.add('hidden');await loadAdmin();notice('Personeelsprofiel opgeslagen.');}catch(e){notice(e.message,true);}});
$('save-student').addEventListener('click',async()=>{try{await api('/api/admin/students',{method:'POST',body:JSON.stringify({studentNumber:$('student-number').value.trim(),firstName:$('student-first').value.trim(),lastName:$('student-last').value.trim(),preferredName:$('student-preferred').value.trim()})});$('student-number').value='';$('student-first').value='';$('student-last').value='';$('student-preferred').value='';await loadAdmin();notice('Leerling toegevoegd.');}catch(e){notice(e.message,true);}});
$('enrol-year').addEventListener('change',updateEnrolClasses);
$('save-enrolment').addEventListener('click',async()=>{try{await api('/api/admin/student-enrolments',{method:'POST',body:JSON.stringify({studentId:$('enrol-student').value,schoolYearId:$('enrol-year').value,classId:$('enrol-class').value,startDate:$('enrol-start').value||null})});await loadAdmin();notice('Klasinschrijving opgeslagen.');}catch(e){notice(e.message,true);}});
$('class-search').addEventListener('input',renderEducation);$('campus-filter').addEventListener('change',renderEducation);$('year-filter').addEventListener('change',renderEducation);
start();
