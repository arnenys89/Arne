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

function json(res, body, status = 200, headers = {}) {
  res.status(status);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  return res.json(body);
}
function bearer(req) { const value = req.headers.authorization || ''; return value.startsWith('Bearer ') ? value.slice(7) : ''; }
function issuerForTid(tid) { return `https://login.microsoftonline.com/${tid}/v2.0`; }
function field(item, ...names) { const fields = item?.fields || {}; for (const name of names) if (fields[name] !== undefined && fields[name] !== null) return fields[name]; return ''; }
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }

async function authenticate(req) {
  if (!API_AUDIENCE) throw Object.assign(new Error('Microsoft-aanmelding is nog niet geconfigureerd.'), { status: 503 });
  const token = bearer(req); if (!token) throw Object.assign(new Error('Aanmelden vereist.'), { status: 401 });
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const payload0 = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const tid = String(payload0.tid || '');
    if (!tid) throw new Error('Missing tid');
    const { payload } = await jwtVerify(token, jwks, { issuer: issuerForTid(tid), audience: API_AUDIENCE });
    const email = String(payload.preferred_username || payload.upn || payload.email || '').toLowerCase();
    if (!email) throw new Error('Missing account');
    return { email, name: String(payload.name || email), tid };
  } catch (error) {
    console.error('Auth:', error?.message || error);
    throw Object.assign(new Error('Ongeldige of verlopen Microsoft-sessie.'), { status: 401 });
  }
}

function tenantFor(tid) {
  const tenant = tenantConfig(tid);
  if (!tenant || isConsumerTenant(tid)) return null;
  return tenant;
}
async function graphToken(tid) {
  const tenant = tenantFor(tid);
  if (!tenant) throw Object.assign(new Error('Deze Microsoft-account is niet gekoppeld aan een schoolomgeving.'), { status: 403 });
  const cached = graphTokenCache.get(tenant.tenantId);
  if (cached?.token && Date.now() < cached.expiresAt - 60000) return cached.token;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Microsoft Graph-appconfiguratie ontbreekt.');
  const body = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' });
  const response = await fetch(`https://login.microsoftonline.com/${tenant.tenantId}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || 'Microsoft Graph-token kon niet worden verkregen.');
  graphTokenCache.set(tenant.tenantId, { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 });
  return data.access_token;
}
async function graph(tid, endpoint, options = {}) {
  const token = await graphToken(tid);
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Microsoft Graph gaf HTTP ${response.status}.`);
  return data;
}
async function listRef(tid, configured) { const tenant = tenantFor(tid); if (!tenant?.siteId) throw new Error('SharePoint-site is niet geconfigureerd.'); if (/^[0-9a-f-]{20,}$/i.test(configured)) return configured; return (await graph(tid, `/sites/${tenant.siteId}/lists/${encodeURIComponent(configured)}`)).id; }
async function listItems(tid, configured) { const id = await listRef(tid, configured); const data = await graph(tid, `/sites/${tenantFor(tid).siteId}/lists/${id}/items?expand=fields`); return { id, items: data.value || [] }; }
async function createListItem(tid, configured, fields) { const id = await listRef(tid, configured); return graph(tid, `/sites/${tenantFor(tid).siteId}/lists/${id}/items`, { method: 'POST', body: JSON.stringify({ fields }) }); }
async function updateListItemFields(tid, configured, itemId, fields) { const id = await listRef(tid, configured); return graph(tid, `/sites/${tenantFor(tid).siteId}/lists/${id}/items/${itemId}/fields`, { method: 'PATCH', body: JSON.stringify(fields) }); }

async function loadTemplates(tid) {
  const tenant = tenantFor(tid);
  if (tenant) {
    try {
      const { items } = await listItems(tid, tenant.templatesList);
      const result = items.map(item => ({ id: String(field(item, 'TemplateId', 'ID', 'Title') || item.id).toLowerCase().replace(/\s+/g, '-'), title: String(field(item, 'Title', 'Naam') || 'Sjabloon'), description: String(field(item, 'Beschrijving', 'Description') || ''), outputs: String(field(item, 'Outputtypes', 'OutputTypes') || '').split(/[,;|]/).map(x => x.trim()).filter(Boolean), prompt: String(field(item, 'Systeeminstructie', 'Prompt') || ''), active: field(item, 'Actief', 'Active') !== false })).filter(item => item.active && item.prompt);
      if (result.length) return result.sort((a, b) => a.title.localeCompare(b.title, 'nl'));
    } catch (error) {
      if (!ALLOW_JSON_FALLBACK) throw error;
      console.warn('Lists-sjablonen niet beschikbaar:', error.message);
    }
  }
  if (!ALLOW_JSON_FALLBACK) return [];
  return readJson(path.join(DATA_DIR, 'templates.json'), []);
}
async function findUser(email, tid) {
  const tenant = tenantFor(tid);
  if (tenant) {
    try {
      const { items } = await listItems(tid, tenant.usersList);
      const item = items.find(x => String(field(x, 'Account', 'Email', 'UPN')).toLowerCase() === email.toLowerCase());
      if (item) return { id: item.id, email, name: String(field(item, 'Title', 'Naam') || email), role: String(field(item, 'Rol', 'Role') || 'Leerkracht'), allocated: Math.max(0, Number(field(item, 'TokenBudget', 'Allocated', 'Budget') || 0)), used: Math.max(0, Number(field(item, 'TokensGebruikt', 'Used', 'Verbruikt') || 0)), active: field(item, 'Actief', 'Active') !== false };
      return null;
    } catch (error) { if (!ALLOW_JSON_FALLBACK) throw error; }
  }
  if (!ALLOW_JSON_FALLBACK) return null;
  const users = await readJson(path.join(DATA_DIR, 'users.json'), {}); const user = users[email];
  return user ? { id: email, email, name: email, role: user.admin ? 'Beheerder' : 'Leerkracht', allocated: Number(user.allocated || 0), used: Number(user.used || 0), active: user.active !== false } : null;
}
function isAdmin(user) { return String(user?.role || '').toLowerCase() === 'beheerder'; }
async function addUsage(email, user, tid, used) { const total = Number(user.used || 0) + Number(used || 0); const tenant = tenantFor(tid); if (tenant) return updateListItemFields(tid, tenant.usersList, user.id, { TokensGebruikt: total }); if (!ALLOW_JSON_FALLBACK) return; const users = await readJson(path.join(DATA_DIR, 'users.json'), {}); users[email] = { ...(users[email] || {}), allocated: user.allocated, used: total, active: user.active !== false, admin: isAdmin(user) }; await fs.writeFile(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2), 'utf8'); }
function makePdf(text, title) { return new Promise((resolve, reject) => { const doc = new PDFDocument({ margin: 52 }); const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); doc.fontSize(20).fillColor('#102a43').text(title); doc.moveDown(.4); doc.fontSize(9).fillColor('#667788').text('OnderwijsAI — gegenereerd concept'); doc.moveDown(1); doc.fontSize(11).fillColor('#17202a').text(text, { lineGap: 3 }); doc.end(); }); }
async function requireAdmin(req) { const auth = await authenticate(req); const me = await findUser(auth.email, auth.tid); if (!me || !isAdmin(me)) throw Object.assign(new Error('Beheerdersrechten vereist.'), { status: 403 }); return { auth, me }; }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).setHeader('access-control-allow-origin', '*').setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS').setHeader('access-control-allow-headers', 'Authorization,Content-Type').end(); return; }
  const route = String(req.query?.route || '').replace(/^\/+/, '').replace(/\/+$/, '');
  try {
    if (route === 'config' && req.method === 'GET') return json(res, { clientId: CLIENT_ID, authority: 'https://login.microsoftonline.com/common', apiScope: API_SCOPE, accountTypes: 'common' });
    if (route === 'health' && req.method === 'GET') return json(res, { ok: true, accountTypes: 'common', lists: Boolean(process.env.SHAREPOINT_SITE_ID), openai: Boolean(process.env.OPENAI_API_KEY), tenantResolution: 'from-signin-tid', model: MODEL });
    if (route === 'templates' && req.method === 'GET') { const auth = await authenticate(req); return json(res, await loadTemplates(auth.tid)); }
    if (route === 'me' && req.method === 'GET') { const auth = await authenticate(req); if (isConsumerTenant(auth.tid)) return json(res, { error: 'Dit persoonlijke Microsoft-account is niet gekoppeld aan een schoolomgeving.' }, 403); const user = await findUser(auth.email, auth.tid); if (!user) return json(res, { error: 'Je Microsoft-account is nog niet toegevoegd aan OnderwijsAI. Vraag de beheerder om toegang.' }, 403); if (!user.active) return json(res, { error: 'Je account is gedeactiveerd.' }, 403); return json(res, { ...user, remaining: Math.max(0, user.allocated - user.used), admin: isAdmin(user), tenantId: auth.tid }); }
    if (route === 'generate' && req.method === 'POST') {
      const auth = await authenticate(req); if (isConsumerTenant(auth.tid)) return json(res, { error: 'Een persoonlijk Microsoft-account kan aanmelden, maar is niet gekoppeld aan een schoolomgeving.' }, 403);
      const { templateId, input, format = 'text' } = req.body || {}; const templates = await loadTemplates(auth.tid); const template = templates.find(x => x.id === templateId); if (!template) return json(res, { error: 'Onbekend of niet-goedgekeurd sjabloon.' }, 400); const user = await findUser(auth.email, auth.tid); if (!user) return json(res, { error: 'Je Microsoft-account staat niet in de gebruikerslijst.' }, 403); if (!user.active) return json(res, { error: 'Je account is gedeactiveerd.' }, 403); const remaining = Math.max(0, user.allocated - user.used); if (remaining < 1) return json(res, { error: 'Je tokenbudget is opgebruikt. Neem contact op met de beheerder.' }, 402); if (!openai) return json(res, { error: 'De OpenAI API is nog niet geconfigureerd op de server.' }, 503);
      const safeInput = String(input || '').slice(0, 30000); const prompt = `${template.prompt}\n\nCONTEXT VAN DE GEBRUIKER:\n${safeInput}\n\nMaak alleen de gevraagde onderwijscontent. Schrijf in correct Nederlands (Vlaanderen). Neem geen onnodige persoonsgegevens op. Structureer meerdere outputtypes met duidelijke titels.`; const response = await openai.responses.create({ model: MODEL, input: prompt, max_output_tokens: Math.min(6000, Math.max(1000, remaining)) }); const text = response.output_text || ''; const used = Number(response.usage?.total_tokens || Math.max(1, Math.ceil((prompt.length + text.length) / 4))); await addUsage(auth.email, user, auth.tid, used); const tenant = tenantFor(auth.tid); if (tenant) { try { await createListItem(auth.tid, tenant.usageList, { Title: `${template.title} — ${auth.email} — ${new Date().toISOString()}`, Account: auth.email, Sjabloon: template.title, InputTokens: Number(response.usage?.input_tokens || 0), OutputTokens: Number(response.usage?.output_tokens || 0), TotaalTokens: used, Datum: new Date().toISOString() }); } catch (error) { console.warn('Gebruik kon niet worden gelogd:', error.message); } } if (format === 'pdf') { const pdf = await makePdf(text, template.title); return json(res, { text, tokens: used, remaining: Math.max(0, remaining - used), pdf: pdf.toString('base64'), filename: `${template.id}.pdf` }); } return json(res, { text, tokens: used, remaining: Math.max(0, remaining - used) });
    }
    if (route === 'admin/users' && req.method === 'GET') { const { auth } = await requireAdmin(req); const tenant = tenantFor(auth.tid); if (tenant) { const { items } = await listItems(auth.tid, tenant.usersList); return json(res, items.map(item => ({ id: item.id, email: String(field(item, 'Account', 'Email', 'UPN')), name: String(field(item, 'Title', 'Naam')), role: String(field(item, 'Rol', 'Role') || 'Leerkracht'), allocated: Number(field(item, 'TokenBudget', 'Allocated', 'Budget') || 0), used: Number(field(item, 'TokensGebruikt', 'Used', 'Verbruikt') || 0), active: field(item, 'Actief', 'Active') !== false }))); } const users = await readJson(path.join(DATA_DIR, 'users.json'), {}); return json(res, Object.entries(users).map(([email, user]) => ({ id: email, email, name: email, role: user.admin ? 'Beheerder' : 'Leerkracht', allocated: Number(user.allocated || 0), used: Number(user.used || 0), active: user.active !== false })) ); }
    if (route.startsWith('admin/users/') && req.method === 'PUT') { const { auth } = await requireAdmin(req); const email = decodeURIComponent(route.slice('admin/users/'.length)).toLowerCase(); const body = req.body || {}; const allocated = Math.max(0, Number(body.allocated || 0)); const active = body.active !== false; const tenant = tenantFor(auth.tid); if (tenant) { const { items } = await listItems(auth.tid, tenant.usersList); const item = items.find(x => String(field(x, 'Account', 'Email', 'UPN')).toLowerCase() === email); if (item) await updateListItemFields(auth.tid, tenant.usersList, item.id, { TokenBudget: allocated, Actief: active }); else await createListItem(auth.tid, tenant.usersList, { Title: email, Account: email, Rol: 'Leerkracht', TokenBudget: allocated, TokensGebruikt: 0, Actief: active }); return json(res, { email, allocated, active }); } const users = await readJson(path.join(DATA_DIR, 'users.json'), {}); const old = users[email] || { used: 0 }; users[email] = { ...old, allocated, active }; await fs.writeFile(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2), 'utf8'); return json(res, { email, allocated, used: Number(old.used || 0), active }); }
    if (route === 'admin/usage' && req.method === 'GET') { const { auth } = await requireAdmin(req); const tenant = tenantFor(auth.tid); if (!tenant) return json(res, { items: [], totalTokens: 0 }); const { items } = await listItems(auth.tid, tenant.usageList); const rows = items.map(item => ({ account: String(field(item, 'Account', 'Email', 'UPN')), template: String(field(item, 'Sjabloon', 'Template')), tokens: Number(field(item, 'TotaalTokens', 'TotalTokens') || 0), date: String(field(item, 'Datum', 'Date') || '') })); return json(res, { items: rows, totalTokens: rows.reduce((total, row) => total + row.tokens, 0) }); }
    if (route === 'admin/setup' && req.method === 'GET') { const { auth } = await requireAdmin(req); return json(res, { accountTypes: 'common', openaiConfigured: Boolean(process.env.OPENAI_API_KEY), listsConfigured: Boolean(tenantFor(auth.tid)), tenantResolution: 'from-signin-tid' }); }
    if (route.startsWith('admin/templates/') && req.method === 'PUT') { const { auth } = await requireAdmin(req); const id = decodeURIComponent(route.slice('admin/templates/'.length)); const body = req.body || {}; const tenant = tenantFor(auth.tid); if (tenant) { const { items } = await listItems(auth.tid, tenant.templatesList); const item = items.find(x => String(field(x, 'TemplateId', 'ID', 'Title') || x.id).toLowerCase().replace(/\s+/g, '-') === id); if (!item) return json(res, { error: 'Sjabloon niet gevonden.' }, 404); await updateListItemFields(auth.tid, tenant.templatesList, item.id, { Beschrijving: String(body.description || ''), Systeeminstructie: String(body.prompt || '') }); const templates = await loadTemplates(auth.tid); return json(res, templates.find(x => x.id === id) || { id, description: body.description || '', prompt: body.prompt || '' }); } if (!ALLOW_JSON_FALLBACK) return json(res, { error: 'SharePoint is niet geconfigureerd.' }, 503); const file = path.join(DATA_DIR, 'templates.json'); const templates = await readJson(file, []); const index = templates.findIndex(x => x.id === id); if (index < 0) return json(res, { error: 'Sjabloon niet gevonden.' }, 404); templates[index] = { ...templates[index], description: String(body.description || ''), prompt: String(body.prompt || '') }; await fs.writeFile(file, JSON.stringify(templates, null, 2), 'utf8'); return json(res, templates[index]); }
    return json(res, { error: 'Niet gevonden.' }, 404);
  } catch (error) {
    console.error('API:', error);
    return json(res, { error: error?.message || 'Interne serverfout.' }, Number(error?.status || 500));
  }
}
