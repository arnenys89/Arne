const DASHBOARD_AUDIENCE = "054dbe1a5080009991cecfb82474037a7efb146c6815ade0ccc5c8919183ee98";
const json = (data,status=200) => Response.json(data,{status,headers:{"cache-control":"no-store"}});
const decode64url = value => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")),c=>c.charCodeAt(0));

async function authenticate(request,env) {
 const token=request.headers.get("cf-access-jwt-assertion");
 if(!token||!env.CF_ACCESS_TEAM_DOMAIN)return null;
 try {
  const parts=token.split(".");
  if(parts.length!==3)return null;
  const header=JSON.parse(new TextDecoder().decode(decode64url(parts[0])));
  const payload=JSON.parse(new TextDecoder().decode(decode64url(parts[1])));
  if(header.alg!=="RS256"||!header.kid)return null;
  const team=env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
  const issuer="https://"+team;
  const audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  const now=Math.floor(Date.now()/1000);
  if(payload.iss!==issuer||!audiences.includes(DASHBOARD_AUDIENCE)||!payload.sub||!payload.exp||payload.exp<now-60||(payload.nbf&&payload.nbf>now+60))return null;
  if(!globalThis.__sapoovJwks||Date.now()-globalThis.__sapoovJwksAt>3600000){
   const response=await fetch(issuer+"/cdn-cgi/access/certs",{cf:{cacheTtl:3600,cacheEverything:true}});
   if(!response.ok)return null;
   globalThis.__sapoovJwks=await response.json();globalThis.__sapoovJwksAt=Date.now();
  }
  const jwk=(globalThis.__sapoovJwks.keys||[]).find(k=>k.kid===header.kid);
  if(!jwk)return null;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1])))return null;
  const email=String(payload.email||"").trim().toLowerCase();
  return email?{email}:null;
 } catch{return null;}
}

export async function onRequest(context) {
 const {request,env}=context;
 const url=new URL(request.url);
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405});
 if(url.pathname!=="/beleidskompas"&&url.pathname!=="/beleidskompas/")return context.next();
 const identity=await authenticate(request,env);
 if(!identity)return json({error:"Meld je aan via SAPOOV om Beleidskompas te openen."},401);
 if(!env.DB)return json({error:"De centrale SAPOOV-database is niet beschikbaar."},503);
 const superadmins=(env.SUPERADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 const isSuperadmin=superadmins.includes(identity.email);
 const user=await env.DB.prepare("SELECT id,status FROM users WHERE email=?").bind(identity.email).first();
 if(!user||user.status!=="active")return json({error:"Je SAPOOV-account is niet actief."},403);
 if(!isSuperadmin){
  const [access,roleRows,units]=await Promise.all([
   env.DB.prepare("SELECT organization_unit_id,enabled FROM user_application_access_scopes WHERE user_id=? AND application_id='beleidskompas'").bind(user.id).all(),
   env.DB.prepare("SELECT organization_unit_id,enabled FROM user_application_role_scopes WHERE user_id=? AND application_id='beleidskompas'").bind(user.id).all(),
   env.DB.prepare("SELECT id,name,unit_type FROM organization_units WHERE active=1").all()
  ]);
  const available=access.results.filter(x=>Number(x.enabled)===1).map(x=>x.organization_unit_id);
  let unitId=url.searchParams.get("organizationUnitId")||"";
  if(!unitId&&available.length===1)unitId=available[0];
  if(!unitId)return json({error:available.length?"Kies eerst een organisatiecontext voor Beleidskompas.":"Je hebt geen expliciete toegang tot Beleidskompas.",requiresOrganizationContext:available.length>1,organizationUnits:units.results.filter(x=>available.includes(x.id))},available.length?409:403);
  const hasAccess=access.results.some(x=>x.organization_unit_id===unitId&&Number(x.enabled)===1);
  const hasRole=roleRows.results.some(x=>x.organization_unit_id===unitId&&Number(x.enabled)===1);
  if(!hasAccess||!hasRole)return json({error:"Je hebt geen expliciete toegang en rechtenprofiel voor Beleidskompas binnen deze organisatiecontext."},403);
 }
 if(!env.ASSETS||typeof env.ASSETS.fetch!=="function")return json({error:"De statische SAPOOV-bestanden zijn niet beschikbaar.",diagnostic:"ASSETS binding ontbreekt"},503);
 const assetUrl=new URL('/beleidskompas/',request.url);
 let assetResponse;
 try { assetResponse=await env.ASSETS.fetch(new Request(assetUrl,request)); }
 catch(error) { return json({error:"Beleidskompas kon niet geladen worden.",diagnostic:String(error)},502); }
 if(!assetResponse.ok)return json({error:"Beleidskompas-bestand niet gevonden.",status:assetResponse.status,asset:assetUrl.pathname},assetResponse.status);
 const assetHtml=await assetResponse.clone().text();
 if(!assetHtml.includes('<title>Beleidskompas | SAPOOV</title>'))return json({error:"Cloudflare gaf niet het Beleidskompas-bestand terug.",diagnostic:"De asset-resolver viel terug op een andere HTML-pagina.",asset:assetUrl.pathname},502);
 const headers=new Headers(assetResponse.headers);
 headers.set("x-sapoov-route","beleidskompas");
 headers.set("cache-control","no-store");
 return new Response(assetResponse.body,{status:assetResponse.status,statusText:assetResponse.statusText,headers});
}
