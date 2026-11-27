
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
      const [apps,assignments,contexts]=await Promise.all([
        env.DB.prepare("SELECT * FROM applications WHERE status!='hidden' ORDER BY sort_order,name").all(),
        env.DB.prepare(`SELECT a.id AS application_id,a.name AS application_name,a.url,r.id AS role_id,r.name AS role,r.permissions_json
          FROM user_app_roles uar JOIN applications a ON a.id=uar.application_id JOIN roles r ON r.id=uar.role_id
          WHERE uar.user_id=? AND a.status!='hidden' ORDER BY a.sort_order,a.name,r.name`).bind(user.id).all(),
        superadmin
          ? env.DB.prepare("SELECT id,display_name,organization_type FROM organizations WHERE organization_type='institution' AND status='active' ORDER BY sort_order,display_name").all()
          : env.DB.prepare(`SELECT DISTINCT o.id,o.display_name,o.organization_type
              FROM user_module_access uma JOIN organizations o ON o.id=uma.organization_id
              WHERE uma.user_id=? AND uma.enabled=1 AND o.organization_type='institution' AND o.status='active'
              ORDER BY o.display_name`).bind(user.id).all()
      ]);
      const availableContexts=contexts.results;
      const requestedContext=request.headers.get('x-sapoov-context')||url.searchParams.get('sapoov_context')||'';
      let activeContext=availableContexts.find(c=>c.id===requestedContext)||null;
      if (!activeContext && availableContexts.length===1) activeContext=availableContexts[0];
      let visible=[];
      if (superadmin) {
        visible=apps.results;
      } else if (availableContexts.length) {
        if (activeContext) {
          const scopedApps=await env.DB.prepare(`SELECT a.* FROM user_module_access uma
            JOIN applications a ON a.id=uma.application_id
            WHERE uma.user_id=? AND uma.organization_id=? AND uma.enabled=1 AND a.status='active'
            ORDER BY a.sort_order,a.name`).bind(user.id,activeContext.id).all();
          visible=scopedApps.results;
        }
      } else {
        // Backward compatibility while existing single-school grants are migrated.
        visible=apps.results.filter(a=>assignments.results.some(x=>x.application_id===a.id));
      }
      return json({
        user:{id:user.id,email:user.email,display_name:user.display_name},
        superadmin,
        applications:visible,
        assignments:assignments.results,
        contexts:availableContexts,
        activeContext,
        requiresContextSelection:!superadmin&&availableContexts.length>1&&!activeContext
      });
    }

    if (method==='GET' && path.startsWith('/api/access/')) {
      const appSlug=slug(path.slice('/api/access/'.length));
      const app=await env.DB.prepare('SELECT * FROM applications WHERE id=? AND status="active"').bind(appSlug).first();
      if (!app) return json({error:'Onbekende toepassing.'},404);
      if (!app.access_audience || !identity.audiences.includes(app.access_audience)) return json({error:'De aanmeldsessie hoort niet bij deze toepassing.'},403);
      const requestedContext=request.headers.get('x-sapoov-context')||url.searchParams.get('sapoov_context')||'';
      if (!superadmin && requestedContext) {
        const gate=await env.DB.prepare(`SELECT 1 AS ok FROM user_module_access uma
          JOIN organizations o ON o.id=uma.organization_id
          WHERE uma.user_id=? AND uma.application_id=? AND uma.organization_id=? AND uma.enabled=1 AND o.status='active'`).bind(user.id,app.id,requestedContext).first();
        if (!gate) return json({error:'Je hebt geen platformtoegang in deze organisatiecontext.'},403);
        const rows=await env.DB.prepare(`SELECT r.id,r.name,r.description,r.permissions_json
          FROM user_scoped_role_assignments s JOIN roles r ON r.id=s.role_id
          WHERE s.user_id=? AND s.application_id=? AND s.organization_id=? AND s.status='active'
            AND (s.valid_from IS NULL OR s.valid_from<=date('now'))
            AND (s.valid_until IS NULL OR s.valid_until>=date('now'))
          ORDER BY r.name`).bind(user.id,app.id,requestedContext).all();
        return json({user:{id:user.id,email:user.email,display_name:user.display_name},application:{id:app.id,name:app.name},contextId:requestedContext,roles:rows.results.map(r=>({...r,permissions:JSON.parse(r.permissions_json||'[]')})),authorized:true});
      }
      if (!superadmin) {
        const hasScopedContext=await env.DB.prepare('SELECT 1 AS ok FROM user_module_access WHERE user_id=? AND enabled=1 LIMIT 1').bind(user.id).first();
        if (hasScopedContext) return json({error:'Kies eerst een organisatiecontext.'},400);
      }
      const rows=await env.DB.prepare(`SELECT r.id,r.name,r.description,r.permissions_json,uar.scope_json FROM user_app_roles uar
        JOIN roles r ON r.id=uar.role_id WHERE uar.user_id=? AND uar.application_id=? ORDER BY r.name`).bind(user.id,app.id).all();
      return json({user:{id:user.id,email:user.email,display_name:user.display_name},application:{id:app.id,name:app.name},roles:rows.results.map(r=>({...r,permissions:JSON.parse(r.permissions_json||'[]'),scope:JSON.parse(r.scope_json||'{}')})),authorized:superadmin||rows.results.length>0});
    }

    if (method==='GET' && ['/beleidskompas','/beleidskompas/','/beleidskompas.html'].includes(path)) {
      const app=await env.DB.prepare("SELECT id FROM applications WHERE id='beleidskompas' AND status='active'").first();
      if (!app) return new Response('Beleidskompas is nog niet geconfigureerd.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
      const grant=await env.DB.prepare("SELECT 1 AS ok FROM user_app_roles WHERE user_id=? AND application_id='beleidskompas' LIMIT 1").bind(user.id).first();
      if (!superadmin && !grant) return new Response('Je hebt geen toegang tot Beleidskompas. Vraag de SAPOOV-beheerder om de rol Beleidskompas-lezer toe te kennen.',{status:403,headers:{'content-type':'text/plain; charset=utf-8'}});
      return env.ASSETS.fetch(new Request(new URL('/beleidskompas.html',url),{method:'GET',headers:request.headers}));
    }

    if (path.startsWith('/api/admin/')) {
      if (!superadmin) return json({error:'Alleen de centrale superadministrator mag gebruikers en rechten beheren.'},403);
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
      if (method==='GET' && path==='/api/admin/organizations') {
        const [organizations,locations,campuses,sources,locationSources]=await Promise.all([
          env.DB.prepare('SELECT * FROM organizations ORDER BY sort_order,display_name').all(),
          env.DB.prepare('SELECT * FROM organization_locations ORDER BY organization_id,sort_order,display_name').all(),
          env.DB.prepare('SELECT * FROM campuses ORDER BY organization_id,sort_order,display_name').all(),
          env.DB.prepare('SELECT * FROM organization_sources ORDER BY checked_at DESC').all(),
          env.DB.prepare('SELECT * FROM organization_location_sources ORDER BY checked_at DESC').all()
        ]);
        return json({organizations:organizations.results,locations:locations.results,campuses:campuses.results,sources:sources.results,locationSources:locationSources.results});
      }
      if (method==='POST' && path==='/api/admin/organizations') {
        const b=await bodyJson(request);
        const organizationId=id(), slugValue=slug(b?.slug||b?.displayName);
        const types=['umbrella','school_board','institution'];
        if (!b || !slugValue || !String(b.officialName||'').trim() || !String(b.displayName||'').trim()) return json({error:'Officiële naam en publieksnaam zijn verplicht.'},400);
        const organizationType=types.includes(b.organizationType)?b.organizationType:'institution';
        const institutionNumber=String(b.institutionNumber||'').trim();
        if (institutionNumber && !/^\d{4,8}$/.test(institutionNumber)) return json({error:'Controleer het instellingsnummer. Gebruik uitsluitend de officiële cijfers.'},400);
        let parent=null;
        if (b.parentOrganizationId) {
          parent=await env.DB.prepare('SELECT id,organization_type FROM organizations WHERE id=?').bind(b.parentOrganizationId).first();
          if (!parent) return json({error:'Bovenliggende organisatie niet gevonden.'},404);
        }
        if ((organizationType==='umbrella'&&parent)||(organizationType==='school_board'&&parent?.organization_type!=='umbrella')||(organizationType==='institution'&&parent?.organization_type!=='school_board')) return json({error:'De organisatiestructuur moet koepel → schoolbestuur → onderwijsinstelling volgen.'},400);
        try {
          await env.DB.prepare(`INSERT INTO organizations(
            id,slug,official_name,display_name,institution_number,enterprise_number,education_type,
            education_network,parent_organization_id,general_email,general_phone,website_url,
            logo_source_url,official_source_url,status,sort_order,organization_type,abbreviation,
            postal_street,postal_house_number,postal_bus,postal_code,postal_municipality,postal_country_code
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?)`).bind(
            organizationId,slugValue,String(b.officialName).trim(),String(b.displayName).trim(),
            institutionNumber||null,String(b.enterpriseNumber||'').trim(),String(b.educationType||''),
            String(b.educationNetwork||'Provinciaal Onderwijs Oost-Vlaanderen'),b.parentOrganizationId||null,
            String(b.email||'').trim(),String(b.phone||'').trim(),String(b.website||'').trim(),
            String(b.logoSourceUrl||'').trim(),String(b.sourceUrl||'').trim(),'draft',
            Number.isInteger(b.sortOrder)?b.sortOrder:100,organizationType,String(b.abbreviation||'').trim(),
            String(b.postalStreet||'').trim(),String(b.postalHouseNumber||'').trim(),String(b.postalBus||'').trim(),
            String(b.postalCode||'').trim(),String(b.postalMunicipality||'').trim(),String(b.postalCountryCode||'BE')
          ).run();
        } catch { return json({error:'Organisatie bestaat al of de bovenliggende organisatie is ongeldig.'},409); }
        await audit(env.DB,user,'organization.create','organization',organizationId,{slug:slugValue,displayName:b.displayName,organizationType});
        return json({ok:true,id:organizationId,status:'draft'},201);
      }
      if (method==='PATCH' && path==='/api/admin/organizations') {
        const b=await bodyJson(request);
        if (!b?.id) return json({error:'Organisatie-ID ontbreekt.'},400);
        const allowed=['officialName','displayName','institutionNumber','enterpriseNumber','educationType','educationNetwork','parentOrganizationId','email','phone','website','logoObjectKey','logoSourceUrl','logoAlt','logoLicenseNote','sourceUrl','status','sortOrder','organizationType','abbreviation','postalStreet','postalHouseNumber','postalBus','postalCode','postalMunicipality','postalCountryCode'];
        const columns={officialName:'official_name',displayName:'display_name',institutionNumber:'institution_number',enterpriseNumber:'enterprise_number',educationType:'education_type',educationNetwork:'education_network',parentOrganizationId:'parent_organization_id',email:'general_email',phone:'general_phone',website:'website_url',logoObjectKey:'logo_object_key',logoSourceUrl:'logo_source_url',logoAlt:'logo_alt',logoLicenseNote:'logo_license_note',sourceUrl:'official_source_url',status:'status',sortOrder:'sort_order',organizationType:'organization_type',abbreviation:'abbreviation',postalStreet:'postal_street',postalHouseNumber:'postal_house_number',postalBus:'postal_bus',postalCode:'postal_code',postalMunicipality:'postal_municipality',postalCountryCode:'postal_country_code'};
        const sets=[],values=[];
        for (const key of allowed) if (Object.prototype.hasOwnProperty.call(b,key)) { sets.push(columns[key]+'=?'); values.push(b[key]===null?'':b[key]); }
        if (!sets.length) return json({error:'Geen wijzigbare velden ontvangen.'},400);
        if (b.status && !['draft','active','inactive','archived'].includes(b.status)) return json({error:'Ongeldige organisatiestatus.'},400);
        if (b.organizationType && !['umbrella','school_board','institution'].includes(b.organizationType)) return json({error:'Ongeldig organisatietype.'},400);
        if (b.institutionNumber && !/^\d{4,8}$/.test(String(b.institutionNumber))) return json({error:'Ongeldig instellingsnummer.'},400);
        const currentOrg=await env.DB.prepare('SELECT id,organization_type,parent_organization_id FROM organizations WHERE id=?').bind(b.id).first();
        if (!currentOrg) return json({error:'Organisatie niet gevonden.'},404);
        const nextType=b.organizationType||currentOrg.organization_type;
        const nextParent=Object.prototype.hasOwnProperty.call(b,'parentOrganizationId')?b.parentOrganizationId:currentOrg.parent_organization_id;
        let parent=null;
        if (nextParent) {
          if (nextParent===b.id) return json({error:'Een organisatie kan niet haar eigen bovenliggende organisatie zijn.'},409);
          parent=await env.DB.prepare('SELECT id,organization_type FROM organizations WHERE id=?').bind(nextParent).first();
          if (!parent) return json({error:'Bovenliggende organisatie niet gevonden.'},404);
          const cycle=await env.DB.prepare(`WITH RECURSIVE descendants(id) AS (
            SELECT id FROM organizations WHERE parent_organization_id=?
            UNION ALL SELECT o.id FROM organizations o JOIN descendants d ON o.parent_organization_id=d.id
          ) SELECT 1 AS found FROM descendants WHERE id=? LIMIT 1`).bind(b.id,nextParent).first();
          if (cycle) return json({error:'Deze wijziging zou een cirkel in de organisatiestructuur veroorzaken.'},409);
        }
        if ((nextType==='umbrella'&&nextParent)||(nextType==='school_board'&&parent?.organization_type!=='umbrella')||(nextType==='institution'&&parent?.organization_type!=='school_board')) return json({error:'De organisatiestructuur moet koepel → schoolbestuur → onderwijsinstelling volgen.'},400);
        sets.push('updated_at=CURRENT_TIMESTAMP'); values.push(b.id);
        try {
          const result=await env.DB.prepare('UPDATE organizations SET '+sets.join(',')+' WHERE id=?').bind(...values).run();
          if (!result.meta.changes) return json({error:'Organisatie niet gevonden.'},404);
        } catch { return json({error:'Wijziging conflicteert met bestaande gegevens of een ongeldige bovenliggende organisatie.'},409); }
        await audit(env.DB,user,'organization.update','organization',b.id,{fields:allowed.filter(k=>Object.prototype.hasOwnProperty.call(b,k))});
        return json({ok:true});
      }
      if (method==='POST' && path==='/api/admin/locations') {
        const b=await bodyJson(request), locationId=id();
        const stableKey=String(b?.stableKey||'').trim();
        if (!b?.organizationId || !stableKey || !String(b.officialName||'').trim() || !String(b.displayName||'').trim()) return json({error:'Organisatie, stabiele sleutel, officiële naam en locatienaam zijn verplicht.'},400);
        const organization=await env.DB.prepare("SELECT id FROM organizations WHERE id=? AND organization_type='institution'").bind(b.organizationId).first();
        if (!organization) return json({error:'Onderwijsinstelling niet gevonden.'},404);
        const types=['school_site','adult_education_campus','lesson_place','administrative_office','other'];
        const locationType=types.includes(b.locationType)?b.locationType:'school_site';
        try {
          await env.DB.prepare(`INSERT INTO organization_locations(
            id,organization_id,stable_key,code,official_name,display_name,location_type,street,house_number,bus,
            postal_code,municipality,country_code,general_email,general_phone,website_url,logo_source_url,
            official_source_url,is_main_location,status,sort_order
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, 'draft', ?)`).bind(
            locationId,b.organizationId,stableKey,String(b.code||''),String(b.officialName).trim(),String(b.displayName).trim(),
            locationType,String(b.street||''),String(b.houseNumber||''),String(b.bus||''),String(b.postalCode||''),
            String(b.municipality||''),String(b.countryCode||'BE'),String(b.email||''),String(b.phone||''),
            String(b.website||''),String(b.logoSourceUrl||''),String(b.sourceUrl||''),b.isMainLocation?1:0,
            Number.isInteger(b.sortOrder)?b.sortOrder:100
          ).run();
        } catch { return json({error:'Locatie bestaat al of bevat ongeldige gegevens.'},409); }
        await audit(env.DB,user,'organization.location.create','organization_location',locationId,{organizationId:b.organizationId,stableKey,displayName:b.displayName});
        return json({ok:true,id:locationId,status:'draft'},201);
      }
      if (method==='PATCH' && path==='/api/admin/locations') {
        const b=await bodyJson(request);
        if (!b?.id) return json({error:'Locatie-ID ontbreekt.'},400);
        const columns={code:'code',officialName:'official_name',displayName:'display_name',locationType:'location_type',street:'street',houseNumber:'house_number',bus:'bus',postalCode:'postal_code',municipality:'municipality',countryCode:'country_code',email:'general_email',phone:'general_phone',website:'website_url',logoObjectKey:'logo_object_key',logoSourceUrl:'logo_source_url',sourceUrl:'official_source_url',isMainLocation:'is_main_location',status:'status',sortOrder:'sort_order'};
        const sets=[],values=[];
        for (const [key,column] of Object.entries(columns)) if (Object.prototype.hasOwnProperty.call(b,key)) { sets.push(column+'=?'); values.push(key==='isMainLocation'?(b[key]?1:0):b[key]); }
        if (b.status && !['draft','active','inactive','archived'].includes(b.status)) return json({error:'Ongeldige locatiestatus.'},400);
        if (b.locationType && !['school_site','adult_education_campus','lesson_place','administrative_office','other'].includes(b.locationType)) return json({error:'Ongeldig locatietype.'},400);
        if (!sets.length) return json({error:'Geen wijzigbare velden ontvangen.'},400);
        sets.push('updated_at=CURRENT_TIMESTAMP'); values.push(b.id);
        const result=await env.DB.prepare('UPDATE organization_locations SET '+sets.join(',')+' WHERE id=?').bind(...values).run();
        if (!result.meta.changes) return json({error:'Locatie niet gevonden.'},404);
        await audit(env.DB,user,'organization.location.update','organization_location',b.id,{fields:Object.keys(columns).filter(k=>Object.prototype.hasOwnProperty.call(b,k))});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/teams') {
        const [teams,memberships]=await Promise.all([
          env.DB.prepare('SELECT t.*,o.display_name AS institution_name FROM teams t JOIN organizations o ON o.id=t.institution_id ORDER BY o.sort_order,t.sort_order,t.name').all(),
          env.DB.prepare('SELECT tm.*,u.email,u.display_name FROM team_memberships tm JOIN users u ON u.id=tm.user_id ORDER BY tm.team_id,u.email').all()
        ]);
        return json({teams:teams.results,memberships:memberships.results});
      }
      if (method==='POST' && path==='/api/admin/teams') {
        const b=await bodyJson(request), teamId=id();
        const stableKey=String(b?.stableKey||'').trim();
        if (!b?.institutionId || !stableKey || !String(b.name||'').trim()) return json({error:'School, stabiele sleutel en teamnaam zijn verplicht.'},400);
        const institution=await env.DB.prepare("SELECT id FROM organizations WHERE id=? AND organization_type='institution'").bind(b.institutionId).first();
        if (!institution) return json({error:'Onderwijsinstelling niet gevonden.'},404);
        try {
          await env.DB.prepare('INSERT INTO teams(id,institution_id,stable_key,code,name,description,sort_order) VALUES(?,?,?,?,?,?,?)')
            .bind(teamId,b.institutionId,stableKey,String(b.code||''),String(b.name).trim(),String(b.description||''),Number.isInteger(b.sortOrder)?b.sortOrder:100).run();
        } catch { return json({error:'Team bestaat al binnen de organisatie.'},409); }
        await audit(env.DB,user,'team.create','team',teamId,{institutionId:b.institutionId,name:b.name});
        return json({ok:true,id:teamId},201);
      }
      if (method==='PATCH' && path==='/api/admin/teams') {
        const b=await bodyJson(request);
        if (!b?.id) return json({error:'Team-ID ontbreekt.'},400);
        const columns={code:'code',name:'name',description:'description',status:'status',sortOrder:'sort_order'};
        const sets=[],values=[];
        for (const [key,column] of Object.entries(columns)) if (Object.prototype.hasOwnProperty.call(b,key)) { sets.push(column+'=?'); values.push(b[key]); }
        if (b.status && !['draft','active','inactive','archived'].includes(b.status)) return json({error:'Ongeldige teamstatus.'},400);
        if (!sets.length) return json({error:'Geen wijzigbare velden ontvangen.'},400);
        sets.push('updated_at=CURRENT_TIMESTAMP'); values.push(b.id);
        const result=await env.DB.prepare('UPDATE teams SET '+sets.join(',')+' WHERE id=?').bind(...values).run();
        if (!result.meta.changes) return json({error:'Team niet gevonden.'},404);
        await audit(env.DB,user,'team.update','team',b.id,{fields:Object.keys(columns).filter(k=>Object.prototype.hasOwnProperty.call(b,k))});
        return json({ok:true});
      }
      if (method==='PUT' && path==='/api/admin/team-memberships') {
        const b=await bodyJson(request);
        const allowed=['active_member','passive_member','team_leader'];
        if (!b?.teamId || !b?.userId || !allowed.includes(b.membershipType)) return json({error:'Team, gebruiker en geldige teamstatus zijn verplicht.'},400);
        const [team,target]=await Promise.all([
          env.DB.prepare('SELECT id FROM teams WHERE id=?').bind(b.teamId).first(),
          env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first()
        ]);
        if (!team || !target) return json({error:'Team of personeelslid niet gevonden.'},404);
        const membershipId=id();
        await env.DB.prepare(`INSERT INTO team_memberships(id,team_id,user_id,membership_type,valid_from,valid_until,status,assigned_by)
          VALUES(?,?,?,?,?,?, 'active',?)
          ON CONFLICT(team_id,user_id) DO UPDATE SET membership_type=excluded.membership_type,
          valid_from=excluded.valid_from,valid_until=excluded.valid_until,status='active',
          assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).bind(
          membershipId,b.teamId,b.userId,b.membershipType,b.validFrom||null,b.validUntil||null,user.email
        ).run();
        await audit(env.DB,user,'team.membership.set','team_membership',b.teamId,{userId:b.userId,membershipType:b.membershipType});
        return json({ok:true});
      }
      if (method==='DELETE' && path==='/api/admin/team-memberships') {
        const teamId=url.searchParams.get('teamId'),userId=url.searchParams.get('userId');
        if (!teamId || !userId) return json({error:'Team en gebruiker zijn verplicht.'},400);
        await env.DB.prepare('DELETE FROM team_memberships WHERE team_id=? AND user_id=?').bind(teamId,userId).run();
        await audit(env.DB,user,'team.membership.remove','team_membership',teamId,{userId});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/module-access') {
        const result=await env.DB.prepare('SELECT * FROM user_module_access ORDER BY organization_id,application_id,user_id').all();
        return json({access:result.results});
      }
      if (method==='PUT' && path==='/api/admin/module-access') {
        const b=await bodyJson(request);
        if (!b?.userId || !b?.applicationId || !b?.organizationId || typeof b.enabled!=='boolean') return json({error:'Gebruiker, module, organisatie en toegangsschakelaar zijn verplicht.'},400);
        const [target,app,organization]=await Promise.all([
          env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first(),
          env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first(),
          env.DB.prepare('SELECT id FROM organizations WHERE id=?').bind(b.organizationId).first()
        ]);
        if (!target || !app || !organization) return json({error:'Gebruiker, module of organisatie niet gevonden.'},404);
        await env.DB.prepare(`INSERT INTO user_module_access(id,user_id,application_id,organization_id,enabled,assigned_by)
          VALUES(?,?,?,?,?,?)
          ON CONFLICT(user_id,application_id,organization_id) DO UPDATE SET enabled=excluded.enabled,
          assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).bind(id(),b.userId,b.applicationId,b.organizationId,b.enabled?1:0,user.email).run();
        await audit(env.DB,user,'module.access.set','user_module_access',b.userId,{applicationId:b.applicationId,organizationId:b.organizationId,enabled:b.enabled});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/scoped-role-assignments') {
        const result=await env.DB.prepare(`SELECT a.*,u.email,u.display_name,r.name AS role_name,r.application_id,
          app.name AS application_name,o.display_name AS organization_name
          FROM user_scoped_role_assignments a
          JOIN users u ON u.id=a.user_id
          JOIN roles r ON r.id=a.role_id
          JOIN applications app ON app.id=a.application_id
          JOIN organizations o ON o.id=a.organization_id
          ORDER BY o.sort_order,app.sort_order,r.name,u.email`).all();
        return json({assignments:result.results});
      }
      if (method==='PUT' && path==='/api/admin/scoped-role-assignments') {
        const b=await bodyJson(request);
        if (!b?.userId || !b?.applicationId || !b?.roleId || !b?.organizationId) return json({error:'Gebruiker, module, rechtenprofiel en school zijn verplicht.'},400);
        if (b.includeDescendants!==undefined && typeof b.includeDescendants!=='boolean') return json({error:'Descendant-toegang moet expliciet aan of uit staan.'},400);
        const [target,app,role,organization]=await Promise.all([
          env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.userId).first(),
          env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(b.applicationId).first(),
          env.DB.prepare('SELECT id,application_id FROM roles WHERE id=?').bind(b.roleId).first(),
          env.DB.prepare("SELECT id FROM organizations WHERE id=? AND organization_type='institution'").bind(b.organizationId).first()
        ]);
        if (!target || !app || !role || role.application_id!==b.applicationId || !organization) return json({error:'Gebruiker, module, rol of school niet gevonden of niet onderling gekoppeld.'},404);
        const from=b.validFrom||null,until=b.validUntil||null;
        if(from&&until&&until<from)return json({error:'De einddatum mag niet vóór de begindatum liggen.'},400);
        await env.DB.prepare(`INSERT INTO user_scoped_role_assignments(
          id,user_id,application_id,role_id,organization_id,include_descendants,valid_from,valid_until,status,assigned_by
        ) VALUES(?,?,?,?,?,?,?,?, 'active',?)
        ON CONFLICT(user_id,application_id,role_id,organization_id) DO UPDATE SET
          include_descendants=excluded.include_descendants,valid_from=excluded.valid_from,
          valid_until=excluded.valid_until,status='active',assigned_by=excluded.assigned_by,
          updated_at=CURRENT_TIMESTAMP`).bind(
          id(),b.userId,b.applicationId,b.roleId,b.organizationId,b.includeDescendants?1:0,from,until,user.email
        ).run();
        await audit(env.DB,user,'scoped.role.grant','user_scoped_role_assignment',b.userId,{applicationId:b.applicationId,roleId:b.roleId,organizationId:b.organizationId,includeDescendants:Boolean(b.includeDescendants)});
        return json({ok:true});
      }
      if (method==='DELETE' && path==='/api/admin/scoped-role-assignments') {
        const userId=url.searchParams.get('userId'),applicationId=url.searchParams.get('applicationId'),roleId=url.searchParams.get('roleId'),organizationId=url.searchParams.get('organizationId');
        if (![userId,applicationId,roleId,organizationId].every(Boolean)) return json({error:'Gebruiker, module, rechtenprofiel en school zijn verplicht.'},400);
        await env.DB.prepare(`UPDATE user_scoped_role_assignments SET status='revoked',updated_at=CURRENT_TIMESTAMP
          WHERE user_id=? AND application_id=? AND role_id=? AND organization_id=?`).bind(userId,applicationId,roleId,organizationId).run();
        await audit(env.DB,user,'scoped.role.revoke','user_scoped_role_assignment',userId,{applicationId,roleId,organizationId});
        return json({ok:true});
      }
      if (method==='POST' && path==='/api/admin/organization-sources') {
        const b=await bodyJson(request);
        if (!b?.fieldName || !b?.sourceName || !b?.sourceUrl || (!!b.organizationId===!!b.campusId)) return json({error:'Veld, bron, bron-URL en precies één organisatie of campus zijn verplicht.'},400);
        const sourceId=id();
        try {
          await env.DB.prepare('INSERT INTO organization_sources(id,organization_id,campus_id,field_name,source_name,source_url,source_record_id,notes) VALUES(?,?,?,?,?,?,?,?)').bind(sourceId,b.organizationId||null,b.campusId||null,String(b.fieldName),String(b.sourceName),String(b.sourceUrl),String(b.sourceRecordId||''),String(b.notes||'')).run();
        } catch { return json({error:'Bronregistratie kon niet worden opgeslagen.'},409); }
        await audit(env.DB,user,'organization.source.add','organization_source',sourceId,{fieldName:b.fieldName,sourceName:b.sourceName});
        return json({ok:true,id:sourceId},201);
      }
      if (method==='GET' && path==='/api/admin/education') {
        const [classes,campuses,schoolYears]=await Promise.all([
          env.DB.prepare(`SELECT c.id,c.school_year_id,c.campus_id,cp.display_name AS campus_name,c.class_code,c.display_name,c.active,c.source_file,c.imported_at
            FROM classes c JOIN campuses cp ON cp.id=c.campus_id
            ORDER BY cp.display_name,c.class_code`).all(),
          env.DB.prepare('SELECT id,slug AS code,display_name AS name,status FROM campuses ORDER BY display_name').all(),
          env.DB.prepare('SELECT id,label,start_date,end_date,status FROM school_years ORDER BY start_date DESC').all()
        ]);
        return json({classes:classes.results||[],campuses:(campuses.results||[]).map(c=>({...c,active:c.status==='active'})),school_years:schoolYears.results||[]});
      }
      if (method==='GET' && path==='/api/admin/personnel') {
        const result=await env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name,u.status AS account_status,
          p.staff_number,p.campus_id,cp.display_name AS campus_name,
          COALESCE(p.employment_status,'unknown') AS employment_status,p.start_date,p.end_date,p.source,p.notes
          FROM users u LEFT JOIN personnel_profiles p ON p.user_id=u.id
          LEFT JOIN campuses cp ON cp.id=p.campus_id
          ORDER BY u.display_name,u.email`).all();
        return json({personnel:result.results||[],count:(result.results||[]).length,
          profiles:(result.results||[]).filter(x=>x.employment_status!=='unknown'||x.staff_number||x.campus_id).length});
      }
      if (method==='POST' && path==='/api/admin/personnel') {
        const b=await bodyJson(request), userId=String(b?.userId||'').trim();
        const campusId=b?.campusId?String(b.campusId):null, status=String(b?.employmentStatus||'unknown');
        if(!userId||!['active','inactive','leave','unknown'].includes(status)) return json({error:'Gebruiker en geldige personeelsstatus zijn verplicht.'},400);
        const target=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first();
        if(!target) return json({error:'Gebruiker niet gevonden.'},404);
        if(campusId&&!await env.DB.prepare('SELECT id FROM campuses WHERE id=?').bind(campusId).first()) return json({error:'Campus niet gevonden.'},404);
        const startDate=b.startDate||null,endDate=b.endDate||null;
        if(startDate&&endDate&&endDate<startDate) return json({error:'De einddatum mag niet vóór de startdatum liggen.'},400);
        await env.DB.prepare(`INSERT INTO personnel_profiles(user_id,staff_number,campus_id,employment_status,start_date,end_date,source,notes)
          VALUES(?,?,?,?,?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET staff_number=excluded.staff_number,campus_id=excluded.campus_id,
          employment_status=excluded.employment_status,start_date=excluded.start_date,end_date=excluded.end_date,
          source=excluded.source,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`).bind(
          userId,String(b.staffNumber||''),campusId,status,startDate,endDate,'manual',''
        ).run();
        await audit(env.DB,user,'personnel.profile.save','personnel',userId,{campusId,status});
        return json({ok:true});
      }
      if (method==='GET' && path==='/api/admin/students') {
        const [students,schoolYears,classes]=await Promise.all([
          env.DB.prepare(`SELECT s.id,s.student_number,s.first_name,s.last_name,s.preferred_name,s.status,
            e.school_year_id,e.class_id,c.class_code,cp.display_name AS campus_name
            FROM students s LEFT JOIN student_enrolments e ON e.student_id=s.id AND e.status='active'
            LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN campuses cp ON cp.id=c.campus_id
            ORDER BY s.last_name,s.first_name`).all(),
          env.DB.prepare('SELECT id,label,start_date,end_date,status FROM school_years ORDER BY start_date DESC').all(),
          env.DB.prepare(`SELECT c.id,c.school_year_id,c.campus_id,c.class_code,c.display_name,cp.display_name AS campus_name
            FROM classes c JOIN campuses cp ON cp.id=c.campus_id WHERE c.active=1
            ORDER BY c.school_year_id,cp.display_name,c.class_code`).all()
        ]);
        return json({count:(students.results||[]).length,students:students.results||[],
          school_years:schoolYears.results||[],classes:classes.results||[]});
      }
      if (method==='POST' && path==='/api/admin/students') {
        const b=await bodyJson(request),studentNumber=String(b?.studentNumber||'').trim();
        const firstName=String(b?.firstName||'').trim(),lastName=String(b?.lastName||'').trim();
        if(!studentNumber||!firstName||!lastName) return json({error:'Leerlingnummer, voornaam en familienaam zijn verplicht.'},400);
        const studentId=id();
        try {
          await env.DB.prepare('INSERT INTO students(id,student_number,first_name,last_name,preferred_name,status,source) VALUES(?,?,?,?,?,?,?)')
            .bind(studentId,studentNumber,firstName,lastName,String(b.preferredName||'').trim(),'active','manual').run();
        } catch { return json({error:'Dit leerlingnummer bestaat al of de leerlinggegevens zijn ongeldig.'},409); }
        await audit(env.DB,user,'student.create','student',studentId,{studentNumber});
        return json({ok:true,id:studentId},201);
      }
      if (method==='POST' && path==='/api/admin/student-enrolments') {
        const b=await bodyJson(request);
        if(!b?.studentId||!b?.schoolYearId||!b?.classId) return json({error:'Leerling, schooljaar en klas zijn verplicht.'},400);
        const [student,schoolYear,classRow]=await Promise.all([
          env.DB.prepare('SELECT id FROM students WHERE id=?').bind(b.studentId).first(),
          env.DB.prepare('SELECT id FROM school_years WHERE id=?').bind(b.schoolYearId).first(),
          env.DB.prepare('SELECT id,school_year_id FROM classes WHERE id=? AND active=1').bind(b.classId).first()
        ]);
        if(!student||!schoolYear||!classRow||classRow.school_year_id!==b.schoolYearId) return json({error:'Leerling, schooljaar of klas niet gevonden of niet onderling gekoppeld.'},404);
        await env.DB.prepare(`INSERT INTO student_enrolments(id,student_id,school_year_id,class_id,start_date,status)
          VALUES(?,?,?,?,?,'active')
          ON CONFLICT(student_id,school_year_id) DO UPDATE SET class_id=excluded.class_id,
          start_date=excluded.start_date,end_date=NULL,status='active',updated_at=CURRENT_TIMESTAMP`)
          .bind(id(),b.studentId,b.schoolYearId,b.classId,b.startDate||null).run();
        await audit(env.DB,user,'student.enrolment.save','student_enrolment',b.studentId,{schoolYearId:b.schoolYearId,classId:b.classId});
        return json({ok:true});
      }
      return json({error:'Beheereindpunt niet gevonden.'},404);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({error:'Niet gevonden.'},404);
  }
};
