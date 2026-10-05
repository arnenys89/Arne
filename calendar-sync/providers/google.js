import { google } from 'googleapis';

function oauth() {
  const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  if (process.env.GOOGLE_REFRESH_TOKEN) o.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return o;
}

export function googleAuthUrl() {
  const o = oauth();
  return o.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/calendar.events'] });
}

export async function exchangeGoogleCode(code) {
  const o = oauth();
  const { tokens } = await o.getToken(code);
  return tokens;
}

export async function listGoogleEvents() {
  const cal = google.calendar({ version: 'v3', auth: oauth() });
  const min = new Date(Date.now() - Number(process.env.SYNC_LOOKBACK_DAYS || 365) * 86400000).toISOString();
  const max = new Date(Date.now() + Number(process.env.SYNC_LOOKAHEAD_DAYS || 730) * 86400000).toISOString();
  const out = [];
  let pageToken;
  do {
    const r = await cal.events.list({ calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary', timeMin: min, timeMax: max, singleEvents: true, showDeleted: true, maxResults: 2500, pageToken });
    out.push(...(r.data.items || []));
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return out.map(e => ({ id: e.id, event: { uid: e.iCalUID || e.id, title: e.summary || '', description: e.description || '', location: e.location || '', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, allDay: !e.start?.dateTime, status: e.status === 'cancelled' ? 'cancelled' : 'confirmed', updated: e.updated || null } }));
}

function body(e) {
  return { summary: e.title, description: e.description, location: e.location, start: e.allDay ? { date: e.start.slice(0,10) } : { dateTime: e.start }, end: e.allDay ? { date: e.end.slice(0,10) } : { dateTime: e.end }, extendedProperties: { private: { calendarSync: 'true', syncUid: e.uid } } };
}

export async function createGoogleEvent(e) { const c = google.calendar({ version: 'v3', auth: oauth() }); const r = await c.events.insert({ calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary', requestBody: body(e) }); return r.data.id; }
export async function updateGoogleEvent(id, e) { const c = google.calendar({ version: 'v3', auth: oauth() }); await c.events.update({ calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary', eventId: id, requestBody: body(e) }); }
export async function deleteGoogleEvent(id) { const c = google.calendar({ version: 'v3', auth: oauth() }); try { await c.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary', eventId: id }); } catch (e) { if (![404,410].includes(e.code)) throw e; } }
