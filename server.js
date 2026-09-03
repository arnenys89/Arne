import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import OpenAI from 'openai';
import PDFDocument from 'pdfkit';

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const TENANT = process.env.M365_TENANT_ID || 'common';
const CLIENT_ID = process.env.M365_CLIENT_ID || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}
async function authenticate(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Aanmelden vereist.' });
    const token = h.slice(7);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      audience: process.env.M365_API_AUDIENCE || CLIENT_ID
    });
    const email = String(payload.preferred_username || payload.email || '').toLowerCase();
    if (!email) return res.status(401).json({ error: 'Geen schoolaccount gevonden.' });
    req.user = { email, name: payload.name || email };
    next();
  } catch (e) { res.status(401).json({ error: 'Ongeldige of verlopen Microsoft 365-sessie.' }); }
}
async function isAdmin(email) { return !!ADMIN_EMAIL && email === ADMIN_EMAIL; }

app.get('/api/config', (_req, res) => res.json({ clientId: CLIENT_ID, tenantId: TENANT, apiScope: process.env.M365_API_SCOPE || '' }));
app.get('/api/templates', authenticate, async (_req, res) => res.json(await readJson(TEMPLATES_FILE, [])));
app.get('/api/me', authenticate, async (req, res) => {
  const users = await readJson(USERS_FILE, {});
  const u = users[req.user.email] || { allocated: 0, used: 0, active: true };
  res.json({ ...req.user, allocated: u.allocated, used: u.used, remaining: Math.max(0, u.allocated - u.used), admin: await isAdmin(req.user.email), active: u.active !== false });
});

app.post('/api/generate', authenticate, async (req, res) => {
  const { templateId, input, format = 'text' } = req.body || {};
  const templates = await readJson(TEMPLATES_FILE, []);
  const template = templates.find(t => t.id === templateId);
  if (!template) return res.status(400).json({ error: 'Onbekend sjabloon.' });
  const users = await readJson(USERS_FILE, {});
  const user = users[req.user.email] || { allocated: 0, used: 0, active: true };
  const remaining = Math.max(0, user.allocated - user.used);
  if (user.active === false) return res.status(403).json({ error: 'Je account is gedeactiveerd.' });
  if (remaining < 1) return res.status(402).json({ error: 'Je tokenbudget is opgebruikt. Neem contact op met de beheerder.' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'De OpenAI API is nog niet geconfigureerd op de server.' });

  const prompt = `${template.prompt}\n\nCONTEXT VAN DE LEERKRACHT:\n${String(input || '').slice(0, 30000)}\n\nMaak alleen de gevraagde onderwijscontent. Gebruik geen persoonsgegevens die niet nodig zijn. Schrijf in correct Nederlands (Vlaanderen).`;
  try {
    const response = await openai.responses.create({ model: MODEL, input: prompt, max_output_tokens: 5000 });
    const text = response.output_text || '';
    const used = response.usage?.total_tokens || Math.max(1, Math.ceil((prompt.length + text.length) / 4));
    user.used += used;
    users[req.user.email] = user;
    await writeJson(USERS_FILE, users);
    if (format === 'pdf') {
      const pdf = await makePdf(text, template.title);
      return res.json({ text, tokens: used, remaining: Math.max(0, user.allocated - user.used), pdf: pdf.toString('base64'), filename: `${template.id}.pdf` });
    }
    res.json({ text, tokens: used, remaining: Math.max(0, user.allocated - user.used) });
  } catch (e) { res.status(500).json({ error: e?.message || 'Genereren mislukt.' }); }
});

function makePdf(text, title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 }); const chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.fontSize(20).text(title); doc.moveDown(); doc.fontSize(10).fillColor('#333').text(`Gegenereerd via School AI`); doc.moveDown(); doc.fillColor('#111').fontSize(11).text(text, { lineGap: 3 }); doc.end();
  });
}

app.get('/api/admin/users', authenticate, async (req, res) => {
  if (!(await isAdmin(req.user.email))) return res.status(403).json({ error: 'Beheerdersrechten vereist.' });
  res.json(await readJson(USERS_FILE, {}));
});
app.put('/api/admin/users/:email', authenticate, async (req, res) => {
  if (!(await isAdmin(req.user.email))) return res.status(403).json({ error: 'Beheerdersrechten vereist.' });
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const users = await readJson(USERS_FILE, {});
  const old = users[email] || { allocated: 0, used: 0, active: true };
  users[email] = { allocated: Math.max(0, Number(req.body.allocated ?? old.allocated)), used: old.used, active: req.body.active !== false };
  await writeJson(USERS_FILE, users); res.json(users[email]);
});
app.put('/api/admin/templates/:id', authenticate, async (req, res) => {
  if (!(await isAdmin(req.user.email))) return res.status(403).json({ error: 'Beheerdersrechten vereist.' });
  const templates = await readJson(TEMPLATES_FILE, []); const i = templates.findIndex(t => t.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Sjabloon niet gevonden.' });
  templates[i] = { ...templates[i], title: String(req.body.title || templates[i].title), description: String(req.body.description || ''), prompt: String(req.body.prompt || templates[i].prompt) };
  await writeJson(TEMPLATES_FILE, templates); res.json(templates[i]);
});

app.get('*', (_req, res) => res.sendFile(path.join(process.cwd(), 'public', 'index.html')));
app.listen(PORT, () => console.log(`School AI draait op http://localhost:${PORT}`));
