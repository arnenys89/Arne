import { createRemoteJWKSet, jwtVerify } from 'jose';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const id = () => crypto.randomUUID();

async function authenticate(request, env) {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (!header || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;
  try {
    const issuer = `https://${env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\\/\\//, '').replace(/\\/$/, '')}`;
    const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(header, jwks, { issuer, audience: env.CF_ACCESS_AUD });
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email || payload.type !== 'app') return null;
    return { email, name: String(payload.name || email) };
  } catch {
    return null;
  }
}

async function currentUser(db, identity) {
  let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(identity.email).first();
  if (!user) {
    const userId = id();
    await db.prepare('INSERT INTO users(id,email,display_name,status) VALUES(?,?,?,?)')
      .bind(userId, identity.email, identity.name, 'active').run();
    user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  } else if (identity.name && user.display_name !== identity.name) {
    await db.prepare('UPDATE users SET display_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(identity.name, user.id).run();
    user.display_name = identity.name;
  }
  return user;
}

async function isSuperadmin(email, env) {
  return (env.SUPERADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(email);
}

async function audit(db, actor, action, targetType, targetId, details = {}) {
  await db.prepare('INSERT INTO audit_events(id,actor_email,action,target_type,target_id,details_json) VALUES(?,?,?,?,?,?)')
    .bind(id(), actor.email, action, targetType, targetId || null, JSON.stringify(details)).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, service: 'sapoov-dashboard' });

    const identity = await authenticate(request, env);
    if (!identity) return json({ error: 'Aanmelden via de beveiligde schoolomgeving is vereist.' }, 401);
    if (!env.DB) return json({ error: 'D1-database is niet gekoppeld.' }, 503);

    const user = await currentUser(env.DB, identity);
    if (user.status !== 'active') return json({ error: 'Je account is niet actief.' }, 403);
    const superadmin = await isSuperadmin(identity.email, env);

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const assignments = await env.DB.prepare(`
        SELECT a.id, a.name, a.description, a.url, a.icon, a.category, a.status, r.id AS role_id, r.name AS role
        FROM user_app_roles uar
        JOIN applications a ON a.id = uar.application_id
        JOIN roles r ON r.id = uar.role_id
        WHERE uar.user_id = ? AND a.status != 'hidden'
        ORDER BY a.sort_order, a.name
      `).bind(user.id).all();
      const apps = superadmin
        ? await env.DB.prepare("SELECT * FROM applications WHERE status != 'hidden' ORDER BY sort_order,name").all()
        : { results: assignments.results.filter(a => a.status !== 'maintenance') };
      return json({ user: { id: user.id, email: user.email, display_name: user.display_name }, superadmin, applications: apps.results, assignments: assignments.results });
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/users') {
      if (!superadmin) return json({ error: 'Onvoldoende rechten.' }, 403);
      const result = await env.DB.prepare(`
        SELECT u.id,u.email,u.display_name,u.status,u.created_at,
          COUNT(DISTINCT uar.application_id) AS application_count
        FROM users u LEFT JOIN user_app_roles uar ON uar.user_id=u.id
        GROUP BY u.id ORDER BY u.email
      `).all();
      return json({ users: result.results });
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/applications') {
      if (!superadmin) return json({ error: 'Onvoldoende rechten.' }, 403);
      const [apps, roles] = await Promise.all([
        env.DB.prepare('SELECT * FROM applications ORDER BY sort_order,name').all(),
        env.DB.prepare('SELECT * FROM roles ORDER BY name').all()
      ]);
      return json({ applications: apps.results, roles: roles.results });
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/assignments') {
      if (!superadmin) return json({ error: 'Onvoldoende rechten.' }, 403);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Ongeldige JSON.' }, 400); }
      const { userId, applicationId, roleId } = body || {};
      if (![userId, applicationId, roleId].every(v => typeof v === 'string' && v.length > 0)) return json({ error: 'userId, applicationId en roleId zijn verplicht.' }, 400);
      const [targetUser, app, role] = await Promise.all([
        env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(),
        env.DB.prepare('SELECT id FROM applications WHERE id=?').bind(applicationId).first(),
        env.DB.prepare('SELECT id FROM roles WHERE id=?').bind(roleId).first()
      ]);
      if (!targetUser || !app || !role) return json({ error: 'Gebruiker, applicatie of rol niet gevonden.' }, 404);
      await env.DB.prepare('INSERT OR IGNORE INTO user_app_roles(user_id,application_id,role_id,assigned_by) VALUES(?,?,?,?)')
        .bind(userId, applicationId, roleId, user.email).run();
      await audit(env.DB, user, 'assignment.grant', 'user_app_role', userId, { applicationId, roleId });
      return json({ ok: true });
    }

    if (request.method === 'DELETE' && url.pathname === '/api/admin/assignments') {
      if (!superadmin) return json({ error: 'Onvoldoende rechten.' }, 403);
      const userId = url.searchParams.get('userId');
      const applicationId = url.searchParams.get('applicationId');
      const roleId = url.searchParams.get('roleId');
      if (![userId, applicationId, roleId].every(Boolean)) return json({ error: 'userId, applicationId en roleId zijn verplicht.' }, 400);
      await env.DB.prepare('DELETE FROM user_app_roles WHERE user_id=? AND application_id=? AND role_id=?')
        .bind(userId, applicationId, roleId).run();
      await audit(env.DB, user, 'assignment.revoke', 'user_app_role', userId, { applicationId, roleId });
      return json({ ok: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/audit') {
      if (!superadmin) return json({ error: 'Onvoldoende rechten.' }, 403);
      const result = await env.DB.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 200').all();
      return json({ events: result.results });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);\n    return json({ error: 'Niet gevonden.' }, 404);
  }
};
