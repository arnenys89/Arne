import { fingerprint, normalizeEvent, sameEvent } from './normalize.js';
import { listGoogleEvents, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from './providers/google.js';
import { listMicrosoftEvents, createMicrosoftEvent, updateMicrosoftEvent, deleteMicrosoftEvent } from './providers/microsoft.js';
import { listIcsEvents } from './providers/ics.js';
import { loadState, saveState } from './store.js';

const cfg = { google: process.env.WRITE_GOOGLE !== 'false', microsoft: process.env.WRITE_MICROSOFT !== 'false' };
const enabled = p => p !== 'ics' || (process.env.ICS_ENABLED !== 'false' && process.env.ICS_URL);
const key = uid => uid.replace(/[^a-zA-Z0-9:_-]/g, '_');

export async function syncOnce() {
  const file = process.env.STATE_FILE || './data/calendar-sync-state.json';
  const state = await loadState(file);
  const raw = { google: enabled('google') ? await listGoogleEvents() : [], microsoft: enabled('microsoft') ? await listMicrosoftEvents() : [], ics: enabled('ics') ? await listIcsEvents() : [] };
  const all=[];
  for(const p of Object.keys(raw)) for(const x of raw[p]) all.push(normalizeEvent(p,x.id,x.event));

  const groups = new Map();
  for(const e of all) { const k=e.uid || fingerprint(e); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(e); }

  let created=0,updated=0,deleted=0,skipped=0;
  for(const [uid,members] of groups){
    const active = members.filter(e=>e.status!=='cancelled');
    if(!active.length) continue;
    const winner = [...active].sort((a,b)=>({google:3,microsoft:2,ics:1}[a.provider]||0)-({google:3,microsoft:2,ics:1}[b.provider]||0)).at(-1);
    const rec = state.events[key(uid)] ||= {};
    for(const target of ['google','microsoft']){
      if(target===winner.provider || !cfg[target] || !enabled(target)) continue;
      let existing = members.find(e=>e.provider===target);
      if(!existing) existing = active.find(e=>fingerprint(e)===fingerprint(winner) && e.provider===target);
      try{
        if(!existing){ rec[target] = target==='google' ? await createGoogleEvent(winner) : await createMicrosoftEvent(winner); created++; }
        else if(!sameEvent(existing,winner)) { if(target==='google') await updateGoogleEvent(existing.id,winner); else await updateMicrosoftEvent(existing.id,winner); updated++; }
        else skipped++;
      }catch(e){ console.error(`${winner.provider} -> ${target}:`,e.message); }
    }
    for(const e of members) rec[e.provider]=e.id;
  }

  for(const p of ['google','microsoft']) for(const e of all.filter(x=>x.provider===p && x.status==='cancelled')){
    const rec=Object.values(state.events).find(x=>x[p]===e.id); if(!rec) continue;
    for(const target of ['google','microsoft']) if(target!==p && cfg[target] && rec[target]) { try{ if(target==='google') await deleteGoogleEvent(rec[target]); else await deleteMicrosoftEvent(rec[target]); deleted++; }catch(err){console.error(err.message);} }
  }
  state.updatedAt=new Date().toISOString(); await saveState(file,state); return {updatedAt:state.updatedAt,created,updated,deleted,skipped,tracked:Object.keys(state.events).length};
}
