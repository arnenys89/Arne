
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
function explicitScopeEnabled(grants, unitId) {
  return grants.some(row => row.organization_unit_id === unitId && Number(row.enabled) === 1);
}

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
      const [apps,units,access,roleRows]=await Promise.all([
        env.DB.prepare("SELECT * FROM applications WHERE status!='hidden' ORDER BY sort_order,name").all(),
        env.DB.prepare("SELECT id,parent_id,unit_type,name FROM organization_units WHERE active=1 ORDER BY sort_order,name").all(),
        env.DB.prepare("SELECT application_id,organization_unit_id,enabled FROM user_application_access_scopes WHERE user_id=?").bind(user.id).all(),
        env.DB.prepare(`SELECT s.application_id,s.role_id,s.organization_unit_id,s.enabled,r.name AS role,r.permissions_json,a.name AS application_name,a.url
          FROM user_application_role_scopes s JOIN roles r ON r.id=s.role_id JOIN applications a ON a.id=s.application_id
          WHERE s.user_id=? AND a.status!='hidden' ORDER BY a.sort_order,a.name,r.name`).bind(user.id).all()
      ]);
      const contexts=superadmin ? units.results : units.results.filter(unit =>
        access.results.some(grant=>grant.organization_unit_id===unit.id&&Number(grant.enabled)===1)
      );
      const requestedUnitId=url.searchParams.get('organizationUnitId')||'';
      const selectedUnit=requestedUnitId ? contexts.find(unit=>unit.id===requestedUnitId) : null;
      if(requestedUnitId&&!selectedUnit) return json({error:'Je hebt geen expliciete toegang tot deze organisatiecontext.'},403);
      // Superadmins see the complete application catalogue even before choosing a working context.
      // Selecting a context is still required before opening context-bound modules.
      const visibleApps=selectedUnit
        ? (superadmin ? apps.results : apps.results.filter(app =>
            explicitScopeEnabled(access.results.filter(x=>x.application_id===app.id),selectedUnit.id)
          ))
        : (superadmin ? apps.results : []);
      const visibleAppIds=new Set(visibleApps.map(x=>x.id));
      const assignments=selectedUnit ? roleRows.results.filter(row =>
        row.organization_unit_id===selectedUnit.id&&Number(row.enabled)===1&&visibleAppIds.has(row.application_id)
      ).map(row=>({...row,permissions:JSON.parse(row.permissions_json||'[]')})) : [];
      return json({
        user:{id:user.id,email:user.email,display_name:user.display_name},superadmin,
        contexts:contexts.map(({id,parent_id,unit_type,name})=>({id,parent_id,unit_type,name})),
        selectedOrganizationUnit:selectedUnit,
        applications:visibleApps,assignments
      });
    }

    if (method==='GET' && path.startsWith('/api/access/')) {
      const appSlug=slug(path.slice('/api/access/'.length));
      const app=await env.DB.prepare('SELECT * FROM applications WHERE id=? AND status="active"').bind(appSlug).first();
      if (!app) return json({error:'Onbekende toepassing.'},404);
      if (!app.access_audience || !identity.audiences.includes(app.access_audience)) return json({error:'De aanmeldsessie hoort niet bij deze toepassing.'},403);
      const [units,access,roleRows]=await Promise.all([
        env.DB.prepare("SELECT id,parent_id,unit_type,name FROM organization_units WHERE active=1").all(),
        env.DB.prepare("SELECT organization_unit_id,enabled FROM user_application_access_scopes WHERE user_id=? AND application_id=?").bind(user.id,app.id).all(),
        env.DB.prepare(`SELECT s.role_id,s.organization_unit_id,s.enabled,r.name,r.description,r.permissions_json
          FROM user_application_role_scopes s JOIN roles r ON r.id=s.role_id
          WHERE s.user_id=? AND s.application_id=? ORDER BY r.name`).bind(user.id,app.id).all()
      ]);
      const available=access.results.filter(x=>Number(x.enabled)===1).map(x=>x.organization_unit_id);
      let unitId=url.searchParams.get('organizationUnitId')||'';
      if(!unitId&&available.length===1)unitId=available[0];
      const candidateUnits=superadmin?units.results:units.results.filter(x=>available.includes(x.id));
      if(!unitId&&candidateUnits.length===1)unitId=candidateUnits[0].id;
      if(!unitId&&candidateUnits.length>1)return json({error:'Kies eerst een organisatiecontext.',requiresOrganizationContext:true,organizationUnits:candidateUnits.map(x=>({id:x.id,name:x.name,type:x.unit_type}))},409);
      if(!unitId)return json({error:'Je hebt geen expliciete toegang tot deze toepassing.'},403);
      const selectedUnit=units.results.find(x=>x.id===unitId);
      if(!selectedUnit)return json({error:'De gekozen organisatiecontext bestaat niet.'},404);
      if(!superadmin&&!explicitScopeEnabled(access.results,unitId))return json({error:'Je hebt geen expliciete toegang tot deze toepassing binnen deze organisatiecontext.'},403);
      const roles=roleRows.results.filter(row=>row.organization_unit_id===unitId&&Number(row.enabled)===1)
        .map(row=>({id:row.role_id,name:row.name,description:row.description,permissions:JSON.parse(row.permissions_json||'[]')}));
      return json({
        user:{id:user.id,email:user.email,display_name:user.display_name},
        application:{id:app.id,name:app.name},organizationUnit:{id:selectedUnit.id,name:selectedUnit.name,type:selectedUnit.unit_type},
        organizationUnits:[{id:selectedUnit.id,name:selectedUnit.name}],roles,authorized:true
      });
    }

    if (method==='GET' && ['/beleidskompas','/beleidskompas/','/beleidskompas.html'].includes(path)) {
      const app=await env.DB.prepare("SELECT id FROM applications WHERE id='beleidskompas' AND status='active'").first();
      if (!app) return new Response('Beleidskompas is nog niet geconfigureerd.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
      const [units,accessRows,roleRows]=await Promise.all([
        env.DB.prepare("SELECT id,parent_id,unit_type,name FROM organization_units WHERE active=1").all(),
        env.DB.prepare("SELECT organization_unit_id,enabled FROM user_application_access_scopes WHERE user_id=? AND application_id='beleidskompas'").bind(user.id).all(),
        env.DB.prepare("SELECT organization_unit_id,enabled FROM user_application_role_scopes WHERE user_id=? AND application_id='beleidskompas'").bind(user.id).all()
      ]);
      const available=accessRows.results.filter(x=>Number(x.enabled)===1).map(x=>x.organization_unit_id);
      let unitId=url.searchParams.get('organizationUnitId')||'';
      if(!unitId&&available.length===1)unitId=available[0];
      const selectedUnit=units.results.find(x=>x.id===unitId);
      const grant=selectedUnit&&explicitScopeEnabled(accessRows.results,unitId)&&explicitScopeEnabled(roleRows.results,unitId);
      if (!superadmin && !grant) return new Response('Je hebt geen expliciete toegang tot Beleidskompas binnen deze organisatiecontext.',{status:403,headers:{'content-type':'text/plain; charset=utf-8'}});
      return env.ASSETS.fetch(new Request(new URL('/beleidskompas.html'+(unitId?'?organizationUnitId='+encodeURIComponent(unitId):''),url),{method:'GET',headers:request.headers}));
    }

    if (path.startsWith('/api/admin/')) {
      if (!superadmin) return json({error:'Alleen de centrale superadministrator mag gebruikers en rechten beheren.'},403);
      if (method==='GET' && path==='/api/admin/rights-matrix') {
        const [userRows,appRows,roleRows,unitRows,assignmentRows,accessRows,accessScopeRows,roleScopeRows]=await Promise.all([
          env.DB.prepare("SELECT id,email,display_name,status,created_at FROM users ORDER BY email").all(),
          env.DB.prepare("SELECT * FROM applications WHERE status!='hidden' ORDER BY sort_order,name").all(),
          env.DB.prepare("SELECT * FROM roles WHERE application_id IS NOT NULL ORDER BY application_id,name").all(),
          env.DB.prepare("SELECT id,parent_id,unit_type,name,sort_order,active FROM organization_units WHERE active=1 ORDER BY sort_order,name").all(),
          env.DB.prepare(`SELECT uar.user_id,uar.application_id,uar.role_id,uar.scope_json,r.name AS role_name,a.name AS application_name
            FROM user_app_roles uar JOIN roles r ON r.id=uar.role_id JOIN applications a ON a.id=uar.application_id`).all(),
          env.DB.prepare("SELECT user_id,application_id,enabled FROM user_application_access").all(),
          env.DB.prepare("SELECT user_id,application_id,organization_unit_id,enabled FROM user_application_access_scopes").all(),
          env.DB.prepare("SELECT user_id,application_id,role_id,organization_unit_id,enabled FROM user_application_role_scopes").all()
        ]);
        return json({
          users:userRows.results,applications:appRows.results,
          roles:roleRows.results.map(r=>({...r,permissions:JSON.parse(r.permissions_json||'[]')})),
          assignments:assignmentRows.results,access:accessRows.results,
          organizationUnits:unitRows.results,accessScopes:accessScopeRows.results,roleScopes:roleScopeRows.results
        });
      }
      if (method==='POST' && path==='/api/admin/organization-access') {
        const b=await bodyJson(request);
        if (!b?.userId || !b?.applicationId || !b?.organizationUnitId || typeof b.enabled!=='boolean') return json({error:'Gebruiker, toepassing, organisatie-eenheid en toegang zijn verplicht.'},400);
        const [target,app,unit]=await Promise.all([
          env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first(),
          env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first(),
          env.DB.prepare("SELECT id,unit_type FROM organization_units WHERE id=? AND active=1").bind(b.organizationUnitId).first()
        ]);
        if (!target || !app || !unit) return json({error:'Gebruiker, toepassing of organisatie-eenheid niet gevonden of niet wijzigbaar.'},404);
        await env.DB.prepare(`INSERT INTO user_application_access_scopes(user_id,application_id,organization_unit_id,enabled,updated_by)
          VALUES(?,?,?,?,?) ON CONFLICT(user_id,application_id,organization_unit_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
          .bind(b.userId,b.applicationId,b.organizationUnitId,b.enabled?1:0,user.email).run();
        await audit(env.DB,user,'organization.application.access.update','user_application_access_scope',b.userId,{applicationId:b.applicationId,organizationUnitId:b.organizationUnitId,enabled:b.enabled});
        return json({ok:true,enabled:b.enabled});
      }
      if (method==='POST' && path==='/api/admin/organization-roles') {
        const b=await bodyJson(request);
        if (!b?.userId || !b?.applicationId || !b?.roleId || !b?.organizationUnitId || typeof b.enabled!=='boolean') return json({error:'Gebruiker, toepassing, rol, organisatie-eenheid en status zijn verplicht.'},400);
        const [target,app,role,unit]=await Promise.all([
          env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first(),
          env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first(),
          env.DB.prepare('SELECT id,application_id FROM roles WHERE id=?').bind(b.roleId).first(),
          env.DB.prepare("SELECT id,unit_type FROM organization_units WHERE id=? AND active=1").bind(b.organizationUnitId).first()
        ]);
        if (!target || !app || !role || role.application_id!==b.applicationId || !unit) return json({error:'Gebruiker, toepassing, rol of organisatie-eenheid niet geldig.'},404);
        await env.DB.prepare(`INSERT INTO user_application_role_scopes(user_id,application_id,role_id,organization_unit_id,enabled,updated_by)
          VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,application_id,role_id,organization_unit_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
          .bind(b.userId,b.applicationId,b.roleId,b.organizationUnitId,b.enabled?1:0,user.email).run();
        await audit(env.DB,user,'organization.application.role.update','user_application_role_scope',b.userId,{applicationId:b.applicationId,roleId:b.roleId,organizationUnitId:b.organizationUnitId,enabled:b.enabled});
        return json({ok:true,enabled:b.enabled});
      }
      
        if (method==='POST' && path==='/api/admin/access') {
        const b=await bodyJson(request);
        if (!b?.userId || !b?.applicationId || typeof b.enabled!=='boolean') return json({error:'Gebruiker, toepassing en toegang (aan/uit) zijn verplicht.'},400);
        const [target,app]=await Promise.all([
          env.DB.prepare('SELECT id,email FROM users WHERE id=?').bind(b.userId).first(),
          env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first()
        ]);
        if (!target || !app) return json({error:'Gebruiker of toepassing niet gevonden.'},404);
        await env.DB.prepare(`INSERT INTO user_application_access(user_id,application_id,enabled,updated_by)
          VALUES(?,?,?,?) ON CONFLICT(user_id,application_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
          .bind(b.userId,b.applicationId,b.enabled?1:0,user.email).run();
        await audit(env.DB,user,'application.access.update','user_application_access',b.userId,{applicationId:b.applicationId,enabled:b.enabled,retainedRoles:true});
        return json({ok:true,enabled:b.enabled});
      }
      if (method==='GET' && path==='/api/admin/users') {
        const result=await env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.status,u.created_at,
          COUNT(DISTINCT uar.application_id) AS application_count FROM users u
          LEFT JOIN user_app_roles uar ON uar.user_id=u.id GROUP BY u.id ORDER BY u.email`).all();
        const assignments=await env.DB.prepare(`SELECT uar.user_id,uar.application_id,uar.role_id,uar.scope_json,r.name AS role_name,a.name AS application_name
          FROM user_app_roles uar JOIN roles r ON r.id=uar.role_id JOIN applications a ON a.id=uar.application_id`).all();
        return json({users:result.results,assignments:assignments.results});
      }
      if (method==='PATCH' && path==='/api/admin/users') {
        const b=await bodyJson(request);
        if (!b?.userId || !['active','blocked'].includes(b.status)) return json({error:'Gebruiker en geldige status zijn verplicht.'},400);
        const target=await env.DB.prepare('SELECT id,email FROM users WHERE id=?').bind(b.userId).first();
        if (!target) return json({error:'Gebruiker niet gevonden.'},404);
        if ((env.SUPERADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).includes(String(target.email).toLowerCase()) && b.status!=='active') return json({error:'De centrale superadministrator kan niet worden geblokkeerd.'},409);
        await env.DB.prepare('UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.status,b.userId).run();
        await audit(env.DB,user,'user.status.update','user',b.userId,{email:target.email,status:b.status});
        return json({ok:true});
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
