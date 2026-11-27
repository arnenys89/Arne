const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const id = () => crypto.randomUUID();
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '');

let jwksCache = null;
let jwksFetchedAt = 0;
const decode64url = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')), c => c.charCodeAt(0));
async function authenticate(request, env) {
  const token = request.headers.get('x-sapoov-access-jwt') || request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode64url(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(decode64url(parts[1])));
    if (header.alg !== 'RS256' || !header.kid) return null;
    const team = env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const issuer = 'https://' + team;
    const allowedAudiences = env.CF_ACCESS_AUD.split(',').map(x => x.trim()).filter(Boolean);
    const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const now = Math.floor(Date.now()/1000);
    if (payload.iss !== issuer || !tokenAudiences.some(a => allowedAudiences.includes(a)) ||
        !payload.sub || !payload.exp || payload.exp < now - 60 || (payload.nbf && payload.nbf > now + 60)) return null;
    if (!jwksCache || Date.now() - jwksFetchedAt > 3600000) {
      const response = await fetch(issuer + '/cdn-cgi/access/certs', { cf: { cacheTtl: 3600, cacheEverything: true } });
      if (!response.ok) return null;
      jwksCache = await response.json();
      jwksFetchedAt = Date.now();
    }
    const jwk = (jwksCache.keys || []).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!valid) return null;
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) return null;
    return { email, name: String(payload.name || email), audiences: tokenAudiences };
  } catch {
    return null;
  }
}

async function currentUser(db, identity) {
  let user = await db.prepare('SELECT * FROM users WHERE email=?').bind(identity.email).first();
  if (!user) {
    const userId = id();
    await db.prepare('INSERT INTO users(id,email,display_name,status) VALUES(?,?,?,?)').bind(userId, identity.email, identity.name, 'active').run();
    user = await db.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
  } else if (identity.name && user.display_name !== identity.name) {
    await db.prepare('UPDATE users SET display_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(identity.name,user.id).run();
    user.display_name = identity.name;
  }
  return user;
}
const isSuperadmin = (email, env) => (env.SUPERADMIN_EMAILS || '').split(',').map(x=>x.trim().toLowerCase()).includes(email);
async function audit(db, actor, action, targetType, targetId, details={}) {
  await db.prepare('INSERT INTO audit_events(id,actor_email,action,target_type,target_id,details_json) VALUES(?,?,?,?,?,?)').bind(id(),actor.email,action,targetType,targetId||null,JSON.stringify(details)).run();
}
async function bodyJson(request) { try { return await request.json(); } catch { return null; } }
function explicitScopeEnabled(rows,unitId){return rows.some(x=>x.organization_unit_id===unitId&&Number(x.enabled)===1);}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') return json({ok:true,service:'sapoov-dashboard'});
    const identity = await authenticate(request, env);
    if (!identity) return json({error:'Aanmelden via de beveiligde schoolomgeving is vereist.'},401);
    if (!env.DB) return json({error:'D1-database is niet gekoppeld.'},503);
    const user = await currentUser(env.DB,identity);
    if (user.status !== 'active') return json({error:'Je account is niet actief.'},403);
    const superadmin = isSuperadmin(identity.email,env);
    const method = request.method, path = url.pathname;

    if (path.startsWith('/api/professionalisering/')) {
      const endpoint=path.slice('/api/professionalisering/'.length);
      const [profAccessRows,profRoleRows,profUnits]=await Promise.all([
        env.DB.prepare("SELECT organization_unit_id,enabled FROM user_application_access_scopes WHERE user_id=? AND application_id='professionalisering'").bind(user.id).all(),
        env.DB.prepare("SELECT s.organization_unit_id,s.enabled,r.name,r.permissions_json FROM user_application_role_scopes s JOIN roles r ON r.id=s.role_id WHERE s.user_id=? AND s.application_id='professionalisering' ORDER BY r.name").bind(user.id).all(),
        env.DB.prepare("SELECT id,name,unit_type FROM organization_units WHERE active=1").all()
      ]);
      const profAvailable=profAccessRows.results.filter(x=>Number(x.enabled)===1).map(x=>x.organization_unit_id);
      let profUnitId=url.searchParams.get('organizationUnitId')||'';
      if(!profUnitId){try{profUnitId=new URL(request.headers.get('referer')||'').searchParams.get('organizationUnitId')||'';}catch{}}
      if(!profUnitId&&profAvailable.length===1)profUnitId=profAvailable[0];
      if(!profUnitId&&!superadmin)return json({error:profAvailable.length?'Kies eerst een organisatiecontext voor Professionalisering.':'Je hebt geen centrale toegang tot Professionalisering.',requiresOrganizationContext:profAvailable.length>1,organizationUnits:profUnits.results.filter(x=>profAvailable.includes(x.id))},profAvailable.length?409:403);
      if(!superadmin&&!profAccessRows.results.some(x=>x.organization_unit_id===profUnitId&&Number(x.enabled)===1))return json({error:'Je hebt geen expliciete toegang tot Professionalisering binnen deze organisatiecontext.'},403);
      const profRoles=profRoleRows.results.filter(x=>x.organization_unit_id===profUnitId&&Number(x.enabled)===1);
      if(!profRoles.length&&!superadmin)return json({error:'Je hebt geen rechtenprofiel voor Professionalisering binnen deze organisatiecontext.'},403);
      const profPermissions=[...new Set(profRoles.flatMap(r=>{try{return JSON.parse(r.permissions_json||'[]')}catch{return []}}))];
      const profIsAdmin=profPermissions.includes('*')||superadmin;
      const profIsApprover=profIsAdmin||profPermissions.some(p=>['activities.manage','personnel.read_all'].includes(p));
      if(method==='GET'&&endpoint==='me') return json({id:user.id,email:user.email,display_name:user.display_name,isAdmin:profIsAdmin,isApprover:profIsApprover,roles:profRoles.map(r=>r.name),permissions:profPermissions});
      if(method==='GET'&&endpoint==='school-years'){
        let years=await env.DB.prepare('SELECT * FROM prof_school_years ORDER BY start_date DESC').all();
        if(!years.results||!years.results.length){
          await env.DB.prepare('INSERT OR IGNORE INTO prof_school_years(id,label,start_date,end_date) VALUES(?,?,?,?)').bind('sy-2026-2027','2026–2027','2026-09-01','2027-08-31').run();
          years=await env.DB.prepare('SELECT * FROM prof_school_years ORDER BY start_date DESC').all();
        }
        return json({school_years:years.results||[]});
      }
      if(method==='GET'&&endpoint==='applications'){
        const sql='SELECT a.*,u.email applicant_email,u.display_name applicant_name FROM prof_applications a JOIN users u ON u.id=a.applicant_user_id '+(profIsApprover?'':'WHERE a.applicant_user_id=?')+' ORDER BY a.created_at DESC';
        const q=profIsApprover?await env.DB.prepare(sql).all():await env.DB.prepare(sql).bind(user.id).all();
        const applications=q.results||[];
        for(const a of applications){
          const participants=await env.DB.prepare('SELECT id,campus,user_id FROM prof_participants WHERE application_id=?').bind(a.id).all();
          a.participants=participants.results||[];
          a.lessons=[];
          for(const p of a.participants){
            const lessons=await env.DB.prepare('SELECT lesson_number,class_name,subject,task_location,is_free,notes FROM prof_lesson_slots WHERE participant_id=?').bind(p.id).all();
            a.lessons.push(...(lessons.results||[]));
          }
          const status={submitted:'Ingediend',approved:'Goedgekeurd',rejected:'Afgekeurd',cancelled:'Geannuleerd'};
          a.approval_status_label=status[a.approval_status]||a.approval_status;
          a.category_label=a.category==='pedagogisch_didactisch'?'Pedagogisch-didactisch':'Vakinhoudelijk';
          const cost=await env.DB.prepare('SELECT value_json FROM prof_app_settings WHERE key=?').bind('cost:'+a.id).first();
          a.cost_cents=cost?JSON.parse(cost.value_json).cost_cents:0;
        }
        return json({applications});
      }
      if(method==='POST'&&endpoint==='applications'){
        const b=await bodyJson(request);
        if(!b||!b.school_year_id||!b.title||!b.category||!b.timing||!b.start_at||!b.end_at||!b.justification)return json({error:'Vul alle verplichte velden in.'},400);
        if(!['pedagogisch_didactisch','vakinhoudelijk'].includes(b.category)||!['tijdens_lesuren','buiten_lesuren'].includes(b.timing))return json({error:'Ongeldige categorie of timing.'},400);
        if(new Date(b.end_at)<=new Date(b.start_at))return json({error:'Eindmoment moet na het beginmoment liggen.'},400);
        const year=await env.DB.prepare('SELECT id FROM prof_school_years WHERE id=?').bind(b.school_year_id).first();
        if(!year)return json({error:'Onbekend schooljaar.'},400);
        const aid=id();
        await env.DB.prepare('INSERT INTO prof_applications(id,school_year_id,applicant_user_id,title,provider,category,timing,start_at,end_at,justification,travel_mode,ticket_required,payment_required,general_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(aid,b.school_year_id,user.id,String(b.title).trim(),b.provider||null,b.category,b.timing,b.start_at,b.end_at,b.justification,b.travel_mode||null,Number(b.ticket_required)||0,Number(b.payment_required)||0,b.general_notes||null).run();
        const pid=id();
        await env.DB.prepare('INSERT INTO prof_participants(id,application_id,user_id,campus,registration_email) VALUES(?,?,?,?,?)').bind(pid,aid,user.id,b.campus||null,user.email).run();
        for(const l of (Array.isArray(b.lessons)?b.lessons:[])){
          if([1,2,3,4,5,7,8].includes(Number(l.lesson_number))){
            await env.DB.prepare('INSERT INTO prof_lesson_slots(id,participant_id,lesson_number,class_name,subject,task_location,is_free,notes) VALUES(?,?,?,?,?,?,?,?)').bind(id(),pid,Number(l.lesson_number),l.class_name||null,l.subject||null,l.task_location||null,Number(l.is_free)===1?1:0,l.notes||null).run();
          }
        }
        await env.DB.prepare('INSERT INTO prof_app_settings(key,value_json,updated_by) VALUES(?,?,?)').bind('cost:'+aid,JSON.stringify({cost_cents:Math.max(0,Number(b.cost_cents)||0)}),user.id).run();
        await audit(env.DB,user,'professionalisering.application.created','application',aid,{title:b.title});
        return json({ok:true,id:aid},201);
      }
      const dm=endpoint.split('/');
      if(dm.length===3&&dm[0]==='applications'&&dm[2]==='decision'&&method==='POST'){
        if(!profIsApprover)return json({error:'Je hebt geen beoordelingsrechten.'},403);
        const b=await bodyJson(request);
        if(!b||!['approved','rejected'].includes(b.status))return json({error:'Ongeldige beslissing.'},400);
        const a=await env.DB.prepare('SELECT * FROM prof_applications WHERE id=?').bind(dm[1]).first();
        if(!a)return json({error:'Aanvraag niet gevonden.'},404);
        if(a.approval_status!=='submitted')return json({error:'Deze aanvraag is al behandeld.'},409);
        await env.DB.prepare('UPDATE prof_applications SET approval_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND approval_status=?').bind(b.status,a.id,'submitted').run();
        await env.DB.prepare('INSERT INTO prof_approval_events(id,application_id,actor_user_id,decision,notes) VALUES(?,?,?,?,?)').bind(id(),a.id,user.id,b.status,b.notes||null).run();
        if(b.status==='approved'){
          await env.DB.prepare('INSERT INTO prof_application_tasks(id,application_id,task_type,assigned_role,status,notes) VALUES(?,?,?,?,?,?)').bind(id(),a.id,'pictO_registration','directie','open','Automatisch aangemaakt na goedkeuring').run();
          if(a.payment_required)await env.DB.prepare('INSERT INTO prof_application_tasks(id,application_id,task_type,assigned_role,status,notes) VALUES(?,?,?,?,?,?)').bind(id(),a.id,'payment','administratie','open','Betalingsopvolging na goedkeuring').run();
        }
        await audit(env.DB,user,'professionalisering.application.decision','application',a.id,{status:b.status,notes:b.notes||''});
        return json({ok:true});
      }
      if(method==='GET'&&endpoint==='audit'){
        if(!profIsAdmin)return json({error:'Alleen beheerders.'},403);
        const result=await env.DB.prepare("SELECT created_at,action,target_id AS entity_id,actor_email FROM audit_events WHERE action LIKE 'professionalisering.%' ORDER BY created_at DESC LIMIT 100").all();
        return json({entries:result.results||[]});
      }
      return json({error:'Professionalisering-eindpunt niet gevonden.'},404);
    }


    if (method==='GET' && path==='/api/me') {
      const [apps,units,access,roleRows]=await Promise.all([
        env.DB.prepare("SELECT * FROM applications WHERE status!='hidden' ORDER BY sort_order,name").all(),
        env.DB.prepare("SELECT id,parent_id,unit_type,name FROM organization_units WHERE active=1 ORDER BY sort_order,name").all(),
        env.DB.prepare("SELECT application_id,organization_unit_id,enabled FROM user_application_access_scopes WHERE user_id=?").bind(user.id).all(),
        env.DB.prepare("SELECT s.application_id,s.role_id,s.organization_unit_id,s.enabled,r.name AS role,r.permissions_json,a.name AS application_name,a.url FROM user_application_role_scopes s JOIN roles r ON r.id=s.role_id JOIN applications a ON a.id=s.application_id WHERE s.user_id=? AND a.status!='hidden' ORDER BY a.sort_order,a.name,r.name").bind(user.id).all()
      ]);
      const contexts=superadmin?units.results:units.results.filter(u=>access.results.some(g=>g.organization_unit_id===u.id&&Number(g.enabled)===1));
      const requested=url.searchParams.get('organizationUnitId')||'';
      const selected=requested?contexts.find(u=>u.id===requested):null;
      if(requested&&!selected)return json({error:'Je hebt geen expliciete toegang tot deze organisatiecontext.'},403);
      const visible=selected?(superadmin?apps.results:apps.results.filter(a=>explicitScopeEnabled(access.results.filter(x=>x.application_id===a.id),selected.id))):[];
      const visibleIds=new Set(visible.map(x=>x.id));
      const assignments=selected?roleRows.results.filter(x=>x.organization_unit_id===selected.id&&Number(x.enabled)===1&&visibleIds.has(x.application_id)).map(x=>({...x,permissions:JSON.parse(x.permissions_json||'[]')})):[];
      return json({user:{id:user.id,email:user.email,display_name:user.display_name},superadmin,contexts:contexts.map(({id,parent_id,unit_type,name})=>({id,parent_id,unit_type,name})),selectedOrganizationUnit:selected,applications:visible,assignments});
    }

    if (method==='GET' && path.startsWith('/api/access/')) {
      const appSlug=slug(path.slice('/api/access/'.length));
      const app=await env.DB.prepare("SELECT * FROM applications WHERE id=? AND status='active'").bind(appSlug).first();
      if(!app)return json({error:'Onbekende toepassing.'},404);
      const allowedAudiences=appSlug==='bestelplatform'?[app.access_audience,'c76aa7483c5c89e436cb4ddf2ad0d545f79e612d9701ed357aa8921ab77dea73']:[app.access_audience];
      if(!app.access_audience||!allowedAudiences.some(a=>a&&identity.audiences.includes(a)))return json({error:'De aanmeldsessie hoort niet bij deze toepassing.'},403);
      const [units,access,roleRows]=await Promise.all([
        env.DB.prepare("SELECT id,parent_id,unit_type,name FROM organization_units WHERE active=1 ORDER BY sort_order,name").all(),
        env.DB.prepare("SELECT organization_unit_id,enabled FROM user_application_access_scopes WHERE user_id=? AND application_id=?").bind(user.id,app.id).all(),
        env.DB.prepare("SELECT s.role_id,s.organization_unit_id,s.enabled,r.name,r.description,r.permissions_json FROM user_application_role_scopes s JOIN roles r ON r.id=s.role_id WHERE s.user_id=? AND s.application_id=? ORDER BY r.name").bind(user.id,app.id).all()
      ]);
      const available=access.results.filter(x=>Number(x.enabled)===1).map(x=>x.organization_unit_id);
      const candidates=superadmin?units.results:units.results.filter(x=>available.includes(x.id));
      let unitId=url.searchParams.get('organizationUnitId')||'';
      if(!unitId){try{unitId=new URL(request.headers.get('referer')||'').searchParams.get('organizationUnitId')||'';}catch{}}
      if(!unitId&&candidates.length===1)unitId=candidates[0].id;
      if(!unitId&&candidates.length>1)return json({error:'Kies eerst een organisatiecontext.',requiresOrganizationContext:true,organizationUnits:candidates.map(x=>({id:x.id,name:x.name,type:x.unit_type}))},409);
      if(!unitId)return json({error:'Je hebt geen expliciete toegang tot deze toepassing.'},403);
      const selected=units.results.find(x=>x.id===unitId);
      if(!selected)return json({error:'De gekozen organisatiecontext bestaat niet.'},404);
      if(!superadmin&&!explicitScopeEnabled(access.results,unitId))return json({error:'Je hebt geen expliciete toegang tot deze toepassing binnen deze organisatiecontext.'},403);
      let allowedTeamCampuses=[];
      if(appSlug==='bestelplatform'){
        allowedTeamCampuses=selected.unit_type==='locatie'?[selected.name]:selected.unit_type==='school'?units.results.filter(x=>x.parent_id===selected.id&&x.unit_type==='locatie').map(x=>x.name):[];
        if(!allowedTeamCampuses.length)return json({error:'Bestelplatform is alleen beschikbaar binnen een expliciet toegekende school- of campuscontext.'},403);
      }
      const roles=roleRows.results.filter(x=>x.organization_unit_id===unitId&&Number(x.enabled)===1).map(x=>({id:x.role_id,name:x.name,description:x.description,permissions:JSON.parse(x.permissions_json||'[]'),scope:{organizationUnitId:unitId,organizationUnitName:selected.name}}));
      let teamData=[{results:[]},{results:[]},{results:[]}];
      if(appSlug==='bestelplatform'){
        const placeholders=allowedTeamCampuses.map(()=>'?').join(',');
        const teams=await env.DB.prepare("SELECT id,name,campus,description,active,custom_campus FROM teams WHERE active=1 AND (campus IN ("+placeholders+")"+(selected.unit_type==='school'?" OR campus='Beide campussen'":'')+") ORDER BY campus,name").bind(...allowedTeamCampuses).all();
        const teamIds=new Set(teams.results.map(x=>x.id));
        const [members,allMembers]=await Promise.all([env.DB.prepare('SELECT team_id,member_role FROM team_members WHERE user_id=?').bind(user.id).all(),env.DB.prepare('SELECT tm.team_id,tm.member_role,u.email FROM team_members tm JOIN users u ON u.id=tm.user_id').all()]);
        teamData=[teams,{results:members.results.filter(x=>teamIds.has(x.team_id))},{results:allMembers.results.filter(x=>teamIds.has(x.team_id))}];
      }
      return json({user:{id:user.id,email:user.email,display_name:user.display_name},application:{id:app.id,name:app.name},organizationUnit:{id:selected.id,name:selected.name,type:selected.unit_type},organizationUnits:[{id:selected.id,name:selected.name}],roles,teams:teamData[0].results,teamMemberships:teamData[1].results,teamMembers:teamData[2].results,authorized:superadmin||explicitScopeEnabled(access.results,unitId)});
    }

    if (path.startsWith('/api/admin/')) {
      if (!superadmin) return json({error:'Alleen de centrale superadministrator mag gebruikers en rechten beheren.'},403);
      if(method==='GET'&&path==='/api/admin/rights-matrix'){
        const [u,a,r,o,as,ac,acs,rs]=await Promise.all([
          env.DB.prepare("SELECT id,email,display_name,status,created_at FROM users ORDER BY email").all(),
          env.DB.prepare("SELECT * FROM applications WHERE status!='hidden' ORDER BY sort_order,name").all(),
          env.DB.prepare("SELECT * FROM roles WHERE application_id IS NOT NULL ORDER BY application_id,name").all(),
          env.DB.prepare("SELECT id,parent_id,unit_type,name,sort_order,active FROM organization_units WHERE active=1 ORDER BY sort_order,name").all(),
          env.DB.prepare("SELECT uar.user_id,uar.application_id,uar.role_id,uar.scope_json,r.name AS role_name,a.name AS application_name FROM user_app_roles uar JOIN roles r ON r.id=uar.role_id JOIN applications a ON a.id=uar.application_id").all(),
          env.DB.prepare("SELECT user_id,application_id,enabled FROM user_application_access").all(),
          env.DB.prepare("SELECT user_id,application_id,organization_unit_id,enabled FROM user_application_access_scopes").all(),
          env.DB.prepare("SELECT user_id,application_id,role_id,organization_unit_id,enabled FROM user_application_role_scopes").all()
        ]);
        return json({users:u.results,applications:a.results,roles:r.results.map(x=>({...x,permissions:JSON.parse(x.permissions_json||'[]')})),assignments:as.results,access:ac.results,organizationUnits:o.results,accessScopes:acs.results,roleScopes:rs.results});
      }
      if(method==='POST'&&path==='/api/admin/organization-access'){
        const b=await bodyJson(request);
        if(!b?.userId||!b?.applicationId||!b?.organizationUnitId||typeof b.enabled!=='boolean')return json({error:'Gebruiker, toepassing, organisatie-eenheid en toegang zijn verplicht.'},400);
        const [u,a,o]=await Promise.all([env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first(),env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first(),env.DB.prepare("SELECT id FROM organization_units WHERE id=? AND active=1").bind(b.organizationUnitId).first()]);
        if(!u||!a||!o)return json({error:'Gebruiker, toepassing of organisatie-eenheid niet gevonden.'},404);
        await env.DB.prepare("INSERT INTO user_application_access_scopes(user_id,application_id,organization_unit_id,enabled,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(user_id,application_id,organization_unit_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(b.userId,b.applicationId,b.organizationUnitId,b.enabled?1:0,user.email).run();
        await audit(env.DB,user,'organization.application.access.update','user_application_access_scope',b.userId,{applicationId:b.applicationId,organizationUnitId:b.organizationUnitId,enabled:b.enabled});
        return json({ok:true,enabled:b.enabled});
      }
      if(method==='POST'&&path==='/api/admin/organization-roles'){
        const b=await bodyJson(request);
        if(!b?.userId||!b?.applicationId||!b?.roleId||!b?.organizationUnitId||typeof b.enabled!=='boolean')return json({error:'Gebruiker, toepassing, rol, organisatie-eenheid en status zijn verplicht.'},400);
        const [u,a,r,o]=await Promise.all([env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first(),env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first(),env.DB.prepare('SELECT id,application_id FROM roles WHERE id=?').bind(b.roleId).first(),env.DB.prepare("SELECT id FROM organization_units WHERE id=? AND active=1").bind(b.organizationUnitId).first()]);
        if(!u||!a||!r||r.application_id!==b.applicationId||!o)return json({error:'Gebruiker, toepassing, rol of organisatie-eenheid niet geldig.'},404);
        await env.DB.prepare("INSERT INTO user_application_role_scopes(user_id,application_id,role_id,organization_unit_id,enabled,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,application_id,role_id,organization_unit_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(b.userId,b.applicationId,b.roleId,b.organizationUnitId,b.enabled?1:0,user.email).run();
        await audit(env.DB,user,'organization.application.role.update','user_application_role_scope',b.userId,{applicationId:b.applicationId,roleId:b.roleId,organizationUnitId:b.organizationUnitId,enabled:b.enabled});
        return json({ok:true,enabled:b.enabled});
      }
      if (method==='GET' && path==='/api/admin/teams') {
        const [teams,members]=await Promise.all([
          env.DB.prepare('SELECT id,name,campus,description,active,custom_campus,created_at,updated_at FROM teams ORDER BY campus,name').all(),
          env.DB.prepare('SELECT tm.team_id,tm.user_id,tm.member_role,u.email,u.display_name FROM team_members tm JOIN users u ON u.id=tm.user_id ORDER BY tm.team_id,u.email').all()
        ]);
        return json({teams:teams.results,members:members.results});
      }
      if (method==='POST' && path==='/api/admin/teams') {
        const b=await bodyJson(request), name=String(b?.name||'').trim(), campus=String(b?.campus||'').trim();
        if(!name || !['Ninove','Zottegem','Beide campussen','Andere'].includes(campus)) return json({error:'Teamnaam en een geldige campus zijn verplicht.'},400);
        const teamId=b.id||id();
        try {
          if(b.id){
            const result=await env.DB.prepare('UPDATE teams SET name=?,campus=?,description=?,active=1,custom_campus=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,campus,String(b.description||''),campus==='Andere'?String(b.customCampus||'').trim():null,teamId).run();
            if(!result.meta.changes) return json({error:'Team niet gevonden.'},404);
          } else {
            await env.DB.prepare('INSERT INTO teams(id,name,campus,description,active,custom_campus) VALUES(?,?,?,?,1,?)').bind(teamId,name,campus,String(b.description||''),campus==='Andere'?String(b.customCampus||'').trim():null).run();
          }
        } catch { return json({error:'Er bestaat al een team met deze naam.'},409); }
        await audit(env.DB,user,b.id?'team.update':'team.create','team',teamId,{name,campus});
        return json({ok:true,id:teamId});
      }
      if (method==='PUT' && path==='/api/admin/teams') {
        const b=await bodyJson(request), name=String(b?.name||'').trim(), campus=String(b?.campus||'').trim();
        if(!b?.id || !name || !['Ninove','Zottegem','Beide campussen','Andere'].includes(campus)) return json({error:'Team-ID, naam en een geldige campus zijn verplicht.'},400);
        try {
          const result=await env.DB.prepare('UPDATE teams SET name=?,campus=?,description=?,active=?,custom_campus=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,campus,String(b.description||''),b.active===false?0:1,campus==='Andere'?String(b.customCampus||'').trim():null,b.id).run();
          if(!result.meta.changes) return json({error:'Team niet gevonden.'},404);
        } catch { return json({error:'Er bestaat al een team met deze naam.'},409); }
        await audit(env.DB,user,'team.update','team',b.id,{name,campus,active:b.active!==false});
        return json({ok:true});
      }
      if (method==='DELETE' && path==='/api/admin/teams') {
        const teamId=url.searchParams.get('teamId');
        if(!teamId) return json({error:'Team-ID ontbreekt.'},400);
        const used=await env.DB.prepare('SELECT COUNT(*) AS n FROM team_members WHERE team_id=?').bind(teamId).first();
        if(used.n) return json({error:'Dit team bevat nog leden. Verwijder eerst de teamleden.'},409);
        await env.DB.prepare('DELETE FROM teams WHERE id=?').bind(teamId).run();
        await audit(env.DB,user,'team.delete','team',teamId,{});
        return json({ok:true});
      }
      if (method==='POST' && path==='/api/admin/team-members') {
        const b=await bodyJson(request), {teamId,userId}=b||{}, memberRole=b?.memberRole||'member';
        if(!teamId || !userId || !['member','coordinator'].includes(memberRole)) return json({error:'Team, gebruiker en een geldige teamrol zijn verplicht.'},400);
        const [team,target]=await Promise.all([env.DB.prepare('SELECT id FROM teams WHERE id=?').bind(teamId).first(),env.DB.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(userId).first()]);
        if(!team || !target) return json({error:'Team of actieve gebruiker niet gevonden.'},404);
        await env.DB.prepare('INSERT INTO team_members(team_id,user_id,member_role) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET member_role=excluded.member_role').bind(teamId,userId,memberRole).run();
        await audit(env.DB,user,'team.member.assign','team_member',userId,{teamId,memberRole});
        return json({ok:true});
      }
      if (method==='DELETE' && path==='/api/admin/team-members') {
        const teamId=url.searchParams.get('teamId'), userId=url.searchParams.get('userId');
        if(!teamId || !userId) return json({error:'Team en gebruiker zijn verplicht.'},400);
        await env.DB.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=?').bind(teamId,userId).run();
        await audit(env.DB,user,'team.member.remove','team_member',userId,{teamId});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/education') {
        const [classes,campuses,schoolYears]=await Promise.all([
          env.DB.prepare('SELECT c.id,c.school_year_id,c.campus_id,cp.name AS campus_name,c.class_code,c.display_name,c.active,c.source_file,c.imported_at FROM classes c JOIN campuses cp ON cp.id=c.campus_id ORDER BY cp.name,c.class_code').all(),
          env.DB.prepare('SELECT id,code,name,active FROM campuses ORDER BY name').all(),
          env.DB.prepare('SELECT id,label,start_date,end_date,status FROM school_years ORDER BY start_date DESC').all()
        ]);
        return json({classes:classes.results||[],campuses:campuses.results||[],school_years:schoolYears.results||[],counts:{classes:(classes.results||[]).length,campuses:(campuses.results||[]).length,school_years:(schoolYears.results||[]).length}});
      }
      if (method==='GET' && path==='/api/admin/personnel') {
        const result=await env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name,u.status AS account_status,p.staff_number,p.campus_id,cp.name AS campus_name,COALESCE(p.employment_status,'unknown') AS employment_status,p.start_date,p.end_date,p.source,p.notes FROM users u LEFT JOIN personnel_profiles p ON p.user_id=u.id LEFT JOIN campuses cp ON cp.id=p.campus_id ORDER BY u.display_name,u.email`).all();
        return json({personnel:result.results||[],count:(result.results||[]).length,profiles:(result.results||[]).filter(x=>x.employment_status!=='unknown'||x.staff_number||x.campus_id).length});
      }
      if (method==='POST' && path==='/api/admin/personnel') {
        const b=await bodyJson(request), userId=String(b?.userId||'').trim(), campusId=b?.campusId?String(b.campusId):null, status=String(b?.employmentStatus||'unknown');
        if(!userId || !['active','inactive','leave','unknown'].includes(status)) return json({error:'Gebruiker en geldige personeelsstatus zijn verplicht.'},400);
        const target=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(); if(!target)return json({error:'Gebruiker niet gevonden.'},404);
        if(campusId && !await env.DB.prepare('SELECT id FROM campuses WHERE id=?').bind(campusId).first())return json({error:'Campus niet gevonden.'},404);
        await env.DB.prepare(`INSERT INTO personnel_profiles(user_id,staff_number,campus_id,employment_status,start_date,end_date,source,notes) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET staff_number=excluded.staff_number,campus_id=excluded.campus_id,employment_status=excluded.employment_status,start_date=excluded.start_date,end_date=excluded.end_date,source=excluded.source,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`).bind(userId,b.staffNumber||null,campusId,status,b.startDate||null,b.endDate||null,String(b.source||'manual'),String(b.notes||'')).run();
        await audit(env.DB,user,'personnel.profile.save','personnel',userId,{campusId,status}); return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/students') {
        const [students,years,classes]=await Promise.all([
          env.DB.prepare(`SELECT s.id,s.student_number,s.first_name,s.last_name,s.preferred_name,s.status,s.source,e.id AS enrolment_id,e.school_year_id,e.class_id,c.class_code,cp.name AS campus_name,e.start_date,e.end_date,e.status AS enrolment_status FROM students s LEFT JOIN student_enrolments e ON e.student_id=s.id AND e.status='active' LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN campuses cp ON cp.id=c.campus_id ORDER BY s.last_name,s.first_name`).all(),
          env.DB.prepare('SELECT id,label,start_date,end_date,status FROM school_years ORDER BY start_date DESC').all(),
          env.DB.prepare(`SELECT c.id,c.class_code,c.display_name,cp.name AS campus_name,c.school_year_id FROM classes c JOIN campuses cp ON cp.id=c.campus_id WHERE c.active=1 ORDER BY cp.name,c.class_code`).all()
        ]); return json({students:students.results||[],school_years:years.results||[],classes:classes.results||[],count:(students.results||[]).length});
      }
      if (method==='POST' && path==='/api/admin/students') {
        const b=await bodyJson(request), studentNumber=String(b?.studentNumber||'').trim(), firstName=String(b?.firstName||'').trim(), lastName=String(b?.lastName||'').trim(), status=String(b?.status||'active');
        if(!studentNumber||!firstName||!lastName||!['active','inactive','graduated','transferred'].includes(status))return json({error:'Leerlingnummer, voornaam, familienaam en geldige status zijn verplicht.'},400);
        const studentId=String(b.id||id());
        try { await env.DB.prepare(`INSERT INTO students(id,student_number,first_name,last_name,preferred_name,status,source) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET student_number=excluded.student_number,first_name=excluded.first_name,last_name=excluded.last_name,preferred_name=excluded.preferred_name,status=excluded.status,source=excluded.source,updated_at=CURRENT_TIMESTAMP`).bind(studentId,studentNumber,firstName,lastName,String(b.preferredName||''),status,String(b.source||'manual')).run(); } catch { return json({error:'Dit leerlingnummer is al in gebruik.'},409); }
        await audit(env.DB,user,b.id?'student.update':'student.create','student',studentId,{status}); return json({ok:true,id:studentId});
      }
      if (method==='POST' && path==='/api/admin/student-enrolments') {
        const b=await bodyJson(request), studentId=String(b?.studentId||''), schoolYearId=String(b?.schoolYearId||''), classId=String(b?.classId||'');
        if(!studentId||!schoolYearId||!classId)return json({error:'Leerling, schooljaar en klas zijn verplicht.'},400);
        const [student,year,cls]=await Promise.all([env.DB.prepare('SELECT id FROM students WHERE id=?').bind(studentId).first(),env.DB.prepare('SELECT id FROM school_years WHERE id=?').bind(schoolYearId).first(),env.DB.prepare('SELECT id FROM classes WHERE id=? AND school_year_id=?').bind(classId,schoolYearId).first()]);
        if(!student||!year||!cls)return json({error:'Leerling, schooljaar of klas niet gevonden.'},404);
        const enrolmentId=id(); try { await env.DB.prepare(`INSERT INTO student_enrolments(id,student_id,school_year_id,class_id,start_date,source) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,school_year_id) DO UPDATE SET class_id=excluded.class_id,start_date=excluded.start_date,end_date=NULL,status='active',source=excluded.source`).bind(enrolmentId,studentId,schoolYearId,classId,b.startDate||null,String(b.source||'manual')).run(); } catch { return json({error:'De klasinschrijving kon niet worden opgeslagen.'},409); }
        await audit(env.DB,user,'student.enrolment.save','student',studentId,{schoolYearId,classId}); return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/users') {
        const result=await env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.status,u.created_at,
          COUNT(DISTINCT uar.application_id) AS application_count FROM users u
          LEFT JOIN user_app_roles uar ON uar.user_id=u.id GROUP BY u.id ORDER BY u.email`).all();
        const assignments=await env.DB.prepare(`SELECT uar.user_id,uar.application_id,uar.role_id,uar.scope_json,r.name AS role_name,a.name AS application_name
          FROM user_app_roles uar JOIN roles r ON r.id=uar.role_id JOIN applications a ON a.id=uar.application_id`).all();
        return json({users:result.results,assignments:assignments.results});
      }
      if (method==='GET' && path==='/api/admin/applications') {
        const [apps,roles]=await Promise.all([
          env.DB.prepare('SELECT * FROM applications ORDER BY sort_order,name').all(),
          env.DB.prepare('SELECT * FROM roles WHERE application_id IS NOT NULL ORDER BY application_id,name').all()
        ]);
        return json({applications:apps.results,roles:roles.results.map(r=>({...r,permissions:JSON.parse(r.permissions_json||'[]')}))});
      }
      if (method==='POST' && path==='/api/admin/applications') {
        const b=await bodyJson(request);
        if (!b?.id) return json({error:'Toepassing ontbreekt.'},400);
        const audience=String(b.accessAudience||'').trim();
        if (audience && !/^[a-f0-9]{20,128}$/i.test(audience)) return json({error:'Ongeldige Cloudflare Access audience.'},400);
        const result=await env.DB.prepare('UPDATE applications SET access_audience=? WHERE id=?').bind(audience,b.id).run();
        if (!result.meta.changes) return json({error:'Toepassing niet gevonden.'},404);
        await audit(env.DB,user,'application.access_audience.update','application',b.id,{configured:Boolean(audience)});
        return json({ok:true});
      }
      if (method==='POST' && path==='/api/admin/roles') {
        const b=await bodyJson(request);
        if (!b || !b.applicationId || !String(b.name||'').trim()) return json({error:'Toepassing en rolnaam zijn verplicht.'},400);
        const app=await env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first();
        if (!app) return json({error:'Toepassing niet gevonden.'},404);
        const roleId=id(), permissions=Array.isArray(b.permissions)?b.permissions.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()):[];
        try {
          await env.DB.prepare('INSERT INTO roles(id,application_id,name,description,permissions_json) VALUES(?,?,?,?,?)')
            .bind(roleId,b.applicationId,String(b.name).trim(),String(b.description||''),JSON.stringify(permissions)).run();
        } catch { return json({error:'Deze rolnaam bestaat al binnen deze toepassing.'},409); }
        await audit(env.DB,user,'role.create','role',roleId,{applicationId:b.applicationId,name:b.name,permissions});
        return json({ok:true,id:roleId});
      }
      if (method==='PUT' && path==='/api/admin/roles') {
        const b=await bodyJson(request);
        if (!b?.id || !String(b.name||'').trim()) return json({error:'Rol-ID en naam zijn verplicht.'},400);
        const permissions=Array.isArray(b.permissions)?b.permissions.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()):[];
        const result=await env.DB.prepare('UPDATE roles SET name=?,description=?,permissions_json=? WHERE id=? AND application_id IS NOT NULL')
          .bind(String(b.name).trim(),String(b.description||''),JSON.stringify(permissions),b.id).run();
        if (!result.meta.changes) return json({error:'Rol niet gevonden.'},404);
        await audit(env.DB,user,'role.update','role',b.id,{name:b.name,permissions});
        return json({ok:true});
      }
      if (method==='DELETE' && path==='/api/admin/roles') {
        const roleId=url.searchParams.get('id');
        if (!roleId) return json({error:'Rol-ID ontbreekt.'},400);
        const used=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM user_app_roles WHERE role_id=?) + (SELECT COUNT(*) FROM user_application_role_scopes WHERE role_id=?) AS n').bind(roleId,roleId).first();
        if (used.n) return json({error:'Deze rol is nog toegewezen. Verwijder eerst de toewijzingen.'},409);
        await env.DB.prepare('DELETE FROM roles WHERE id=? AND application_id IS NOT NULL').bind(roleId).run();
        await audit(env.DB,user,'role.delete','role',roleId,{});
        return json({ok:true});
      }
      if (method==='POST' && path==='/api/admin/assignments') {
        const b=await bodyJson(request), {userId,applicationId,roleId}=b||{};
        const scope=b?.scope===undefined?{}:b.scope;
        if (!scope || typeof scope!=='object' || Array.isArray(scope)) return json({error:'Scope moet een JSON-object zijn.'},400);
        if (![userId,applicationId,roleId].every(v=>typeof v==='string'&&v)) return json({error:'Gebruiker, toepassing en rol zijn verplicht.'},400);
        const [target,app,role]=await Promise.all([
          env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(),
          env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(applicationId).first(),
          env.DB.prepare('SELECT id,application_id FROM roles WHERE id=?').bind(roleId).first()
        ]);
        if (!target||!app||!role||role.application_id!==applicationId) return json({error:'Gebruiker, toepassing of toepassingsrol niet gevonden.'},404);
        await env.DB.prepare('INSERT INTO user_app_roles(user_id,application_id,role_id,assigned_by,scope_json) VALUES(?,?,?,?,?) ON CONFLICT(user_id,application_id,role_id) DO UPDATE SET assigned_by=excluded.assigned_by,assigned_at=CURRENT_TIMESTAMP,scope_json=excluded.scope_json').bind(userId,applicationId,roleId,user.email,JSON.stringify(scope)).run();
        await audit(env.DB,user,'assignment.grant','user_app_role',userId,{applicationId,roleId});
        return json({ok:true});
      }
      if (method==='DELETE' && path==='/api/admin/assignments') {
        const userId=url.searchParams.get('userId'),applicationId=url.searchParams.get('applicationId'),roleId=url.searchParams.get('roleId');
        if (![userId,applicationId,roleId].every(Boolean)) return json({error:'Gebruiker, toepassing en rol zijn verplicht.'},400);
        await env.DB.prepare('DELETE FROM user_app_roles WHERE user_id=? AND application_id=? AND role_id=?').bind(userId,applicationId,roleId).run();
        await audit(env.DB,user,'assignment.revoke','user_app_role',userId,{applicationId,roleId});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/teams') {
        const [teams,members]=await Promise.all([
          env.DB.prepare('SELECT id,name,campus,description,active,custom_campus FROM teams ORDER BY campus,name').all(),
          env.DB.prepare('SELECT tm.team_id,tm.user_id,tm.member_role,u.email,u.display_name FROM team_members tm JOIN users u ON u.id=tm.user_id ORDER BY u.display_name').all()
        ]);
        return json({teams:teams.results,members:members.results});
      }
      if (method==='POST' && path==='/api/admin/teams') {
        const b=await bodyJson(request);
        if(!b||!String(b.name||'').trim()||!['Ninove','Zottegem','Beide campussen'].includes(b.campus))return json({error:'Teamnaam en campus zijn verplicht.'},400);
        const teamId=String(b.id||id());
        try{await env.DB.prepare('INSERT INTO teams(id,name,campus,description,active,custom_campus) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,campus=excluded.campus,description=excluded.description,active=excluded.active,custom_campus=excluded.custom_campus,updated_at=CURRENT_TIMESTAMP').bind(teamId,b.name.trim(),b.campus,String(b.description||''),b.active===false?0:1,b.customCampus||null).run();}
        catch{return json({error:'Deze teamnaam bestaat al.'},409);}
        await audit(env.DB,user,'team.save','team',teamId,{name:b.name,campus:b.campus});
        return json({ok:true,id:teamId});
      }
      if(method==='DELETE'&&path==='/api/admin/teams'){
        const teamId=url.searchParams.get('id');if(!teamId)return json({error:'Team-ID ontbreekt.'},400);
        await env.DB.prepare('UPDATE teams SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(teamId).run();
        await audit(env.DB,user,'team.archive','team',teamId,{});
        return json({ok:true});
      }
      if(method==='POST'&&path==='/api/admin/team-members'){
        const b=await bodyJson(request);
        if(!b?.teamId||!b?.userId||!['member','coordinator'].includes(b.memberRole||'member'))return json({error:'Team, gebruiker en rol zijn verplicht.'},400);
        const [team,target]=await Promise.all([env.DB.prepare('SELECT id FROM teams WHERE id=?').bind(b.teamId).first(),env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first()]);
        if(!team||!target)return json({error:'Team of gebruiker niet gevonden.'},404);
        await env.DB.prepare('INSERT INTO team_members(team_id,user_id,member_role) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET member_role=excluded.member_role').bind(b.teamId,b.userId,b.memberRole||'member').run();
        await audit(env.DB,user,'team.member.add','team_member',b.userId,{teamId:b.teamId,memberRole:b.memberRole||'member'});
        return json({ok:true});
      }
      if(method==='DELETE'&&path==='/api/admin/team-members'){
        const teamId=url.searchParams.get('teamId'),userId=url.searchParams.get('userId');if(!teamId||!userId)return json({error:'Team en gebruiker zijn verplicht.'},400);
        await env.DB.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=?').bind(teamId,userId).run();
        await audit(env.DB,user,'team.member.remove','team_member',userId,{teamId});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/teams') {
        const [teams,members]=await Promise.all([
          env.DB.prepare('SELECT id,name,campus,description,active,custom_campus FROM teams ORDER BY campus,name').all(),
          env.DB.prepare('SELECT tm.team_id,tm.user_id,tm.member_role,u.email,u.display_name FROM team_members tm JOIN users u ON u.id=tm.user_id ORDER BY u.display_name').all()
        ]);
        return json({teams:teams.results,members:members.results});
      }
      if (method==='POST' && path==='/api/admin/teams') {
        const b=await bodyJson(request);
        if(!b||!String(b.name||'').trim()||!['Ninove','Zottegem','Beide campussen'].includes(b.campus))return json({error:'Teamnaam en campus zijn verplicht.'},400);
        const teamId=String(b.id||id());
        try{await env.DB.prepare('INSERT INTO teams(id,name,campus,description,active,custom_campus) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,campus=excluded.campus,description=excluded.description,active=excluded.active,custom_campus=excluded.custom_campus,updated_at=CURRENT_TIMESTAMP').bind(teamId,b.name.trim(),b.campus,String(b.description||''),b.active===false?0:1,b.customCampus||null).run();}
        catch{return json({error:'Deze teamnaam bestaat al.'},409);}
        await audit(env.DB,user,'team.save','team',teamId,{name:b.name,campus:b.campus});
        return json({ok:true,id:teamId});
      }
      if(method==='DELETE'&&path==='/api/admin/teams'){
        const teamId=url.searchParams.get('id');if(!teamId)return json({error:'Team-ID ontbreekt.'},400);
        await env.DB.prepare('UPDATE teams SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(teamId).run();
        await audit(env.DB,user,'team.archive','team',teamId,{});
        return json({ok:true});
      }
      if(method==='POST'&&path==='/api/admin/team-members'){
        const b=await bodyJson(request);
        if(!b?.teamId||!b?.userId||!['member','coordinator'].includes(b.memberRole||'member'))return json({error:'Team, gebruiker en rol zijn verplicht.'},400);
        const [team,target]=await Promise.all([env.DB.prepare('SELECT id FROM teams WHERE id=?').bind(b.teamId).first(),env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first()]);
        if(!team||!target)return json({error:'Team of gebruiker niet gevonden.'},404);
        await env.DB.prepare('INSERT INTO team_members(team_id,user_id,member_role) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET member_role=excluded.member_role').bind(b.teamId,b.userId,b.memberRole||'member').run();
        await audit(env.DB,user,'team.member.add','team_member',b.userId,{teamId:b.teamId,memberRole:b.memberRole||'member'});
        return json({ok:true});
      }
      if(method==='DELETE'&&path==='/api/admin/team-members'){
        const teamId=url.searchParams.get('teamId'),userId=url.searchParams.get('userId');if(!teamId||!userId)return json({error:'Team en gebruiker zijn verplicht.'},400);
        await env.DB.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=?').bind(teamId,userId).run();
        await audit(env.DB,user,'team.member.remove','team_member',userId,{teamId});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/audit') {
        const result=await env.DB.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 200').all();
        return json({events:result.results});
      }
      return json({error:'Beheereindpunt niet gevonden.'},404);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({error:'Niet gevonden.'},404);
  }
};