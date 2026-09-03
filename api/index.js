import { app } from '@azure/functions';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import OpenAI from 'openai';
import PDFDocument from 'pdfkit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isConsumerTenant, tenantConfig } from './tenant.js';

const CLIENT_ID = process.env.M365_CLIENT_ID || process.env.AZURE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.M365_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '';
const API_AUDIENCE = process.env.M365_API_AUDIENCE || CLIENT_ID;
const API_SCOPE = process.env.M365_API_SCOPE || (CLIENT_ID ? `api://${CLIENT_ID}/access_as_user` : '');
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const DATA_DIR = path.join(process.cwd(), 'data');
const ALLOW_JSON_FALLBACK = String(process.env.ALLOW_JSON_FALLBACK || '').toLowerCase() === 'true';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const jwks = createRemoteJWKSet(new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'));
const graphTokenCache = new Map();

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

function field(item, ...names) {
  const fields = item?.fields || {};
  for (const name of names) {
    if (fields[name] !== undefined && fields[name] !== null) return fields[name];
  }
  return '';
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function issuerForTid(tid) {
  return `https://login.microsoftonline.com/${tid}/v2.0`;
}

async function authenticate(request) {
  if (!API_AUDIENCE) return { error: json({ error: 'Microsoft-aanmelding is nog niet geconfigureerd.' }, 503) };
  const token = bearer(request);
  if (!token) return { error: json({ error: 'Aanmelden vereist.' }, 401) };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const unverified = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const tid = String(unverified.tid || '');
    if (!tid) throw new Error('Missing tid');
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuerForTid(tid),
      audience: API_AUDIENCE
    });
    const email = String(payload.preferred_username || payload.upn || payload.email || '').toLowerCase();
    const name = String(payload.name || email);
    if (!email) throw new Error('Missing account');
    return { user: { email, name, tid } };
  } catch (error) {
    console.error('Auth:', error?.message || error);
    return { error: json({ error: 'Ongeldige of verlopen Microsoft-sessie.' }, 401) };
  }
}

function getTenantContext(tid) {
  const config = tenantConfig(tid);
  if (!config) return null;
  return config;
}

async function graphAppToken(tid) {
  const tenant = getTenantContext(tid);
  if (!tenant || isConsumerTenant(tid)) throw new Error('Persoonlijke Microsoft-accounts hebben geen gekoppelde SharePoint-tenant.');
  const cached = graphTokenCache.get(tenant.tenantId);
  if (cached?.token && Date.now() < cached.expiresAt - 60000) return cached.token;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Microsoft Graph-appconfiguratie ontbreekt.');

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  });
  const response = await fetch(`https://login.microsoftonline.com/${tenant.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || 'Microsoft Graph-token kon niet worden verkregen.');
  const value = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  graphTokenCache.set(tenant.tenantId, value);
  return value.token;
}

async function graph(tid, endpoint, options = {}) {
  const token = await graphAppToken(tid);
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Microsoft Graph gaf HTTP ${response.status}.`);
  return data;
}

async function listRef(tid, configured) {
  const tenant = getTenantContext(tid);
  if (!tenant?.siteId) throw new Error('SHAREPOINT_SITE_ID ontbreekt.');
  if (/^[0-9a-f-]{20,}$/i.test(configured)) return configured;
  return (await graph(tid, `/sites/${tenant.siteId}/lists/${encodeURIComponent(configured)}`)).id;
}

async function listItems(tid, configured) {
  const id = await listRef(tid, configured);
  const data = await graph(tid, `/sites/${getTenantContext(tid).siteId}/lists/${id}/items?expand=fields`);
  return { id, items: data.value || [] };
}

async function createListItem(tid, configured, fields) {
  const tenant = getTenantContext(tid);
  const id = await listRef(tid, configured);
  return graph(tid, `/sites/${tenant.siteId}/lists/${id}/items`, {
    method: 'POST',
    body: JSON.stringify({ fields })
  });
}

async function updateListItemFields(tid, configured, itemId, fields) {
  const tenant = getTenantContext(tid);
  const id = await listRef(tid, configured);
  return graph(tid, `/sites/${tenant.siteId}/lists/${id}/items/${itemId}/fields`, {
    method: 'PATCH',
    body: JSON.stringify(fields)
  });
}

async function loadTemplates(tid) {
  const tenant = getTenantContext(tid);
  if (tenant) {
    try {
      const { items } = await listItems(tid, tenant.templatesList);
      const result = items.map(item => ({
        id: String(field(item, 'TemplateId', 'ID', 'Title') || item.id).toLowerCase().replace(/\s+/g, '-'),
        title: String(field(item, 'Title', 'Naam') || 'Sjabloon'),
        description: String(field(item, 'Beschrijving', 'Description') || ''),
        outputs: String(field(item, 'Outputtypes', 'OutputTypes') || '').split(/[,;|]/).map(x => x.trim()).filter(Boolean),
        prompt: String(field(item, 'Systeeminstructie', 'Prompt') || ''),
        active: field(item, 'Actief', 'Active') !== false
      })).filter(item => item.active && item.prompt);
      if (result.length) return result.sort((a, b) => a.title.localeCompare(b.title, 'nl'));
    } catch (error) {
      console.warn('Lists-sjablonen niet beschikbaar:', error.message);
      if (!ALLOW_JSON_FALLBACK) throw error;
    }
  }
  if (!ALLOW_JSON_FALLBACK && !tenant) return [];
  return readJson(path.join(DATA_DIR, 'templates.json'), []);
}

async function findUser(email, tid) {
  const tenant = getTenantContext(tid);
  if (tenant) {
    try {
      const { items } = await listItems(tid, tenant.usersList);
      const item = items.find(x => String(field(x, 'Account', 'Email', 'UPN')).toLowerCase() === email.toLowerCase());
      if (item) return {
        id: item.id,
        email,
        name: String(field(item, 'Title', 'Naam') || email),
        role: String(field(item, 'Rol', 'Role') || 'Leerkracht'),
        allocated: Math.max(0, Number(field(item, 'TokenBudget', 'Allocated', 'Budget') || 0)),
        used: Math.max(0, Number(field(item, 'TokensGebruikt', 'Used', 'Verbruikt') || 0)),
        active: field(item, 'Actief', 'Active') !== false
      };
      return null;
    } catch (error) {
      console.warn('Lists-gebruiker niet beschikbaar:', error.message);
      if (!ALLOW_JSON_FALLBACK) throw error;
    }
  }
  if (!ALLOW_JSON_FALLBACK) return null;
  const users = await readJson(path.join(DATA_DIR, 'users.json'), {});
  const user = users[email];
  return user ? {
    id: email,
    email,
    name: email,
    role: user.admin ? 'Beheerder' : 'Leerkracht',
    allocated: Number(user.allocated || 0),
    used: Number(user.used || 0),
    active: user.active !== false
  } : null;
}

function isAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'beheerder';
}

async function addUsage(email, user, tid, used) {
  const total = Number(user.used || 0) + Number(used || 0);
  const tenant = getTenantContext(tid);
  if (tenant) return updateListItemFields(tid, tenant.usersList, user.id, { TokensGebruikt: total });
  if (!ALLOW_JSON_FALLBACK) return;
  const users = await readJson(path.join(DATA_DIR, 'users.json'), {});
  users[email] = { ...(users[email] || {}), allocated: user.allocated, used: total, active: user.active !== false, admin: isAdmin(user) };
  await fs.writeFile(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2), 'utf8');
}

function makePdf(text, title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 52 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).fillColor('#102a43').text(title);
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#667788').text('OnderwijsAI — gegenereerd concept');
    doc.moveDown(1);
    doc.fontSize(11).fillColor('#17202a').text(text, { lineGap: 3 });
    doc.end();
  });
}

async function requireAdmin(request) {
  const auth = await authenticate(request);
  if (auth.error) return auth;
  const me = await findUser(auth.user.email, auth.user.tid);
  if (!me || !isAdmin(me)) return { error: json({ error: 'Beheerdersrechten vereist.' }, 403) };
  return { user: auth.user, me };
}

async function handle(request) {
  const route = new URL(request.url).pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = request.method.toUpperCase();

  if (route === 'config' && method === 'GET') {
    return json({ clientId: CLIENT_ID, authority: 'https://login.microsoftonline.com/common', apiScope: API_SCOPE, accountTypes: 'common' });
  }

  if (route === 'health' && method === 'GET') {
    return json({ ok: true, accountTypes: 'common', lists: Boolean(process.env.SHAREPOINT_SITE_ID), openai: Boolean(process.env.OPENAI_API_KEY), tenantResolution: 'from-signin-tid', model: MODEL });
  }

  if (route === 'templates' && method === 'GET') {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    try { return json(await loadTemplates(auth.user.tid)); }
    catch (error) { return json({ error: error.message }, 500); }
  }

  if (route === 'me' && method === 'GET') {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    if (isConsumerTenant(auth.user.tid)) return json({ error: 'Dit persoonlijke Microsoft-account is niet gekoppeld aan een schoolomgeving.' }, 403);
    try {
      const user = await findUser(auth.user.email, auth.user.tid);
      if (!user) return json({ error: 'Je Microsoft-account is nog niet toegevoegd aan OnderwijsAI. Vraag de beheerder om toegang.' }, 403);
      if (!user.active) return json({ error: 'Je account is gedeactiveerd.' }, 403);
      return json({ ...user, remaining: Math.max(0, user.allocated - user.used), admin: isAdmin(user), tenantId: auth.user.tid });
    } catch (error) { return json({ error: error.message }, 500); }
  }

  if (route === 'generate' && method === 'POST') {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    if (isConsumerTenant(auth.user.tid)) return json({ error: 'Een persoonlijk Microsoft-account kan aanmelden, maar is niet gekoppeld aan een schoolomgeving.' }, 403);
    try {
      const body = await request.json().catch(() => ({}));
      const { templateId, input, format = 'text' } = body;
      const templates = await loadTemplates(auth.user.tid);
      const template = templates.find(x => x.id === templateId);
      if (!template) return json({ error: 'Onbekend of niet-goedgekeurd sjabloon.' }, 400);
      const user = await findUser(auth.user.email, auth.user.tid);
      if (!user) return json({ error: 'Je Microsoft-account staat niet in de gebruikerslijst.' }, 403);
      if (!user.active) return json({ error: 'Je account is gedeactiveerd.' }, 403);
      const remaining = Math.max(0, user.allocated - user.used);
      if (remaining < 1) return json({ error: 'Je tokenbudget is opgebruikt. Neem contact op met de beheerder.' }, 402);
      if (!openai) return json({ error: 'De OpenAI API is nog niet geconfigureerd op de server.' }, 503);

      const safeInput = String(input || '').slice(0, 30000);
      const prompt = `${template.prompt}\n\nCONTEXT VAN DE GEBRUIKER:\n${safeInput}\n\nMaak alleen de gevraagde onderwijscontent. Schrijf in correct Nederlands (Vlaanderen). Neem geen onnodige persoonsgegevens op. Structureer meerdere outputtypes met duidelijke titels.`;
      const response = await openai.responses.create({
        model: MODEL,
        input: prompt,
        max_output_tokens: Math.min(6000, Math.max(1000, remaining))
      });
      const text = response.output_text || '';
      const used = Number(response.usage?.total_tokens || Math.max(1, Math.ceil((prompt.length + text.length) / 4)));
      await addUsage(auth.user.email, user, auth.user.tid, used);

      const tenant = getTenantContext(auth.user.tid);
      if (tenant) {
        try {
          await createListItem(auth.user.tid, tenant.usageList, {
            Title: `${template.title} — ${auth.user.email} — ${new Date().toISOString()}`,
            Account: auth.user.email,
            Sjabloon: template.title,
            InputTokens: Number(response.usage?.input_tokens || 0),
            OutputTokens: Number(response.usage?.output_tokens || 0),
            TotaalTokens: used,
            Datum: new Date().toISOString()
          });
        } catch (error) {
          console.warn('Gebruik kon niet worden gelogd:', error.message);
        }
      }

      if (format === 'pdf') {
        const pdf = await makePdf(text, template.title);
        return json({ text, tokens: used, remaining: Math.max(0, remaining - used), pdf: pdf.toString('base64'), filename: `${template.id}.pdf` });
      }
      return json({ text, tokens: used, remaining: Math.max(0, remaining - used) });
    } catch (error) {
      console.error('Generate:', error);
      return json({ error: error?.message || 'Genereren mislukt.' }, 500);
    }
  }

  if (route === 'admin/users' && method === 'GET') {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    try {
      const tenant = getTenantContext(auth.user.tid);
      if (tenant) {
        const { items } = await listItems(auth.user.tid, tenant.usersList);
        return json(items.map(item => ({
          id: item.id,
          email: String(field(item, 'Account', 'Email', 'UPN')),
          name: String(field(item, 'Title', 'Naam')),
          role: String(field(item, 'Rol', 'Role') || 'Leerkracht'),
          allocated: Number(field(item, 'TokenBudget', 'Allocated', 'Budget') || 0),
          used: Number(field(item, 'TokensGebruikt', 'Used', 'Verbruikt') || 0),
          active: field(item, 'Actief', 'Active') !== false
        })));
      }
      if (!ALLOW_JSON_FALLBACK) return json([]);
      const users = await readJson(path.join(DATA_DIR, 'users.json'), {});
      return json(Object.entries(users).map(([email, user]) => ({ id: email, email, name: email, role: user.admin ? 'Beheerder' : 'Leerkracht', allocated: Number(user.allocated || 0), used: Number(user.used || 0), active: user.active !== false })));
    } catch (error) { return json({ error: error.message }, 500); }
  }

  if (route.startsWith('admin/users/') && method === 'PUT') {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const email = decodeURIComponent(route.slice('admin/users/'.length)).toLowerCase();
    const body = await request.json().catch(() => ({}));
    const allocated = Math.max(0, Number(body.allocated || 0));
    const active = body.active !== false;
    try {
      const tenant = getTenantContext(auth.user.tid);
      if (tenant) {
        const { items } = await listItems(auth.user.tid, tenant.usersList);
        const item = items.find(x => String(field(x, 'Account', 'Email', 'UPN')).toLowerCase() === email);
        if (item) await updateListItemFields(auth.user.tid, tenant.usersList, item.id, { TokenBudget: allocated, Actief: active });
        else await createListItem(auth.user.tid, tenant.usersList, { Title: email, Account: email, Rol: 'Leerkracht', TokenBudget: allocated, TokensGebruikt: 0, Actief: active });
        return json({ email, allocated, active, tenantId: auth.user.tid });
      }
      if (!ALLOW_JSON_FALLBACK) return json({ error: 'Geen schooltenant beschikbaar.' }, 403);
      const users = await readJson(path.join(DATA_DIR, 'users.json'), {});
      const old = users[email] || { used: 0 };
      users[email] = { ...old, allocated, active };
      await fs.writeFile(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2), 'utf8');
      return json({ email, allocated, used: Number(old.used || 0), active });
    } catch (error) { return json({ error: error.message }, 500); }
  }

  if (route === 'admin/usage' && method === 'GET') {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    try {
      const tenant = getTenantContext(auth.user.tid);
      if (!tenant) return json({ items: [], totalTokens: 0 });
      const { items } = await listItems(auth.user.tid, tenant.usageList);
      const rows = items.map(item => ({
        account: String(field(item, 'Account', 'Email', 'UPN')),
        template: String(field(item, 'Sjabloon', 'Template')),
        tokens: Number(field(item, 'TotaalTokens', 'TotalTokens') || 0),
        date: String(field(item, 'Datum', 'Date') || '')
      }));
      return json({ items: rows, totalTokens: rows.reduce((total, row) => total + row.tokens, 0) });
    } catch (error) { return json({ error: error.message }, 500); }
  }

  if (route === 'admin/setup' && method === 'GET') {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const tenant = getTenantContext(auth.user.tid);
    return json({
      accountTypes: 'common',
      signedInTenant: auth.user.tid,
      consumerAccount: isConsumerTenant(auth.user.tid),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      listsConfigured: Boolean(tenant?.siteId),
      tenantResolution: 'automatic-from-signin',
      listsTenant: tenant?.tenantId || null
    });
  }

  if (route.startsWith('admin/templates/') && method === 'PUT') {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const id = decodeURIComponent(route.slice('admin/templates/'.length));
    const body = await request.json().catch(() => ({}));
    try {
      const tenant = getTenantContext(auth.user.tid);
      if (tenant) {
        const { items } = await listItems(auth.user.tid, tenant.templatesList);
        const item = items.find(x => String(field(x, 'TemplateId', 'ID', 'Title') || x.id).toLowerCase().replace(/\s+/g, '-') === id);
        if (!item) return json({ error: 'Sjabloon niet gevonden.' }, 404);
        await updateListItemFields(auth.user.tid, tenant.templatesList, item.id, { Beschrijving: String(body.description || ''), Systeeminstructie: String(body.prompt || '') });
        const templates = await loadTemplates(auth.user.tid);
        const updated = templates.find(x => x.id === id);
        return json(updated || { id, description: body.description || '', prompt: body.prompt || '' });
      }
      if (!ALLOW_JSON_FALLBACK) return json({ error: 'Geen schooltenant beschikbaar.' }, 403);
      const file = path.join(DATA_DIR, 'templates.json');
      const templates = await readJson(file, []);
      const index = templates.findIndex(x => x.id === id);
      if (index < 0) return json({ error: 'Sjabloon niet gevonden.' }, 404);
      templates[index] = { ...templates[index], description: String(body.description || ''), prompt: String(body.prompt || '') };
      await fs.writeFile(file, JSON.stringify(templates, null, 2), 'utf8');
      return json(templates[index]);
    } catch (error) { return json({ error: error.message }, 500); }
  }

  return json({ error: 'Niet gevonden.' }, 404);
}

app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*route}',
  handler: async request => {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
          'access-control-allow-headers': 'Authorization,Content-Type'
        }
      });
    }
    const response = await handle(request);
    response.headers.set('access-control-allow-origin', '*');
    return response;
  }
});
