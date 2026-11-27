const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconSvg = icon => { const paths = {"shopping-cart":"<path d=\"M3 4h2l2.5 12h11L21 8H6\"/><circle cx=\"10\" cy=\"20\" r=\"1.5\"/><circle cx=\"18\" cy=\"20\" r=\"1.5\"/><path d=\"M9 11h9\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18M7 14h3m3 0h4m-10 3h3\"/>","graduation-cap":"<path d=\"m2 9 10-5 10 5-10 5z\"/><path d=\"M6 11v5c3 3 9 3 12 0v-5m4-2v7\"/>","calendar-check":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18m4 5 2 2 4-5\"/>","book-open":"<path d=\"M3 5c4-1 7 0 9 2v13c-2-2-5-3-9-2zM21 5c-4-1-7 0-9 2v13c2-2 5-3 9-2z\"/>","layout-dashboard":"<rect x=\"3\" y=\"3\" width=\"8\" height=\"8\" rx=\"1\"/><rect x=\"13\" y=\"3\" width=\"8\" height=\"5\" rx=\"1\"/><rect x=\"13\" y=\"10\" width=\"8\" height=\"11\" rx=\"1\"/><rect x=\"3\" y=\"13\" width=\"8\" height=\"8\" rx=\"1\"/>","network":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><circle cx=\"4\" cy=\"4\" r=\"2\"/><circle cx=\"20\" cy=\"4\" r=\"2\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/><circle cx=\"20\" cy=\"20\" r=\"2\"/><path d=\"m10 10-4-4m8 4 4-4m-8 8-4 4m8-4 4 4\"/>","clipboard-list":"<rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2h6v2M9 10h6m-6 4h6m-6 4h4\"/>","compass":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m15.5 8.5-2.5 6-6 2.5 2.5-6z\"/>"}; const path = paths[icon] || '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>'; return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>'; };
let me=null, users=[], apps=[], roles=[], assignments=[], education={classes:[],campuses:[],school_years:[]}, personnel=[], students=[], selectedApp='', selectedUser='', editingRole=null, activeContextId='';
let organizations=[], organizationLocations=[], teams=[], teamMemberships=[], moduleAccessAssignments=[], scopedRoleAssignments=[], selectedOrganizationId='';
const collapsedTeamGroups=new Set(), collapsedRightsGroups=new Set();
async function api(path,options={}) {
 const response=await fetch(path,{...options,headers:{'accept':'application/json','content-type':'application/json',...(activeContextId?{'x-sapoov-context':activeContextId}:{}),...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(data.error||`HTTP ${response.status}`);
 return data;
}
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
async function loadAdmin(){
 const [u,a,audit,ed,pe,st]=await Promise.all([api('/api/admin/users'),api('/api/admin/applications'),api('/api/admin/audit'),api('/api/admin/education'),api('/api/admin/personnel'),api('/api/admin/students')]);
 personnel=pe.personnel||[];students=st;
 education=ed;
 users=u.users;assignments=u.assignments.map(x=>({...x,scope:JSON.parse(x.scope_json||'{}')}));apps=a.applications;roles=a.roles;
 if(!selectedApp||!apps.some(x=>x.id===selectedApp))selectedApp=apps[0]?.id||'';
 if(!selectedUser||!users.some(x=>x.id===selectedUser))selectedUser=users[0]?.id||'';
 renderAdmin();renderEducation();renderPersonnel();renderStudents();$('audit').innerHTML=audit.events.map(e=>`<div class="audit-row"><b>${esc(e.action)}</b><span>${esc(e.actor_email)}</span><small>${esc(e.created_at)}</small></div>`).join('')||'<p class="muted">Nog geen wijzigingen.</p>';
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
function renderApps(){
 $('apps').innerHTML=apps.map(a=>{
  const internal=['werkplekreservatie','beleidskompas'].includes(a.id);
  let target=a.id==='werkplekreservatie'?'/werkplekreservatie':a.id==='beleidskompas'?'/beleidskompas':(a.url||'#');
  if(activeContextId){
   try{const u=new URL(target,window.location.origin);u.searchParams.set('sapoov_context',activeContextId);target=u.origin===window.location.origin?(u.pathname+u.search+u.hash):u.href;}catch{}
  }
  return `<a class="app" href="${esc(target)}" ${internal?'':'target="_blank" rel="noopener noreferrer"'}><span class="app-icon">${iconSvg(a.icon)}</span><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p></a>`;
 }).join('')||'<div class="message">Er zijn in deze organisatiecontext nog geen toepassingen aan je account toegewezen.</div>';
}
function organizationPath(orgId){
 const byId=new Map(organizations.map(o=>[o.id,o]));
 const parts=[];let current=byId.get(orgId);let guard=0;
 while(current&&guard++<8){parts.unshift(current.display_name);current=byId.get(current.parent_organization_id);}
 return parts.join(' / ');
}
function renderOrganizationAdmin(){
 $('organization-count').textContent=organizations.length;
 const term=$('organization-search').value.trim().toLowerCase();
 const filtered=organizations.filter(o=>{
  const locs=organizationLocations.filter(l=>l.organization_id===o.id).map(l=>l.display_name+' '+l.municipality).join(' ');
  return (o.display_name+' '+o.official_name+' '+(o.institution_number||'')+' '+locs).toLowerCase().includes(term);
 });
 $('organization-rows').innerHTML=filtered.map(o=>{
  const count=organizationLocations.filter(l=>l.organization_id===o.id).length;
  const type=({umbrella:'Koepel',school_board:'Schoolbestuur',institution:'Onderwijsinstelling'})[o.organization_type]||'Organisatie';
  return '<button type="button" class="organization-item '+(o.id===selectedOrganizationId?'selected':'')+'" data-organization="'+esc(o.id)+'"><b>'+esc(o.display_name)+'</b><small>'+esc(type)+' · '+esc(organizationPath(o.id))+'</small><span>'+esc(o.institution_number||'Geen instellingsnummer')+' · '+count+' locaties</span></button>';
 }).join('')||'<p class="muted">Geen organisaties gevonden.</p>';
 $('organization-parent').innerHTML='<option value="">Geen bovenliggende organisatie</option>'+organizations.filter(o=>o.id!==selectedOrganizationId).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.display_name)+'</option>').join('');
 const selected=organizations.find(o=>o.id===selectedOrganizationId);
 $('location-count').textContent=organizationLocations.filter(l=>l.organization_id===selectedOrganizationId).length;
 $('save-location').disabled=!selected||selected.organization_type!=='institution';
 $('location-rows').innerHTML=organizationLocations.filter(l=>l.organization_id===selectedOrganizationId).map(l=>'<div class="location-item"><b>'+esc(l.display_name)+'</b><span>'+esc([l.street,l.house_number,l.postal_code,l.municipality].filter(Boolean).join(' '))+'</span><small>'+esc(l.general_email||'')+'</small></div>').join('')||'<p class="muted">Nog geen locaties geregistreerd.</p>';
}
function fillOrganizationForm(org){
 $('organization-id').value=org?.id||'';
 $('organization-type').value=org?.organization_type||'institution';
 $('organization-parent').value=org?.parent_organization_id||'';
 $('organization-official-name').value=org?.official_name||'';
 $('organization-display-name').value=org?.display_name||'';
 $('organization-abbreviation').value=org?.abbreviation||'';
 $('organization-number').value=org?.institution_number||'';
 $('organization-email').value=org?.general_email||'';
 $('organization-phone').value=org?.general_phone||'';
 $('organization-website').value=org?.website_url||'';
 $('organization-street').value=org?.postal_street||'';
 $('organization-house').value=org?.postal_house_number||'';
 $('organization-bus').value=org?.postal_bus||'';
 $('organization-postcode').value=org?.postal_code||'';
 $('organization-municipality').value=org?.postal_municipality||'';
 $('organization-country').value=org?.postal_country_code||'BE';
 $('organization-source').value=org?.official_source_url||'';
 $('organization-logo-source').value=org?.logo_source_url||'';
 $('organization-editor-title').textContent=org?'Organisatie aanpassen':'Nieuwe organisatie';
 $('save-organization').textContent=org?'Wijzigingen opslaan':'Organisatie aanmaken';
}
function countVisibleTeamLeaves(node){
 if(collapsedTeamGroups.has(node.type+':'+node.id))return 1;
 if(node.type==='team')return 1;
 return (node.children||[]).reduce((n,c)=>n+countVisibleTeamLeaves(c),0);
}
function buildTeamTree(){
 const schools=organizations.filter(o=>o.organization_type==='institution');
 const boards=organizations.filter(o=>o.organization_type==='school_board');
 const umbrellas=organizations.filter(o=>o.organization_type==='umbrella');
 const byId=new Map(organizations.map(o=>[o.id,o]));
 const selectedSchool=$('team-school-filter').value;
 const teamsBySchool=new Map();
 for(const t of teams){if(selectedSchool&&t.institution_id!==selectedSchool)continue;const list=teamsBySchool.get(t.institution_id)||[];list.push(t);teamsBySchool.set(t.institution_id,list);}
 const schoolNodes=schools.filter(s=>teamsBySchool.has(s.id)).map(s=>({id:s.id,type:'school',name:s.display_name,children:(teamsBySchool.get(s.id)||[]).map(t=>({id:t.id,type:'team',name:t.name,team:t,children:[]}))}));
 const boardNodes=boards.map(b=>({id:b.id,type:'board',name:b.display_name,children:schoolNodes.filter(s=>byId.get(s.id)?.parent_organization_id===b.id)})).filter(b=>b.children.length);
 const roots=umbrellas.map(u=>({id:u.id,type:'umbrella',name:u.display_name,children:boardNodes.filter(b=>byId.get(b.id)?.parent_organization_id===u.id)})).filter(u=>u.children.length);
 if(!roots.length)return schoolNodes.map(s=>({id:s.id,type:'school',name:s.name,children:s.children}));
 return roots;
}
function renderTeamMatrix(){
 $('team-count').textContent=teams.length;
 const schools=organizations.filter(o=>o.organization_type==='institution');
 const schoolOptions='<option value="">Alle scholen</option>'+schools.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.display_name)+'</option>').join('');
 const current=$('team-school-filter').value;
 $('team-school-filter').innerHTML=schoolOptions;$('team-school-filter').value=current;
 $('new-team-school').innerHTML='<option value="">Kies een school…</option>'+schools.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.display_name)+'</option>').join('');
 const nameTerm=$('team-filter-name').value.trim().toLowerCase();
 const emailTerm=$('team-filter-email').value.trim().toLowerCase();
 const domainTerm=$('team-filter-domain').value.trim().toLowerCase().replace(/^@/,'');
 const staffRows=personnel.length?personnel:users;
 const filteredUsers=staffRows.filter(u=>{
  const name=(u.display_name||u.name||'').toLowerCase(),email=(u.email||'').toLowerCase(),domain=email.split('@')[1]||'';
  return (!nameTerm||name.includes(nameTerm))&&(!emailTerm||email.includes(emailTerm))&&(!domainTerm||domain.includes(domainTerm));
 });
 const roots=buildTeamTree(),headerRows=[[],[],[],[]],visibleColumns=[];
 const visit=(node,depth)=>{
  const key=node.type+':'+node.id,collapsed=collapsedTeamGroups.has(key);
  if(node.type==='team'){headerRows[3].push('<th class="team-leaf">'+esc(node.name)+'</th>');visibleColumns.push({type:'team',team:node.team});return;}
  if(collapsed){
   headerRows[depth].push('<th rowspan="'+(4-depth)+'" class="collapsed-group"><button type="button" data-team-collapse="'+esc(key)+'" aria-expanded="false">▸ '+esc(node.name)+'</button></th>');
   visibleColumns.push({type:'collapsed',node});return;
  }
  const span=countVisibleTeamLeaves(node);
  headerRows[depth].push('<th colspan="'+span+'"><button type="button" data-team-collapse="'+esc(key)+'" aria-expanded="true">▾ '+esc(node.name)+'</button></th>');
  (node.children||[]).forEach(child=>visit(child,depth+1));
 };
 roots.forEach(root=>visit(root,0));
 $('team-matrix-head').innerHTML='<tr><th class="staff-heading" rowspan="4">Personeelslid</th>'+headerRows[0].join('')+'</tr>'+headerRows.slice(1).map(row=>'<tr>'+row.join('')+'</tr>').join('');
 const membershipMap=new Map(teamMemberships.map(m=>[m.user_id+':'+m.team_id,m]));
 $('team-matrix-body').innerHTML=filteredUsers.map(u=>{
  const userId=u.user_id||u.id;
  const cells=visibleColumns.map(col=>{
   if(col.type==='collapsed')return '<td class="collapsed-cell">…</td>';
   const team=col.team,m=membershipMap.get(userId+':'+team.id),value=m?.membership_type||'';
   return '<td><select class="team-membership-select" data-team="'+esc(team.id)+'" data-user="'+esc(userId)+'" aria-label="'+esc((u.display_name||u.name||u.email)+' – '+team.name)+'"><option value="">Geen lid</option><option value="active_member" '+(value==='active_member'?'selected':'')+'>Actief lid</option><option value="passive_member" '+(value==='passive_member'?'selected':'')+'>Passief lid</option><option value="team_leader" '+(value==='team_leader'?'selected':'')+'>Teamleider (actief lid)</option></select></td>';
  }).join('');
  return '<tr><td class="staff-cell"><b>'+esc(u.display_name||u.name||u.email)+'</b><small>'+esc(u.email)+'</small></td>'+cells+'</tr>';
 }).join('')||'<tr><td colspan="'+(visibleColumns.length+1)+'" class="empty-row">Geen personeelsleden gevonden of er zijn nog geen teams aangemaakt.</td></tr>';
}
function countVisibleRightsLeaves(node){
 if(collapsedRightsGroups.has(node.type+':'+node.id))return 1;
 if(node.type==='access'||node.type==='role')return 1;
 return (node.children||[]).reduce((n,c)=>n+countVisibleRightsLeaves(c),0);
}
function buildRightsTree(){
 const byId=new Map(organizations.map(o=>[o.id,o]));
 const selectedSchool=$('rights-school-filter').value;
 const modules=apps.filter(a=>a.status!=='hidden');
 const schools=organizations.filter(o=>o.organization_type==='institution'&&(!selectedSchool||o.id===selectedSchool));
 const schoolNodes=schools.map(s=>({
  id:s.id,type:'school',name:s.display_name,children:modules.map(app=>({
   id:app.id+'@'+s.id,type:'module',name:app.name,application:app,organization:s,
   children:[
    {id:app.id+'@'+s.id+'@access',type:'access',name:'Platformtoegang',application:app,organization:s},
    ...roles.filter(r=>r.application_id===app.id).map(role=>({id:role.id+'@'+s.id,type:'role',name:role.name,role,application:app,organization:s}))
   ]
  }))
 }));
 const boards=organizations.filter(o=>o.organization_type==='school_board').map(b=>({id:b.id,type:'board',name:b.display_name,children:schoolNodes.filter(s=>byId.get(s.id)?.parent_organization_id===b.id)})).filter(b=>b.children.length);
 const roots=organizations.filter(o=>o.organization_type==='umbrella').map(u=>({id:u.id,type:'umbrella',name:u.display_name,children:boards.filter(b=>byId.get(b.id)?.parent_organization_id===u.id)})).filter(u=>u.children.length);
 return roots.length?roots:schoolNodes;
}
function renderRightsMatrix(){
 const schools=organizations.filter(o=>o.organization_type==='institution');
 const current=$('rights-school-filter').value;
 $('rights-school-filter').innerHTML='<option value="">Alle scholen</option>'+schools.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.display_name)+'</option>').join('');
 $('rights-school-filter').value=current;
 const nameTerm=$('rights-filter-name').value.trim().toLowerCase();
 const emailTerm=$('rights-filter-email').value.trim().toLowerCase();
 const domainTerm=$('rights-filter-domain').value.trim().toLowerCase().replace(/^@/,'');
 const filteredUsers=users.filter(u=>{
  const name=(u.display_name||'').toLowerCase(),email=(u.email||'').toLowerCase(),domain=email.split('@')[1]||'';
  return (!nameTerm||name.includes(nameTerm))&&(!emailTerm||email.includes(emailTerm))&&(!domainTerm||domain.includes(domainTerm));
 });
 const roots=buildRightsTree(),headerRows=[[],[],[],[],[]],visibleColumns=[];
 const visit=(node,depth)=>{
  const key=node.type+':'+node.id,collapsed=collapsedRightsGroups.has(key);
  if(node.type==='access'||node.type==='role'){
   headerRows[4].push('<th class="team-leaf">'+esc(node.name)+'</th>');
   visibleColumns.push({type:node.type,node});return;
  }
  if(collapsed){
   headerRows[depth].push('<th rowspan="'+(5-depth)+'" class="collapsed-group"><button type="button" data-rights-collapse="'+esc(key)+'" aria-expanded="false">▸ '+esc(node.name)+'</button></th>');
   visibleColumns.push({type:'collapsed',node});return;
  }
  headerRows[depth].push('<th colspan="'+countVisibleRightsLeaves(node)+'"><button type="button" data-rights-collapse="'+esc(key)+'" aria-expanded="true">▾ '+esc(node.name)+'</button></th>');
  (node.children||[]).forEach(child=>visit(child,depth+1));
 };
 roots.forEach(root=>visit(root,0));
 $('rights-column-count').textContent=visibleColumns.length+' kolommen';
 $('rights-matrix-head').innerHTML='<tr><th class="staff-heading" rowspan="5">Gebruiker</th>'+headerRows[0].join('')+'</tr>'+headerRows.slice(1).map(row=>'<tr>'+row.join('')+'</tr>').join('');
 const accessMap=new Map(moduleAccessAssignments.map(x=>[x.user_id+':'+x.application_id+':'+x.organization_id,Number(x.enabled)===1]));
 const roleMap=new Set(scopedRoleAssignments.filter(x=>x.status==='active').map(x=>x.user_id+':'+x.application_id+':'+x.role_id+':'+x.organization_id));
 $('rights-matrix-body').innerHTML=filteredUsers.map(u=>{
  const cells=visibleColumns.map(col=>{
   if(col.type==='collapsed')return '<td class="collapsed-cell">…</td>';
   const node=col.node,userId=u.id,orgId=node.organization.id,appId=node.application.id;
   if(col.type==='access'){
    const checked=accessMap.get(userId+':'+appId+':'+orgId)===true;
    return '<td><input type="checkbox" class="rights-check" data-kind="access" data-user="'+esc(userId)+'" data-app="'+esc(appId)+'" data-org="'+esc(orgId)+'" '+(checked?'checked':'')+' aria-label="'+esc('Platformtoegang '+node.application.name+' voor '+u.email)+'"></td>';
   }
   const checked=roleMap.has(userId+':'+appId+':'+node.role.id+':'+orgId);
   return '<td><input type="checkbox" class="rights-check" data-kind="role" data-user="'+esc(userId)+'" data-app="'+esc(appId)+'" data-role="'+esc(node.role.id)+'" data-org="'+esc(orgId)+'" '+(checked?'checked':'')+' aria-label="'+esc(node.role.name+' voor '+u.email)+'"></td>';
  }).join('');
  return '<tr><td class="staff-cell"><b>'+esc(u.display_name||u.email)+'</b><small>'+esc(u.email)+'</small></td>'+cells+'</tr>';
 }).join('')||'<tr><td colspan="'+(visibleColumns.length+1)+'" class="empty-row">Geen gebruikers of kolommen gevonden.</td></tr>';
}
async function loadStructureAdmin(){
 try{
  const [orgData,teamData,moduleData,scopedRoleData]=await Promise.all([api('/api/admin/organizations'),api('/api/admin/teams'),api('/api/admin/module-access'),api('/api/admin/scoped-role-assignments')]);
  organizations=orgData.organizations||[];organizationLocations=orgData.locations||[];
  teams=teamData.teams||[];teamMemberships=teamData.memberships||[];
  moduleAccessAssignments=moduleData.access||[];scopedRoleAssignments=scopedRoleData.assignments||[];
  if(!selectedOrganizationId||!organizations.some(o=>o.id===selectedOrganizationId))selectedOrganizationId=organizations.find(o=>o.organization_type==='institution')?.id||organizations[0]?.id||'';
  renderOrganizationAdmin();fillOrganizationForm(organizations.find(o=>o.id===selectedOrganizationId)||null);renderTeamMatrix();renderRightsMatrix();
  $('organization-status').textContent='Organisatiestructuur geladen. Nieuwe gegevens worden als concept opgeslagen.';
  $('team-status').textContent='Teamstructuur geladen. Wijzigingen worden afzonderlijk opgeslagen en gelogd.';
  $('rights-status').textContent='Rechtenmatrix geladen. Moduletoegang en rechtenprofielen worden afzonderlijk beheerd.';
 }catch(error){
  $('organization-status').textContent='Organisatie- en locatieschermen wachten op databasemigratie 0006. '+error.message;
  $('team-status').textContent='Teambeheer wacht op databasemigratie 0006. '+error.message;
  $('rights-status').textContent='Rechtenmatrix wacht op databasemigraties 0006 en 0008. '+error.message;
 }
}
async function saveOrganization(){
 const payload={
  id:$('organization-id').value||undefined,organizationType:$('organization-type').value,
  parentOrganizationId:$('organization-parent').value||null,
  officialName:$('organization-official-name').value.trim(),displayName:$('organization-display-name').value.trim(),
  abbreviation:$('organization-abbreviation').value.trim(),institutionNumber:$('organization-number').value.trim(),
  email:$('organization-email').value.trim(),phone:$('organization-phone').value.trim(),website:$('organization-website').value.trim(),
  postalStreet:$('organization-street').value.trim(),postalHouseNumber:$('organization-house').value.trim(),
  postalBus:$('organization-bus').value.trim(),postalCode:$('organization-postcode').value.trim(),
  postalMunicipality:$('organization-municipality').value.trim(),postalCountryCode:$('organization-country').value.trim()||'BE',
  sourceUrl:$('organization-source').value.trim(),logoSourceUrl:$('organization-logo-source').value.trim()
 };
 if(!payload.officialName||!payload.displayName)throw new Error('Vul de officiële naam en weergavenaam in.');
 if(payload.id)await api('/api/admin/organizations',{method:'PATCH',body:JSON.stringify(payload)});
 else await api('/api/admin/organizations',{method:'POST',body:JSON.stringify(payload)});
 await loadStructureAdmin();
}
async function saveOrganizationLocation(){
 if(!selectedOrganizationId)throw new Error('Selecteer eerst een onderwijsinstelling.');
 const payload={
  organizationId:selectedOrganizationId,stableKey:selectedOrganizationId+'-'+$('location-name').value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'),
  officialName:$('location-name').value.trim(),displayName:$('location-name').value.trim(),code:$('location-code').value.trim(),
  locationType:$('location-type').value,street:$('location-street').value.trim(),houseNumber:$('location-house').value.trim(),
  bus:$('location-bus').value.trim(),postalCode:$('location-postcode').value.trim(),municipality:$('location-municipality').value.trim(),
  email:$('location-email').value.trim(),phone:$('location-phone').value.trim(),sourceUrl:$('location-source').value.trim()
 };
 if(!payload.officialName)throw new Error('Geef de locatie een naam.');
 await api('/api/admin/locations',{method:'POST',body:JSON.stringify(payload)});
 ['location-name','location-code','location-street','location-house','location-bus','location-postcode','location-municipality','location-email','location-phone','location-source'].forEach(id=>$(id).value='');
 await loadStructureAdmin();
}
async function saveTeam(){
 const institutionId=$('new-team-school').value,name=$('new-team-name').value.trim();
 if(!institutionId||!name)throw new Error('Kies een school en geef het team een naam.');
 const stableKey= institutionId+'-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
 await api('/api/admin/teams',{method:'POST',body:JSON.stringify({institutionId,stableKey,name,code:$('new-team-code').value.trim()})});
 $('new-team-name').value='';$('new-team-code').value='';
 await loadStructureAdmin();
}
async function start(){
 try{
  if(!activeContextId){try{activeContextId=sessionStorage.getItem('sapoov.activeContext')||'';}catch{}}
  let data=await api('/api/me');
  const contexts=data.contexts||[],selector=$('context-select');
  if(contexts.length){
   selector.classList.remove('hidden');
   selector.innerHTML='<option value="">Kies organisatiecontext…</option>'+contexts.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.display_name)+'</option>').join('');
   if(activeContextId&&!contexts.some(c=>c.id===activeContextId))activeContextId='';
   if(data.activeContext){activeContextId=data.activeContext.id;try{sessionStorage.setItem('sapoov.activeContext',activeContextId);}catch{}}
   selector.value=activeContextId;
  }else{
   selector.classList.add('hidden');activeContextId='';try{sessionStorage.removeItem('sapoov.activeContext');}catch{}
  }
  me=data;$('identity').textContent=data.user.display_name||data.user.email;
  assignments=data.assignments||[];
  if(data.requiresContextSelection){
   apps=[];renderApps();$('message').textContent='Je account heeft toegang tot meerdere scholen. Kies eerst de organisatiecontext bovenaan.';
  }else{
   apps=data.applications||[];renderApps();
   $('message').textContent=data.activeContext?'Aangemeld als '+data.user.email+' · '+data.activeContext.display_name+'.':'Aangemeld als '+data.user.email+'.';
  }
  if(data.superadmin){$('admin').classList.remove('hidden');$('admin-nav').classList.remove('hidden');await loadAdmin();await loadStructureAdmin();}
 }catch(error){notice(error.message,true);$('message').textContent=error.message;$('apps').innerHTML='';}
}
$('context-select').addEventListener('change',e=>{activeContextId=e.target.value;try{if(activeContextId)sessionStorage.setItem('sapoov.activeContext',activeContextId);else sessionStorage.removeItem('sapoov.activeContext');}catch{}start();});
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
$('personnel-rows').addEventListener('click',e=>{const b=e.target.closest('[data-personnel]');if(!b)return;const p=personnel.find(x=>x.user_id===b.dataset.personnel);if(!p)return;$('personnel-user-id').value=p.user_id;$('personnel-number').value=p.staff_number||'';$('personnel-campus').value=p.campus_id||'';$('personnel-status').value=p.employment_status||'unknown';$('personnel-start').value=p.start_date||'';$('personnel-end').value=p.end_date||'';$('personnel-editor').classList.remove('hidden');$('personnel-editor').scrollIntoView({behavior:'smooth',block:'center'});});
$('cancel-personnel').addEventListener('click',()=>$('personnel-editor').classList.add('hidden'));
$('save-personnel').addEventListener('click',async()=>{try{await api('/api/admin/personnel',{method:'POST',body:JSON.stringify({userId:$('personnel-user-id').value,staffNumber:$('personnel-number').value.trim()||null,campusId:$('personnel-campus').value||null,employmentStatus:$('personnel-status').value,startDate:$('personnel-start').value||null,endDate:$('personnel-end').value||null})});$('personnel-editor').classList.add('hidden');await loadAdmin();notice('Personeelsprofiel opgeslagen.');}catch(e){notice(e.message,true);}});
$('save-student').addEventListener('click',async()=>{try{await api('/api/admin/students',{method:'POST',body:JSON.stringify({studentNumber:$('student-number').value.trim(),firstName:$('student-first').value.trim(),lastName:$('student-last').value.trim(),preferredName:$('student-preferred').value.trim()})});$('student-number').value='';$('student-first').value='';$('student-last').value='';$('student-preferred').value='';await loadAdmin();notice('Leerling toegevoegd.');}catch(e){notice(e.message,true);}});
$('enrol-year').addEventListener('change',updateEnrolClasses);
$('save-enrolment').addEventListener('click',async()=>{try{await api('/api/admin/student-enrolments',{method:'POST',body:JSON.stringify({studentId:$('enrol-student').value,schoolYearId:$('enrol-year').value,classId:$('enrol-class').value,startDate:$('enrol-start').value||null})});await loadAdmin();notice('Klasinschrijving opgeslagen.');}catch(e){notice(e.message,true);}});
['rights-filter-name','rights-filter-email','rights-filter-domain','rights-school-filter'].forEach(id=>$(id).addEventListener(id==='rights-school-filter'?'change':'input',renderRightsMatrix));
$('rights-matrix-head').addEventListener('click',e=>{const b=e.target.closest('[data-rights-collapse]');if(!b)return;const key=b.dataset.rightsCollapse;if(collapsedRightsGroups.has(key))collapsedRightsGroups.delete(key);else collapsedRightsGroups.add(key);renderRightsMatrix();});
$('rights-matrix-body').addEventListener('change',async e=>{
 const input=e.target.closest('[data-kind][data-user][data-app][data-org]');if(!input)return;
 const userId=input.dataset.user,applicationId=input.dataset.app,organizationId=input.dataset.org;
 try{
  if(input.dataset.kind==='access'){
   await api('/api/admin/module-access',{method:'PUT',body:JSON.stringify({userId,applicationId,organizationId,enabled:input.checked})});
  }else{
   const roleId=input.dataset.role;
   if(input.checked)await api('/api/admin/scoped-role-assignments',{method:'PUT',body:JSON.stringify({userId,applicationId,organizationId,roleId,includeDescendants:false})});
   else await api('/api/admin/scoped-role-assignments?userId='+encodeURIComponent(userId)+'&applicationId='+encodeURIComponent(applicationId)+'&organizationId='+encodeURIComponent(organizationId)+'&roleId='+encodeURIComponent(roleId),{method:'DELETE'});
  }
  await loadStructureAdmin();notice('Toegang of rechtenprofiel bijgewerkt.');
 }catch(err){input.checked=!input.checked;notice(err.message,true);}
});
$('organization-rows').addEventListener('click',e=>{const b=e.target.closest('[data-organization]');if(!b)return;selectedOrganizationId=b.dataset.organization;renderOrganizationAdmin();fillOrganizationForm(organizations.find(o=>o.id===selectedOrganizationId));});
$('organization-search').addEventListener('input',renderOrganizationAdmin);
$('save-organization').addEventListener('click',async()=>{try{await saveOrganization();notice('Organisatie opgeslagen als concept.');}catch(e){notice(e.message,true);}});
$('new-organization').addEventListener('click',()=>{selectedOrganizationId='';renderOrganizationAdmin();fillOrganizationForm(null);});
$('save-location').addEventListener('click',async()=>{try{await saveOrganizationLocation();notice('Locatie toegevoegd als concept.');}catch(e){notice(e.message,true);}});
['team-filter-name','team-filter-email','team-filter-domain','team-school-filter'].forEach(id=>$(id).addEventListener(id==='team-school-filter'?'change':'input',renderTeamMatrix));
$('team-matrix-head').addEventListener('click',e=>{const b=e.target.closest('[data-team-collapse]');if(!b)return;const key=b.dataset.teamCollapse;if(collapsedTeamGroups.has(key))collapsedTeamGroups.delete(key);else collapsedTeamGroups.add(key);renderTeamMatrix();});
$('team-matrix-body').addEventListener('change',async e=>{const select=e.target.closest('[data-team][data-user]');if(!select)return;try{const teamId=select.dataset.team,userId=select.dataset.user;if(!select.value)await api('/api/admin/team-memberships?teamId='+encodeURIComponent(teamId)+'&userId='+encodeURIComponent(userId),{method:'DELETE'});else await api('/api/admin/team-memberships',{method:'PUT',body:JSON.stringify({teamId,userId,membershipType:select.value})});await loadStructureAdmin();notice('Teamlidmaatschap opgeslagen.');}catch(err){notice(err.message,true);}});
$('save-team').addEventListener('click',async()=>{try{await saveTeam();notice('Team aangemaakt.');}catch(e){notice(e.message,true);}});
$('class-search').addEventListener('input',renderEducation);$('campus-filter').addEventListener('change',renderEducation);$('year-filter').addEventListener('change',renderEducation);
start();
