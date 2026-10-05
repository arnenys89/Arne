export function microsoftAuthUrl() {
  const tenant = process.env.M365_TENANT_ID || 'common';
  const p = new URLSearchParams({ client_id: process.env.M365_CLIENT_ID, response_type: 'code', redirect_uri: process.env.M365_REDIRECT_URI, response_mode: 'query', scope: 'offline_access Calendars.ReadWrite User.Read' });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${p}`;
}

export async function exchangeMicrosoftCode(code) {
  const tenant = process.env.M365_TENANT_ID || 'common';
  const body = new URLSearchParams({ client_id: process.env.M365_CLIENT_ID, client_secret: process.env.M365_CLIENT_SECRET, code, redirect_uri: process.env.M365_REDIRECT_URI, grant_type: 'authorization_code', scope: 'offline_access Calendars.ReadWrite User.Read' });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
  const d = await r.json(); if (!r.ok) throw new Error(d.error_description || 'Microsoft OAuth mislukt'); return d;
}

async function token() {
  const tenant = process.env.M365_TENANT_ID || 'common';
  const body = new URLSearchParams({ client_id: process.env.M365_CLIENT_ID, client_secret: process.env.M365_CLIENT_SECRET, refresh_token: process.env.M365_REFRESH_TOKEN, grant_type: 'refresh_token', scope: 'offline_access Calendars.ReadWrite User.Read' });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  const d = await r.json(); if (!r.ok) throw new Error(d.error_description || 'Microsoft token refresh mislukt'); return d.access_token;
}

async function graph(url, options={}) {
  const accessToken = await token();
  const r = await fetch(`https://graph.microsoft.com/v1.0${url}`, { ...options, headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',...(options.headers||{})} });
  if (r.status === 204) return null;
  const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || `Graph HTTP ${r.status}`); return d;
}

export async function listMicrosoftEvents() {
  const start = new Date(Date.now() - Number(process.env.SYNC_LOOKBACK_DAYS || 365) * 86400000).toISOString();
  const end = new Date(Date.now() + Number(process.env.SYNC_LOOKAHEAD_DAYS || 730) * 86400000).toISOString();
  const base = process.env.M365_CALENDAR_ID ? `/me/calendars/${encodeURIComponent(process.env.M365_CALENDAR_ID)}` : '/me/calendar';
  const out=[]; let url=`${base}/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=1000`;
  while (url) { const d=await graph(url); out.push(...(d.value||[])); url=d['@odata.nextLink'] ? d['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0','') : null; }
  return out.map(e=>({id:e.id,event:{uid:e.iCalUId||e.id,title:e.subject||'',description:e.bodyPreview||'',location:e.location?.displayName||'',start:e.start?.dateTime,end:e.end?.dateTime,allDay:Boolean(e.isAllDay),status:e.isCancelled?'cancelled':'confirmed',updated:e.lastModifiedDateTime||null}}));
}

function payload(e) { return { subject:e.title, body:{contentType:'text',content:e.description}, location:{displayName:e.location}, start:{dateTime:e.start.replace('Z',''),timeZone:'UTC'}, end:{dateTime:e.end.replace('Z',''),timeZone:'UTC'}, isAllDay:e.allDay }; }
export async function createMicrosoftEvent(e) { const base=process.env.M365_CALENDAR_ID?`/me/calendars/${encodeURIComponent(process.env.M365_CALENDAR_ID)}`:'/me/calendar'; const d=await graph(`${base}/events`,{method:'POST',body:JSON.stringify(payload(e))}); return d.id; }
export async function updateMicrosoftEvent(id,e) { await graph(`/me/events/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload(e))}); }
export async function deleteMicrosoftEvent(id) { try{await graph(`/me/events/${encodeURIComponent(id)}`,{method:'DELETE'});}catch(e){if(!e.message.includes('404'))throw e;} }
