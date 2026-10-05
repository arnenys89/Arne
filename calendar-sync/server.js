import 'dotenv/config';
import express from 'express';
import { syncOnce } from './engine.js';
import { googleAuthUrl, exchangeGoogleCode } from './providers/google.js';
import { microsoftAuthUrl, exchangeMicrosoftCode } from './providers/microsoft.js';
import { loadState } from './store.js';

const app=express(); const port=Number(process.env.PORT||3100); app.use(express.json());
let running=false,lastResult=null;
app.get('/api/calendar/health',(_req,res)=>res.json({ok:true,running,lastResult,providers:{google:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_REFRESH_TOKEN),microsoft:Boolean(process.env.M365_CLIENT_ID&&process.env.M365_CLIENT_SECRET&&process.env.M365_REFRESH_TOKEN),ics:Boolean(process.env.ICS_URL&&process.env.ICS_ENABLED!=='false')}}));
app.get('/api/calendar/google',(_req,res)=>res.redirect(googleAuthUrl()));
app.get('/api/calendar/google/callback',async(req,res)=>{try{const t=await exchangeGoogleCode(req.query.code);res.type('text/plain').send('Google gekoppeld. Bewaar GOOGLE_REFRESH_TOKEN='+String(t.refresh_token||'(geen refresh token)'));}catch(e){res.status(500).send(e.message);}});
app.get('/api/calendar/microsoft',(_req,res)=>res.redirect(microsoftAuthUrl()));
app.get('/api/calendar/microsoft/callback',async(req,res)=>{try{const t=await exchangeMicrosoftCode(req.query.code);res.type('text/plain').send('Microsoft 365 gekoppeld. Bewaar M365_REFRESH_TOKEN='+String(t.refresh_token||'(geen refresh token)'));}catch(e){res.status(500).send(e.message);}});
app.post('/api/calendar/sync',async(_req,res)=>{if(running)return res.status(409).json({error:'Synchronisatie draait al'});running=true;try{lastResult=await syncOnce();res.json(lastResult);}catch(e){res.status(500).json({error:e.message});}finally{running=false;}});
app.get('/api/calendar/state',async(_req,res)=>{try{const s=await loadState(process.env.STATE_FILE||'./data/calendar-sync-state.json');res.json({updatedAt:s.updatedAt,events:Object.keys(s.events).length});}catch(e){res.status(500).json({error:e.message});}});
const interval=Math.max(1,Number(process.env.SYNC_INTERVAL_MINUTES||5))*60000; setInterval(async()=>{if(running)return;running=true;try{lastResult=await syncOnce();}catch(e){console.error('Automatische sync mislukt:',e.message);}finally{running=false;}},interval);
app.listen(port,()=>console.log(`Agenda Sync luistert op ${port}`));
