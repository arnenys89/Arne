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
  const grant=await env.DB.prepare("SELECT 1 AS ok FROM user_app_roles uar JOIN roles r ON r.id=uar.role_id WHERE uar.user_id=? AND uar.application_id='beleidskompas' LIMIT 1").bind(user.id).first();
  if(!grant)return json({error:"Je hebt geen toegang tot Beleidskompas. Vraag de SAPOOV-beheerder om de rol Lezer of Beheerder toe te kennen."},403);
 }
 return context.next();
}
