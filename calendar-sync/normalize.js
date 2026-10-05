import crypto from 'node:crypto';

export function fingerprint(e) {
  const value = [e.title || '', e.start || '', e.end || '', e.location || '', e.description || ''].join('|');
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizeEvent(provider, id, e) {
  return {
    provider,
    id: String(id),
    uid: String(e.uid || id),
    title: String(e.title || ''),
    description: String(e.description || ''),
    location: String(e.location || ''),
    start: new Date(e.start).toISOString(),
    end: new Date(e.end).toISOString(),
    allDay: Boolean(e.allDay),
    status: e.status || 'confirmed',
    updated: e.updated ? new Date(e.updated).toISOString() : null
  };
}

export function sameEvent(a, b) {
  return a.title === b.title && a.description === b.description && a.location === b.location && a.start === b.start && a.end === b.end && a.allDay === b.allDay && a.status === b.status;
}
