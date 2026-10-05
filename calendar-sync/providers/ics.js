import ical from 'node-ical';

export async function listIcsEvents() {
  if (!process.env.ICS_URL || process.env.ICS_ENABLED === 'false') return [];
  const data = await ical.async.fromURL(process.env.ICS_URL);
  return Object.entries(data).filter(([,v]) => v?.type === 'VEVENT').map(([id,v]) => ({ id, event: { uid:v.uid||id, title:v.summary||'', description:v.description||'', location:v.location||'', start:v.start, end:v.end||new Date(v.start.getTime()+3600000), allDay:v.datetype==='date', status:v.status==='CANCELLED'?'cancelled':'confirmed', updated:v.lastmodified||null } }));
}
