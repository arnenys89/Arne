import { handleWorkplace } from "../../../src/workplace.js";

const DASHBOARD_AUDIENCE = "054dbe1a5080009991cecfb82474037a7efb146c6815ade0ccc5c8919183ee98";
const json = (data,status=200) => Response.json(data,{status,headers:{"cache-control":"no-store"}});
const decode64url = value => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")),c=>c.charCodeAt(0));

async function authenticate(request,env) {
 const token=request.headers.get("cf-access-jwt-assertion");
 if(!token||!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD)return null;
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
   globalThis.__sapoovJwks=await response.json();
   globalThis.__sapoovJwksAt=Date.now();
  }
  const jwk=(globalThis.__sapoovJwks.keys||[]).find(k=>k.kid===header.kid);
  if(!jwk)return null;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  if(!valid)return null;
  const email=String(payload.email||"").trim().toLowerCase();
  if(!email)return null;
  return {email,name:String(payload.name||email),audiences};
 } catch { return null; }
}

async function currentUser(db,identity) {
 let user=await db.prepare("SELECT * FROM users WHERE email=?").bind(identity.email).first();
 if(!user){
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO users(id,email,display_name,status) VALUES(?,?,?,?)").bind(id,identity.email,identity.name,"active").run();
  user=await db.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
 } else if(identity.name&&user.display_name!==identity.name) {
  await db.prepare("UPDATE users SET display_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(identity.name,user.id).run();
  user.display_name=identity.name;
 }
 return user;
}

export async function onRequest(context) {
 const {request,env}=context;
 if(request.method==="OPTIONS")return new Response(null,{status:204});
 const identity=await authenticate(request,env);
 if(!identity)return json({error:"Aanmelden via de SAPOOV-dashboardomgeving is vereist."},401);
 if(!env.DB)return json({error:"De centrale SAPOOV-database is niet beschikbaar."},503);
 const user=await currentUser(env.DB,identity);
 if(user.status!=="active")return json({error:"Je account is niet actief."},403);
 return handleWorkplace(request,env,identity,user);
}
