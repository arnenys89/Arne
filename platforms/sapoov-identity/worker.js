const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const id = () => crypto.randomUUID();
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '');

let jwksCache = null;
let jwksFetchedAt = 0;
const decode64url = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')), c => c.charCodeAt(0));
async function authenticate(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion');
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

    if (method==='GET' && path==='/api/me') {
      const [apps, assignments] = await Promise.all([
        env.DB.prepare("SELECT * FROM applications WHERE status!='hidden' ORDER BY sort_order,name").all(),
        env.DB.prepare(`SELECT a.id AS application_id,a.name AS application_name,a.url,r.id AS role_id,r.name AS role,r.permissions_json
          FROM user_app_roles uar JOIN applications a ON a.id=uar.application_id JOIN roles r ON r.id=uar.role_id
          WHERE uar.user_id=? AND a.status!='hidden' ORDER BY a.sort_order,a.name,r.name`).bind(user.id).all()
      ]);
      const visible = superadmin ? apps.results : apps.results.filter(a=>assignments.results.some(x=>x.application_id===a.id));
      return json({user:{id:user.id,email:user.email,display_name:user.display_name},superadmin,applications:visible,assignments:assignments.results});
    }

    if (method==='GET' && path.startsWith('/api/access/')) {
      const appSlug=slug(path.slice('/api/access/'.length));
      const app=await env.DB.prepare('SELECT * FROM applications WHERE id=? AND status="active"').bind(appSlug).first();
      if (!app) return json({error:'Onbekende toepassing.'},404);
      const allowedAudiences=appSlug==='bestelplatform'?[app.access_audience,'c76aa7483c5c89e436cb4ddf2ad0d545f79e612d9701ed357aa8921ab77dea73']:[app.access_audience];
      if (!app.access_audience || !allowedAudiences.some(a=>a&&identity.audiences.includes(a))) return json({error:'De aanmeldsessie hoort niet bij deze toepassing.'},403);
      const rows=await env.DB.prepare(`SELECT r.id,r.name,r.description,r.permissions_json,uar.scope_json FROM user_app_roles uar
        JOIN roles r ON r.id=uar.role_id WHERE uar.user_id=? AND uar.application_id=? ORDER BY r.name`).bind(user.id,app.id).all();
      const teamData=appSlug==='bestelplatform'?await Promise.all([env.DB.prepare('SELECT id,name,campus,description,active,custom_campus FROM teams WHERE active=1 ORDER BY campus,name').all(),env.DB.prepare('SELECT team_id,member_role FROM team_members WHERE user_id=?').bind(user.id).all(),env.DB.prepare('SELECT tm.team_id,tm.member_role,u.email FROM team_members tm JOIN users u ON u.id=tm.user_id').all()]):[{results:[]},{results:[]},{results:[]}];
      return json({user:{id:user.id,email:user.email,display_name:user.display_name},application:{id:app.id,name:app.name},roles:rows.results.map(r=>({...r,permissions:JSON.parse(r.permissions_json||'[]'),scope:JSON.parse(r.scope_json||'{}')})),teams:teamData[0].results,teamMemberships:teamData[1].results,teamMembers:teamData[2].results,authorized:rows.results.length>0});
    }

    if (path.startsWith('/api/admin/')) {
      if (!superadmin) return json({error:'Alleen de centrale superadministrator mag gebruikers en rechten beheren.'},403);
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
        const used=await env.DB.prepare('SELECT COUNT(*) AS n FROM user_app_roles WHERE role_id=?').bind(roleId).first();
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
      if (method==='GET' && path==='/api/admin/education') {
        const [campuses,years,classes]=await Promise.all([
          env.DB.prepare('SELECT id,name,code AS short_name FROM campuses WHERE active=1 ORDER BY name').all(),
          env.DB.prepare('SELECT id,label,start_date,end_date,CASE WHEN status='active' THEN 1 ELSE 0 END AS active FROM school_years ORDER BY start_date DESC').all(),
          env.DB.prepare(`SELECT c.id,c.class_code,c.display_name,c.campus_id,c.school_year_id,c.active,cp.name AS campus_name,cp.code AS campus_short_name
            FROM classes c JOIN campuses cp ON cp.id=c.campus_id ORDER BY cp.name,c.class_code`).all()
        ]);
        return json({campuses:campuses.results,school_years:years.results,classes:classes.results});
      }
      if (method==='GET' && path==='/api/admin/personnel') {
        const result=await env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name,p.staff_number,p.campus_id,c.name AS campus_name,
          COALESCE(p.employment_status,'unknown') AS employment_status,p.start_date,p.end_date
          FROM users u LEFT JOIN personnel_profiles p ON p.user_id=u.id LEFT JOIN campuses c ON c.id=p.campus_id
          WHERE u.status='active' ORDER BY u.email`).all();
        return json({personnel:result.results});
      }
      if (method==='POST' && path==='/api/admin/personnel') {
        const b=await bodyJson(request);
        if (!b?.userId || !['unknown','active','leave','inactive'].includes(b.employmentStatus||'unknown')) return json({error:'Gebruiker en geldige personeelsstatus zijn verplicht.'},400);
        const target=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first();
        if (!target) return json({error:'Gebruiker niet gevonden.'},404);
        if (b.campusId && !await env.DB.prepare('SELECT id FROM campuses WHERE id=?').bind(b.campusId).first()) return json({error:'Campus niet gevonden.'},404);
        await env.DB.prepare(`INSERT INTO personnel_profiles(user_id,staff_number,campus_id,employment_status,start_date,end_date)
          VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET staff_number=excluded.staff_number,campus_id=excluded.campus_id,
          employment_status=excluded.employment_status,start_date=excluded.start_date,end_date=excluded.end_date,updated_at=CURRENT_TIMESTAMP`)
          .bind(b.userId,b.staffNumber||null,b.campusId||null,b.employmentStatus||'unknown',b.startDate||null,b.endDate||null).run();
        await audit(env.DB,user,'personnel.profile.update','personnel_profile',b.userId,{campusId:b.campusId||null,status:b.employmentStatus||'unknown'});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/students') {
        const [students,years,classes]=await Promise.all([
          env.DB.prepare(`SELECT s.id,s.student_number,s.first_name,s.last_name,s.preferred_name,s.status,
            e.school_year_id,e.class_id,c.class_code,cp.name AS campus_name
            FROM students s LEFT JOIN student_enrolments e ON e.student_id=s.id AND e.status='active'
            LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN campuses cp ON cp.id=c.campus_id
            ORDER BY s.last_name,s.first_name`).all(),
          env.DB.prepare('SELECT id,label,start_date,end_date,active FROM school_years ORDER BY start_date DESC').all(),
          env.DB.prepare(`SELECT c.id,c.class_code,c.display_name,c.school_year_id,cp.name AS campus_name
            FROM classes c JOIN campuses cp ON cp.id=c.campus_id WHERE c.active=1 ORDER BY c.school_year_id DESC,cp.name,c.class_code`).all()
        ]);
        return json({count:students.results.length,students:students.results,school_years:years.results,classes:classes.results});
      }
      if (method==='POST' && path==='/api/admin/students') {
        const b=await bodyJson(request);
        const number=String(b?.studentNumber||'').trim(), first=String(b?.firstName||'').trim(), last=String(b?.lastName||'').trim();
        if (!number||!first||!last) return json({error:'Leerlingnummer, voornaam en familienaam zijn verplicht.'},400);
        const studentId=id();
        try {
          await env.DB.prepare('INSERT INTO students(id,student_number,first_name,last_name,preferred_name) VALUES(?,?,?,?,?)')
            .bind(studentId,number,first,last,String(b.preferredName||'').trim()).run();
        } catch { return json({error:'Dit leerlingnummer bestaat al.'},409); }
        await audit(env.DB,user,'student.create','student',studentId,{studentNumber:number});
        return json({ok:true,id:studentId},201);
      }
      if (method==='POST' && path==='/api/admin/student-enrolments') {
        const b=await bodyJson(request);
        if (!b?.studentId||!b?.schoolYearId||!b?.classId) return json({error:'Leerling, schooljaar en klas zijn verplicht.'},400);
        const [student,year,klass]=await Promise.all([
          env.DB.prepare('SELECT id FROM students WHERE id=?').bind(b.studentId).first(),
          env.DB.prepare('SELECT id FROM school_years WHERE id=?').bind(b.schoolYearId).first(),
          env.DB.prepare('SELECT id,school_year_id FROM classes WHERE id=?').bind(b.classId).first()
        ]);
        if (!student||!year||!klass||klass.school_year_id!==b.schoolYearId) return json({error:'Leerling, schooljaar of klas is ongeldig.'},404);
        await env.DB.prepare(`INSERT INTO student_enrolments(id,student_id,school_year_id,class_id,start_date,status)
          VALUES(?,?,?,?,?,'active') ON CONFLICT(student_id,school_year_id) DO UPDATE SET class_id=excluded.class_id,start_date=excluded.start_date,status='active',end_date=NULL`)
          .bind(id(),b.studentId,b.schoolYearId,b.classId,b.startDate||null).run();
        await audit(env.DB,user,'student.enrolment.update','student',b.studentId,{schoolYearId:b.schoolYearId,classId:b.classId});
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
