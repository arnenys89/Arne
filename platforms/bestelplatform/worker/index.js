const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", ...cors }
});
const esc = s => String(s).replace(/[<>&'"]/g, c => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;"
}[c]));
const val = (x, t) => {
  const m = String(x).match(new RegExp("<(?:[A-Za-z0-9_]+:)?" + t + "[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?" + t + ">", "i"));
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
};
async function kbo(env, body) {
  if (!env.KBO_USERNAME || !env.KBO_PASSWORD || !env.KBO_ENDPOINT) throw Error("KBO niet geconfigureerd");
  const created = new Date().toISOString(), nonce = crypto.getRandomValues(new Uint8Array(16)), enc = new TextEncoder();
  const pass = enc.encode(created + env.KBO_PASSWORD), input = new Uint8Array(nonce.length + pass.length);
  input.set(nonce); input.set(pass, nonce.length);
  const digest = await crypto.subtle.digest("SHA-1", input);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest))), n64 = btoa(String.fromCharCode(...nonce));
  const xml = '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" xmlns:mes="http://economie.fgov.be/kbopub/webservices/v1/messages" xmlns:dat="http://economie.fgov.be/kbopub/webservices/v1/datamodel"><soap:Header><wsse:Security><wsu:Timestamp><wsu:Created>' + created + '</wsu:Created></wsu:Timestamp><wsse:UsernameToken><wsse:Username>' + esc(env.KBO_USERNAME) + '</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">' + b64 + '</wsse:Password><wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' + n64 + '</wsse:Nonce><wsu:Created>' + created + '</wsu:Created></wsse:UsernameToken></wsse:Security><mes:RequestContext><mes:Id>' + crypto.randomUUID() + '</mes:Id><mes:Language>nl</mes:Language></mes:RequestContext></soap:Header><soap:Body>' + body + '</soap:Body></soap:Envelope>';
  const r = await fetch(env.KBO_ENDPOINT, { method: "POST", headers: { "content-type": "text/xml; charset=utf-8" }, body: xml });
  const txt = await r.text();
  if (!r.ok || txt.includes(":Fault")) throw Error(val(txt, "faultstring") || "KBO HTTP " + r.status);
  return txt;
}
function xmlBlocks(xml,tag){const re=new RegExp("<(?:[A-Za-z0-9_]+:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?"+tag+">","gi");return [...String(xml).matchAll(re)].map(m=>m[1])}
function xmlText(xml,tag){return val(xml,tag).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'")}
function parseKboResults(xml){
 const reply=xmlBlocks(xml,"ReplyContext")[0]||"";
 const code=xmlText(xmlBlocks(reply,"ReplyStatus")[0]||"","Code");
 const description=xmlText(xmlBlocks(reply,"ReplyStatus")[0]||"","Description");
 const snapshotDate=xmlText(reply,"SnapshotDate");
 const results=xmlBlocks(xml,"Enterprise").map(block=>{
  const number=xmlText(block,"Number").replace(/\D/g,"").padStart(10,"0");
  const denominations=xmlBlocks(block,"Denomination").map(d=>({name:xmlText(d,"Value"),language:xmlText(d,"Language"),code:xmlText(d,"Code")})).filter(d=>d.name);
  const name=(denominations.find(d=>d.language==="nl"&&d.code==="001")||denominations.find(d=>d.language==="nl")||denominations[0]||{}).name||"";
  const address=xmlBlocks(block,"Address")[0]||"";
  const street=xmlText(xmlBlocks(address,"Street")[0]||"","Value");
  const municipality=xmlText(xmlBlocks(address,"Municipality")[0]||"","Value");
  const statusBlock=xmlBlocks(block,"JuridicalSituation")[0]||"";
  const status=xmlBlocks(statusBlock,"Status")[0]||"";
  return {enterpriseNumber:number.replace(/\D/g,""),name,statusCode:xmlText(status,"Code"),status:xmlText(status,"Value"),street,houseNumber:xmlText(address,"HouseNumber"),box:xmlText(address,"Box"),zipcode:xmlText(address,"Zipcode"),municipality,country:xmlText(xmlBlocks(address,"Country")[0]||"","Value"),phone:xmlText(address,"TelephoneNumber"),email:xmlText(address,"Email"),website:xmlText(address,"Website"),snapshotDate};
 }).filter(x=>x.enterpriseNumber&&x.name);
 return {results,replyCode:code,replyDescription:description,snapshotDate};
}
function imageCandidates(html) {
  const found = [];
  for (const m of html.matchAll(/imgurl=([^&"\\\s]+)/g)) {
    try {
      const u = decodeURIComponent(m[1].replace(/&amp;/g, "&"));
      if (/^https?:\/\//i.test(u) && !found.includes(u)) found.push(u);
    } catch {}
  }
  return found.slice(0, 8);
}
function b64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
async function importImage(req, env) {
  const user=await authenticate(req,env);requireRole(user,"buyer","admin");
  if ((!env.IMAGES && (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY)) || !env.DB) {
    return json({ error: "Configureer een Cloudflare R2-bucket (IMAGES) of de bestaande GitHub-opslag." }, 503);
  }
  const body = await req.json();
  const kind = body.kind, entityId = String(body.entityId || "").trim(), query = String(body.query || "").trim();
  if(!body.preview&&!body.sourceUrl)return json({error:"Toon eerst de afbeeldingsvoorstellen en bevestig daarna je keuze."},400);
  if(body.sourceUrl&&body.licenseConfirmed!==true)return json({error:"Bevestig eerst dat je de gebruiksrechten van deze afbeelding hebt gecontroleerd."},400);
  if (!["article", "supplier"].includes(kind) || !entityId || !query || query.length > 180) {
    return json({ error: "Geef een geldig type, record-ID en zoekterm op." }, 400);
  }
  let candidates=[];
  if(body.sourceUrl){candidates=[String(body.sourceUrl)];}
  else{const searchUrl = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(query);const search = await fetch(searchUrl, { headers: { "user-agent": "Mozilla/5.0 (compatible; RichtpuntBestelplatform/1.0)" } });if (!search.ok) return json({ error: "Google Afbeeldingen gaf HTTP " + search.status + "." }, 502);candidates=imageCandidates(await search.text());}
  if (!candidates.length) return json({ error: "Geen bruikbare afbeeldingsresultaten gevonden." }, 404);
  if(body.preview===true)return json({candidates:candidates.slice(0,8)});
  let imageResponse = null;
  for (const candidate of candidates) {
    try {
      const u = new URL(candidate);
      const host = u.hostname.toLowerCase();
      if (!["http:","https:"].includes(u.protocol) || host==="localhost" || host==="127.0.0.1" || host==="::1" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) continue;
      const r = await fetch(u.toString(), { headers: { "user-agent": "Mozilla/5.0 (compatible; RichtpuntBestelplatform/1.0)" }, redirect: "follow" });
      const finalUrl = new URL(r.url), finalHost=finalUrl.hostname.toLowerCase();
      if (!["http:","https:"].includes(finalUrl.protocol) || finalHost==="localhost" || finalHost==="127.0.0.1" || finalHost==="::1" || finalHost.startsWith("10.") || finalHost.startsWith("192.168.") || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(finalHost)) continue;
      const type = (r.headers.get("content-type") || "").split(";")[0].toLowerCase();
      const length = Number(r.headers.get("content-length") || 0);
      if (!r.ok || !type.startsWith("image/") || type==="image/svg+xml" || length>4*1024*1024) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (!bytes.length || bytes.length>4*1024*1024) continue;
      imageResponse={bytes,type,sourceUrl:candidate};
      break;
    } catch {}
  }
  if (!imageResponse) return json({ error: "De gevonden afbeeldingen konden niet veilig worden opgehaald." }, 502);
  const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[imageResponse.type];
  if(!ext)return json({error:"Alleen JPEG, PNG, WebP en GIF worden ondersteund."},415);
  const safeId = entityId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!safeId) return json({ error: "Ongeldig record-ID." }, 400);
  const path = "uploads/" + (kind === "article" ? "articles" : "suppliers") + "/" + safeId + "." + ext;
  let imageUrl,storage;
  if(env.IMAGES){
    await env.IMAGES.put(path,imageResponse.bytes,{httpMetadata:{contentType:imageResponse.type,cacheControl:"public, max-age=86400"}});
    imageUrl=(env.APP_ORIGIN||"").replace(/\/$/,"")+"/bestelplatform/api/images/"+path;
    storage="Cloudflare R2";
  }else{
    const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
    if (!owner || !repo) return json({ error: "GITHUB_REPOSITORY moet owner/repository bevatten." }, 503);
    const api = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/public/" + path;
    const existing = await fetch(api, { headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
    let sha;
    if (existing.ok) sha = (await existing.json()).sha;
    else if (existing.status !== 404) return json({ error: "GitHub kon de opslaglocatie niet controleren (HTTP " + existing.status + ")." }, 502);
    const payload = { message: "Store image for " + kind + " " + safeId, content: b64(imageResponse.bytes) };
    if (sha) payload.sha = sha;
    const saved = await fetch(api, {method:"PUT",headers:{authorization:"Bearer "+env.GITHUB_TOKEN,accept:"application/vnd.github+json","content-type":"application/json","x-github-api-version":"2022-11-28"},body:JSON.stringify(payload)});
    if (!saved.ok) return json({ error: "GitHub kon de afbeelding niet bewaren (HTTP " + saved.status + ")." }, 502);
    imageUrl = "https://raw.githubusercontent.com/" + owner + "/" + repo + "/main/public/" + path;
    storage="GitHub repository";
  }
  const table = kind === "article" ? "catalog_items" : "suppliers";
  const result = await env.DB.prepare("UPDATE " + table + " SET image_url = ? WHERE id = ?").bind(imageUrl, entityId).run();
  if (!result.meta || result.meta.changes === 0) return json({ error: "Afbeelding is opgeslagen, maar het record werd niet gevonden." }, 404);
  await env.DB.prepare("INSERT INTO image_assets (entity_type, entity_id, repository_path, image_url, source_url, content_type, license_confirmed) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(entity_type, entity_id) DO UPDATE SET repository_path=excluded.repository_path, image_url=excluded.image_url, source_url=excluded.source_url, content_type=excluded.content_type, license_confirmed=1, updated_at=CURRENT_TIMESTAMP").bind(kind, entityId, path, imageUrl, imageResponse.sourceUrl, imageResponse.type).run();
  return json({ ok: true, imageUrl, path, storage });

}

function b64url(s){return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0))}
function decodePart(s){return JSON.parse(new TextDecoder().decode(b64url(s)))}
async function authenticate(req,env){
 const token=req.headers.get("Cf-Access-Jwt-Assertion");
 if(!token)throw Object.assign(new Error("Geen Cloudflare Access-identiteit gevonden. Meld je aan via de beveiligde website."),{status:401});
 const parts=token.split(".");if(parts.length!==3)throw Object.assign(new Error("Ongeldig Cloudflare Access-token."),{status:401});
 let head,claims;try{head=decodePart(parts[0]);claims=decodePart(parts[1])}catch{throw Object.assign(new Error("Ongeldig Cloudflare Access-token."),{status:401})}
 const team=(env.CF_ACCESS_TEAM_DOMAIN||"").replace(/^https?:\/\//,"").replace(/\/$/,"");
 const expectedAuds=String(env.CF_ACCESS_AUD||"").split(",").map(x=>x.trim()).filter(Boolean);
 if(!team||!expectedAuds.length)throw Object.assign(new Error("Cloudflare Access is nog niet geconfigureerd. Stel CF_ACCESS_TEAM_DOMAIN en CF_ACCESS_AUD in als Worker-variabelen."),{status:503});
 const issuer="https://"+team;
 const now=Math.floor(Date.now()/1000);
 const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
 if(claims.iss!==issuer||!aud.some(a=>expectedAuds.includes(a))||!claims.sub||!claims.exp||claims.exp<now-60||claims.nbf>now+60)
  throw Object.assign(new Error("Cloudflare Access-token is ongeldig, verlopen of voor een andere toepassing bestemd."),{status:401});
 const certs=await fetch(issuer+"/cdn-cgi/access/certs",{cf:{cacheTtl:3600,cacheEverything:true}}).then(r=>{if(!r.ok)throw Error("Cloudflare Access-certificaten niet beschikbaar.");return r.json()});
 const jwk=certs.keys.find(k=>k.kid===head.kid);
 if(!jwk||head.alg!=="RS256")throw Object.assign(new Error("Cloudflare Access-tokenondertekening niet herkend."),{status:401});
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 const ok=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
 if(!ok)throw Object.assign(new Error("Cloudflare Access-tokenhandtekening ongeldig."),{status:401});
 const email=String(claims.email||"").trim().toLowerCase(),name=claims.name||email||"Gebruiker";
 if(!email)throw Object.assign(new Error("Cloudflare Access heeft geen e-mailadres meegestuurd."),{status:403});
 const identity="cloudflare:"+claims.sub;
 const protectedEmail="arne.nys@ptiz.be";
 const staffDomains=new Set(["ptiz.be","richtpuntninovezottegem.be"]);
 const normalizeStaffEmail=value=>{
  const address=String(value||"").trim().toLowerCase();
  const at=address.lastIndexOf("@");
  if(at<1)return null;
  const local=address.slice(0,at),domain=address.slice(at+1);
  if(!staffDomains.has(domain))return null;
  return local.replace(/\./g,"")+"@richtpunt-staff";
 };
 const normalized=normalizeStaffEmail(email);
 // Resolve the protected administrator by verified school email before looking
 // up a previously linked Cloudflare subject. This prevents an older subject
 // mapping from selecting a different staff profile for the superadmin.
 let user=null;
 if(normalized&&normalized===normalizeStaffEmail(protectedEmail)){
  user=await env.DB.prepare("SELECT id,entra_oid,email,display_name,role,campus,active FROM users WHERE lower(email)=lower(?)").bind(protectedEmail).first();
 }
 if(!user)user=await env.DB.prepare("SELECT id,entra_oid,email,display_name,role,campus,active FROM users WHERE entra_oid=?").bind(identity).first();
 if(!user){
  let byEmail=null;
  if(normalized){
   const allUsers=await env.DB.prepare("SELECT id,entra_oid,email,display_name,role,campus,active FROM users").all();
   const matches=(allUsers.results||[]).filter(candidate=>normalizeStaffEmail(candidate.email)===normalized);
   if(matches.length>1)throw Object.assign(new Error("Meerdere bestaande accounts komen overeen met dit schooladres. Laat een beheerder de dubbele profielen eerst controleren; er is niets samengevoegd."),{status:409});
   if(matches.length===1)byEmail=matches[0];
  }else{
   byEmail=await env.DB.prepare("SELECT id,entra_oid,email,display_name,role,campus,active FROM users WHERE lower(email)=lower(?)").bind(email).first();
  }
  if(byEmail){
   // Keep the existing user ID, role, campus, active state and team memberships.
   // A second Cloudflare identity is matched by verified school email, without
   // replacing the first identity key or changing the profile's primary email.
   user=byEmail;
  }else{
   const uid=crypto.randomUUID();
   const isNewSuperadmin=email===protectedEmail;
   await env.DB.prepare("INSERT INTO users (id,entra_oid,email,display_name,role,campus,active) VALUES (?,?,?,?,?,?,1)").bind(uid,identity,email,name,isNewSuperadmin?"admin":"staff",null).run();
   user={id:uid,entra_oid:identity,email,display_name:name,role:isNewSuperadmin?"admin":"staff",campus:null,active:1};
  }
 }
 const isSuperadmin=email===protectedEmail||String(user.email||"").trim().toLowerCase()===protectedEmail;
 if(isSuperadmin){
  // Only the verified Cloudflare Access email can grant this protected superadmin identity.
  // Reassert it on every authenticated request to prevent demotion or deactivation.
  await env.DB.prepare("UPDATE users SET email=CASE WHEN ?=1 THEN ? ELSE email END,display_name=?,role='admin',campus=NULL,active=1 WHERE id=?").bind(email===protectedEmail?1:0,email,name,user.id).run();
  user=await env.DB.prepare("SELECT id,entra_oid,email,display_name,role,campus,active FROM users WHERE id=?").bind(user.id).first();
 }
 // SAPOOV is de centrale bron voor toepassingsrollen en rechten.
 let centralResponse;
 try {
  centralResponse=await fetch("https://sapoov-identity-api.arne-nys.workers.dev/api/access/bestelplatform",{headers:{"Cf-Access-Jwt-Assertion":token}});
 } catch {
  throw Object.assign(new Error("De centrale SAPOOV-rechtenservice is tijdelijk niet bereikbaar."),{status:503});
 }
 if(!centralResponse.ok){
  const failure=await centralResponse.json().catch(()=>({}));
  throw Object.assign(new Error(failure.error||"Je hebt geen centrale toegang tot het Bestelplatform."),{status:centralResponse.status===401?401:403});
 }
 const central=await centralResponse.json();
 if(!central.authorized)throw Object.assign(new Error("Je hebt geen centrale toegang tot het Bestelplatform."),{status:403});
 // SAPOOV is the source of truth for teams and memberships. The local tables
 // are synchronised as a compatibility projection for existing order queries.
 for(const team of central.teams||[]){
  const allowedCampuses=["Ninove","Zottegem","Beide campussen"];
  const campus=allowedCampuses.includes(team.campus)?team.campus:"Beide campussen";
  const customCampus=team.custom_campus||(allowedCampuses.includes(team.campus)?null:(team.campus||null));
  await env.DB.prepare("INSERT INTO teams(id,name,campus,description,active,custom_campus) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,campus=excluded.campus,description=excluded.description,active=excluded.active,custom_campus=excluded.custom_campus,updated_at=CURRENT_TIMESTAMP")
   .bind(team.id,team.name,campus,team.description||"",team.active===0?0:1,customCampus).run();
 }
 await env.DB.prepare("DELETE FROM team_members WHERE user_id=?").bind(user.id).run();
 for(const membership of central.teamMemberships||[]){
  await env.DB.prepare("INSERT INTO team_members(team_id,user_id,member_role) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET member_role=excluded.member_role").bind(membership.team_id,user.id,membership.member_role||"member").run();
 }

 const permissions=[...new Set((central.roles||[]).flatMap(r=>r.permissions||[]))];
 const role=permissions.includes("*")?"admin":permissions.some(p=>["orders.approve","orders.view_all","orders.reject"].includes(p))?"buyer":"staff";
 // Synchroniseer de optionele aankoperscope naar de bestaande tabel zodat de
 // bestaande campus-, team- en categoriecontroles behouden blijven.
 await env.DB.prepare("DELETE FROM buyer_assignments WHERE user_id=?").bind(user.id).run();
 if(role==="buyer"){
  for(const assignment of central.roles||[]){
   if(!(assignment.permissions||[]).some(p=>["orders.approve","orders.view_all","orders.reject"].includes(p)))continue;
   const scope=assignment.scope||{};
   await env.DB.prepare("INSERT INTO buyer_assignments(user_id,campus,category,team_id) VALUES(?,?,?,?)")
    .bind(user.id,scope.campus||null,scope.category||null,scope.team_id||null).run();
  }
 }
 await env.DB.prepare("UPDATE users SET role=?,active=1 WHERE id=?").bind(role,user.id).run();
 return {...user,role,permissions,centralRoles:central.roles||[]};
}
const requireRole=(user,...roles)=>{if(!roles.includes(user.role))throw Object.assign(new Error("Je hebt onvoldoende rechten voor deze actie."),{status:403})};
const bodyJson=async req=>{try{return await req.json()}catch{throw Object.assign(new Error("Ongeldige JSON-inhoud."),{status:400})}};
const clean=(v,max=500)=>String(v??"").trim().slice(0,max);
function validEan13(value){const s=String(value??"").trim();if(!/^\d{13}$/.test(s))return false;let sum=0;for(let i=0;i<12;i++)sum+=Number(s[i])*(i%2===0?1:3);return (10-(sum%10))%10===Number(s[12])}
function validEnterpriseNumber(value){const d=String(value??"").replace(/\D/g,"").padStart(10,"0");if(!/^\d{10}$/.test(d))return false;return 97-(Number(d.slice(0,8))%97)===Number(d.slice(8))}
async function syncOrderStatus(env,orderId){
 const counts=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='geleverd' THEN 1 ELSE 0 END) delivered,SUM(CASE WHEN status='gedeeltelijk_geleverd' THEN 1 ELSE 0 END) partial,SUM(CASE WHEN status='besteld' THEN 1 ELSE 0 END) ordered FROM order_items WHERE order_id=?").bind(orderId).first();
 if(!counts||!counts.total)return;
 const status=counts.delivered===counts.total?"delivered":(counts.delivered>0||counts.partial>0)?"partially_delivered":counts.ordered>0?"ordered":null;
 if(status)await env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,orderId).run();
}
async function configuredCampuses(env){
 const row=await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='campuses'").first();
 try{const value=JSON.parse(row?.setting_value||"[]");if(Array.isArray(value)&&value.length)return [...new Set(value.map(x=>clean(x,40)).filter(Boolean))]}catch{}
 return ["Ninove","Zottegem"];
}
async function isConfiguredCampus(env,value){return value==="Beide campussen"||(await configuredCampuses(env)).includes(String(value||""))}
async function buyerCanAccessOrder(env,userId,order){
 const row=await env.DB.prepare("SELECT 1 FROM buyer_assignments ba WHERE ba.user_id=? AND (ba.campus IS NULL OR ba.campus=? OR ba.campus='Beide campussen') AND (ba.team_id IS NULL OR ba.team_id=?) AND NOT EXISTS (SELECT 1 FROM order_items oi LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE oi.order_id=? AND NOT EXISTS (SELECT 1 FROM buyer_assignments ba2 WHERE ba2.user_id=ba.user_id AND (ba2.campus IS NULL OR ba2.campus=? OR ba2.campus='Beide campussen') AND (ba2.team_id IS NULL OR ba2.team_id=?) AND (ba2.category IS NULL OR ba2.category=ci.category)))").bind(userId,order.campus,order.team_id,order.id,order.campus,order.team_id).first();
 return !!row;
}
async function api(req,env,user,url){
 const path=url.pathname,method=req.method;
 if(path==="/api/me"&&method==="GET")return json({user});
 if(path==="/api/catalog"&&method==="GET"){
  const rows=user.role==="admin"?await env.DB.prepare("SELECT id,name,ean_code,category,description,technical_specs,unit,active,image_url FROM catalog_items ORDER BY category,name").all():user.role==="buyer"?await env.DB.prepare("SELECT ci.id,ci.name,ci.ean_code,ci.category,ci.description,ci.technical_specs,ci.unit,ci.active,ci.image_url FROM catalog_items ci WHERE ci.active=1 AND EXISTS (SELECT 1 FROM buyer_assignments ba WHERE ba.user_id=? AND (ba.category IS NULL OR ba.category=ci.category)) ORDER BY ci.category,ci.name").bind(user.id).all():await env.DB.prepare("SELECT id,name,ean_code,category,description,technical_specs,unit,active,image_url FROM catalog_items WHERE active=1 ORDER BY category,name").all();return json({items:rows.results||[]});
 }
 if(path==="/api/catalog"&&method==="POST"){
  requireRole(user,"buyer","admin");const b=await bodyJson(req);if(!clean(b.name,180))return json({error:"Artikelnaam ontbreekt."},400);
  const ean=String(b.eanCode??'').trim();if(ean&&!validEan13(ean))return json({error:"Vul een geldige EAN-13-code van 13 cijfers in."},400);if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (category IS NULL OR category=?)").bind(user.id,clean(b.category,100)).first())requireRole(user,"admin");
  const id=crypto.randomUUID();try{await env.DB.prepare("INSERT INTO catalog_items (id,name,ean_code,category,description,technical_specs,image_url,unit,active,created_by) VALUES (?,?,?,?,?,?,?,?,1,?)").bind(id,clean(b.name,180),ean||null,clean(b.category,100),clean(b.description,1000),clean(b.technicalSpecs,3000),clean(b.imageUrl,500)||null,clean(b.unit,40)||"stuk",user.id).run()}catch(e){if(/unique/i.test(e.message))return json({error:"Deze EAN-code is al aan een ander artikel gekoppeld."},409);throw e}return json({id},201);
 }
 let m=path.match(/^\/api\/catalog\/([^/]+)$/);
 if(m&&method==="PATCH"){requireRole(user,"buyer","admin");const b=await bodyJson(req);const existingArticle=await env.DB.prepare("SELECT category FROM catalog_items WHERE id=?").bind(m[1]).first();if(!existingArticle)return json({error:"Artikel niet gevonden."},404);const targetCategory=b.category?clean(b.category,100):existingArticle.category;if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (category IS NULL OR category=?)").bind(user.id,targetCategory).first())requireRole(user,"admin");const hasEan=Object.prototype.hasOwnProperty.call(b,"eanCode"),ean=String(b.eanCode??'').trim();if(hasEan&&ean&&!validEan13(ean))return json({error:"Vul een geldige EAN-13-code van 13 cijfers in."},400);try{await env.DB.prepare("UPDATE catalog_items SET name=COALESCE(?,name),ean_code=CASE WHEN ?=1 THEN ? ELSE ean_code END,category=COALESCE(?,category),description=COALESCE(?,description),technical_specs=COALESCE(?,technical_specs),image_url=COALESCE(?,image_url),unit=COALESCE(?,unit),active=COALESCE(?,active) WHERE id=?").bind(b.name?clean(b.name,180):null,hasEan?1:0,ean||null,b.category?clean(b.category,100):null,Object.prototype.hasOwnProperty.call(b,"description")?clean(b.description,1000):null,Object.prototype.hasOwnProperty.call(b,"technicalSpecs")?clean(b.technicalSpecs,3000):null,Object.prototype.hasOwnProperty.call(b,"imageUrl")?clean(b.imageUrl,500):null,b.unit?clean(b.unit,40):null,typeof b.active==="boolean"?(b.active?1:0):null,m[1]).run()}catch(e){if(/unique/i.test(e.message))return json({error:"Deze EAN-code is al aan een ander artikel gekoppeld."},409);throw e}return json({ok:true})}
 if(path==="/api/orders"&&method==="GET"){
  let rows;
  if(user.role==="admin") rows=await env.DB.prepare("SELECT o.*,u.display_name requester_name,t.name team_name FROM orders o JOIN users u ON u.id=o.requester_id LEFT JOIN teams t ON t.id=o.team_id ORDER BY o.created_at DESC").all();
  else if(user.role==="staff") rows=await env.DB.prepare("SELECT DISTINCT o.*,u.display_name requester_name,t.name team_name FROM orders o JOIN users u ON u.id=o.requester_id LEFT JOIN teams t ON t.id=o.team_id LEFT JOIN team_members tm ON tm.team_id=o.team_id WHERE o.requester_id=? OR tm.user_id=? ORDER BY o.created_at DESC").bind(user.id,user.id).all();
  else rows=await env.DB.prepare("SELECT DISTINCT o.*,u.display_name requester_name,t.name team_name FROM orders o JOIN users u ON u.id=o.requester_id LEFT JOIN teams t ON t.id=o.team_id WHERE EXISTS (SELECT 1 FROM buyer_assignments ba WHERE ba.user_id=? AND (ba.campus IS NULL OR ba.campus=o.campus OR ba.campus='Beide campussen') AND (ba.team_id IS NULL OR ba.team_id=o.team_id)) AND NOT EXISTS (SELECT 1 FROM order_items oi LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE oi.order_id=o.id AND NOT EXISTS (SELECT 1 FROM buyer_assignments ba2 WHERE ba2.user_id=? AND (ba2.campus IS NULL OR ba2.campus=o.campus OR ba2.campus='Beide campussen') AND (ba2.team_id IS NULL OR ba2.team_id=o.team_id) AND (ba2.category IS NULL OR ba2.category=ci.category))) ORDER BY o.created_at DESC").bind(user.id,user.id).all();
  const orders=await Promise.all((rows.results||[]).map(async o=>{const items=await env.DB.prepare("SELECT oi.id,oi.catalog_item_id,oi.item_name,oi.quantity,oi.unit,oi.status,oi.buyer_note,oi.justification,COALESCE(oi.ean_code_snapshot,ci.ean_code) ean_code,COALESCE(oi.image_url_snapshot,ci.image_url) image_url,ci.category FROM order_items oi LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE oi.order_id=? ORDER BY oi.created_at").bind(o.id).all();const enriched=await Promise.all((items.results||[]).map(async item=>{const suppliers=await env.DB.prepare("SELECT sp.rank,s.id,s.name,s.enterprise_number FROM supplier_proposals sp JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.order_item_id=? ORDER BY sp.rank").bind(item.id).all();return{...item,suppliers:suppliers.results||[]}}));return{...o,items:enriched}}));
  return json({orders});
 }
 if(path==="/api/orders"&&method==="POST"){
  const b=await bodyJson(req),title=clean(b.title,180),items=Array.isArray(b.items)?b.items:[];
  if(!title||!(await isConfiguredCampus(env,b.campus))||!items.length||items.length>100)return json({error:"Controleer titel, campus en bestelregels."},400);
  if(!b.teamId)return json({error:"Selecteer het team waarvoor je bestelt."},400);
  const team=await env.DB.prepare("SELECT id,COALESCE(custom_campus,campus) campus FROM teams WHERE id=? AND active=1").bind(b.teamId).first();
  if(!team||!(team.campus===b.campus||team.campus==="Beide campussen"||b.campus==="Beide campussen"))return json({error:"Dit team hoort niet bij de gekozen campus."},400);
  if(user.role==="staff"&&user.campus&&user.campus!=="Beide campussen"&&user.campus!==b.campus)return json({error:"Je account is niet aan deze campus toegewezen."},403);
  if(user.role==="staff"){const member=await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?").bind(b.teamId,user.id).first();if(!member)return json({error:"Je bent geen lid van het geselecteerde team."},403)}
  if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (campus IS NULL OR campus=? OR campus='Beide campussen') AND (team_id IS NULL OR team_id=?)").bind(user.id,b.campus,b.teamId).first())requireRole(user,"admin");
  if(items.some(i=>!clean(i.justification,2000)))return json({error:"Geef voor ieder artikel een verantwoording in."},400);
  const orderId=crypto.randomUUID(),createdItems=[],statements=[env.DB.prepare("INSERT INTO orders (id,requester_id,title,campus,motivation,status,team_id,remarks) VALUES (?,?,?,?,?,'submitted',?,?)").bind(orderId,user.id,title,b.campus,clean(b.motivation,3000),b.teamId,clean(b.remarks,3000))];
  for(const item of items){
   if(!clean(item.name,180)||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0)return json({error:"Elke bestelregel moet een naam en positief aantal bevatten."},400);
   if(item.catalogItemId){const catalogItem=await env.DB.prepare("SELECT id,active,category FROM catalog_items WHERE id=?").bind(item.catalogItemId).first();if(!catalogItem||!catalogItem.active)return json({error:"Een geselecteerd artikel is niet meer beschikbaar."},409);if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (campus IS NULL OR campus=? OR campus='Beide campussen') AND (team_id IS NULL OR team_id=?) AND (category IS NULL OR category=?)").bind(user.id,b.campus,b.teamId,catalogItem.category).first())requireRole(user,"admin")}else if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (campus IS NULL OR campus=? OR campus='Beide campussen') AND (team_id IS NULL OR team_id=?) AND category IS NULL").bind(user.id,b.campus,b.teamId).first())requireRole(user,"admin");
   const itemId=crypto.randomUUID();createdItems.push({id:itemId});
   statements.push(env.DB.prepare("INSERT INTO order_items (id,order_id,catalog_item_id,item_name,quantity,unit,status,justification,ean_code_snapshot,image_url_snapshot) VALUES (?,?,?,?,?,?,'pending',?,?,?)").bind(itemId,orderId,item.catalogItemId||null,clean(item.name,180),Number(item.quantity),clean(item.unit,40)||"stuk",clean(item.justification,2000),clean(item.eanCode,13)||null,clean(item.imageUrl,500)||null));
   const proposals=Array.isArray(item.suppliers)?[...new Set(item.suppliers.map(x=>clean(x,180)).filter(Boolean))].slice(0,3):[];
   for(let n=0;n<proposals.length;n++){const name=clean(proposals[n],180);if(!name)continue;const sid=crypto.randomUUID();statements.push(env.DB.prepare("INSERT INTO suppliers (id,name,source) SELECT ?,?,'manual' WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE lower(name)=lower(?))").bind(sid,name,name));statements.push(env.DB.prepare("INSERT INTO supplier_proposals (id,order_item_id,supplier_id,rank) SELECT ?,?,id,? FROM suppliers WHERE lower(name)=lower(?) LIMIT 1").bind(crypto.randomUUID(),itemId,n+1,name));statements.push(env.DB.prepare("INSERT INTO order_events(id,order_id,order_item_id,actor_id,event_type,message) VALUES(?,?,?,?,'supplier_proposed',?)").bind(crypto.randomUUID(),orderId,itemId,user.id,"Leveranciersvoorstel: "+name))}
  }
  statements.push(env.DB.prepare("INSERT INTO order_events (id,order_id,actor_id,event_type,message) VALUES (?,?,?,'submitted',?)").bind(crypto.randomUUID(),orderId,user.id,"Bestelling ingediend"));
  await env.DB.batch(statements);return json({id:orderId,items:createdItems},201);
 }
 m=path.match(/^\/api\/orders\/([^/]+)$/);
 if(m&&method==="PATCH"){
  const b=await bodyJson(req);const order=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(m[1]).first();if(!order)return json({error:"Bestelling niet gevonden."},404);
  if(user.role==="staff"&&(order.requester_id!==user.id&&!await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?").bind(order.team_id,user.id).first()))requireRole(user,"admin");
  if(user.role==="buyer"&&!await buyerCanAccessOrder(env,user.id,order))requireRole(user,"admin");
  const allowed=["submitted","in_review","info_requested","more_info_received","approved","rejected","ordered","partially_delivered","delivered","cancelled"];
  if(!allowed.includes(b.status))return json({error:"Ongeldige bestelstatus."},400);
  if(user.role==="staff"&&(b.status!=="cancelled"||!["submitted","in_review"].includes(order.status)||order.requester_id!==user.id))requireRole(user,"admin");
  if(user.role==="buyer"&&!({submitted:["in_review","info_requested","approved","rejected"],in_review:["info_requested","approved","rejected"],info_requested:[],more_info_received:["in_review","approved","rejected"],approved:["ordered"],ordered:["partially_delivered","delivered"],partially_delivered:["delivered"],delivered:[],rejected:[],cancelled:[]}[order.status]||[]).includes(b.status))return json({error:"Deze statusovergang is niet toegestaan."},409);
  if(b.status==="rejected"&&!clean(b.reason,1000))return json({error:"Een afkeuringsreden is verplicht."},400);
  await env.DB.batch([env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.status,m[1]),env.DB.prepare("INSERT INTO order_events (id,order_id,actor_id,event_type,message) VALUES (?,?,?,'status_changed',?)").bind(crypto.randomUUID(),m[1],user.id,b.status==="rejected"?"Afgekeurd: "+clean(b.reason,1000):"Status gewijzigd naar "+b.status)]);
  return json({ok:true});
 }
 if(path==="/api/purchases"&&method==="GET"){
  requireRole(user,"staff","buyer","admin");
  const base="SELECT p.*,s.name supplier_name,oi.item_name,oi.quantity ordered_quantity,o.title order_title,o.campus,o.team_id,o.requester_id,t.name team_name FROM purchases p JOIN suppliers s ON s.id=p.supplier_id JOIN order_items oi ON oi.id=p.order_item_id JOIN orders o ON o.id=oi.order_id LEFT JOIN teams t ON t.id=o.team_id";
  const rows=user.role==="admin"?await env.DB.prepare(base+" ORDER BY p.purchase_date DESC").all():user.role==="staff"?await env.DB.prepare(base+" WHERE o.requester_id=? OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=o.team_id AND tm.user_id=?) ORDER BY p.purchase_date DESC").bind(user.id,user.id).all():await env.DB.prepare(base+" WHERE EXISTS (SELECT 1 FROM buyer_assignments ba WHERE ba.user_id=? AND (ba.campus IS NULL OR ba.campus=o.campus OR ba.campus='Beide campussen') AND (ba.team_id IS NULL OR ba.team_id=o.team_id) AND (ba.category IS NULL OR EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.id=oi.catalog_item_id AND ci.category=ba.category))) ORDER BY p.purchase_date DESC").bind(user.id).all();const purchases=await Promise.all((rows.results||[]).map(async p=>{const d=await env.DB.prepare("SELECT id,quantity,delivered_on,note FROM purchase_deliveries WHERE purchase_id=? ORDER BY delivered_on,created_at").bind(p.id).all();return {...p,deliveries:d.results||[]}}));return json({purchases});
 }
 if(path==="/api/purchases"&&method==="POST"){
  requireRole(user,"buyer","admin");const b=await bodyJson(req);
  if(!b.orderItemId||!clean(b.supplier,180)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(b.date)||b.status!=="besteld")return json({error:"Een nieuwe aankoop start met status besteld. Registreer leveringen afzonderlijk."},400);
  const item=await env.DB.prepare("SELECT oi.id,oi.order_id,o.campus,o.team_id,o.status order_status,oi.catalog_item_id,ci.category FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE oi.id=?").bind(b.orderItemId).first();if(!item)return json({error:"Bestelregel niet gevonden."},404);if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (campus IS NULL OR campus=? OR campus='Beide campussen') AND (team_id IS NULL OR team_id=?) AND (category IS NULL OR category=?)").bind(user.id,item.campus,item.team_id,item.category).first())requireRole(user,"admin");
  if(!["approved","ordered","partially_delivered"].includes(item.order_status))return json({error:"De bestelling moet eerst goedgekeurd zijn voordat een aankoop wordt geregistreerd."},409);
  let supplier=await env.DB.prepare("SELECT id FROM suppliers WHERE lower(name)=lower(?) LIMIT 1").bind(clean(b.supplier,180)).first();
  if(!supplier){const sid=crypto.randomUUID();await env.DB.prepare("INSERT INTO suppliers (id,name,source) VALUES (?,?,'manual')").bind(sid,clean(b.supplier,180)).run();supplier={id:sid}}
  const pid=crypto.randomUUID();
  await env.DB.batch([env.DB.prepare("INSERT INTO purchases (id,order_item_id,supplier_id,purchase_order_number,purchase_date,status,note,created_by) VALUES (?,?,?,?,?,?,?,?)").bind(pid,item.id,supplier.id,clean(b.number,100)||null,b.date,b.status,clean(b.note,2000),user.id),env.DB.prepare("UPDATE order_items SET status=?,buyer_id=?,buyer_note=? WHERE id=?").bind(b.status,item.id,user.id,clean(b.note,2000),item.id),env.DB.prepare("INSERT INTO order_events (id,order_id,order_item_id,actor_id,event_type,message) VALUES (?,?,?,?,'purchase_registered',?)").bind(crypto.randomUUID(),item.order_id,item.id,user.id,"Aankoop geregistreerd; bestelbon "+clean(b.number,100))]);
  await syncOrderStatus(env,item.order_id);
  return json({id:pid},201);
 }
 m=path.match(/^\/api\/purchases\/([^/]+)\/deliveries$/);
 if(m&&method==="POST"){
  requireRole(user,"buyer","admin");const b=await bodyJson(req);
  const p=await env.DB.prepare("SELECT p.id,p.order_item_id,oi.order_id,oi.quantity ordered_quantity,o.campus,o.team_id,ci.category FROM purchases p JOIN order_items oi ON oi.id=p.order_item_id JOIN orders o ON o.id=oi.order_id LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE p.id=?").bind(m[1]).first();
  if(!p)return json({error:"Aankoop niet gevonden."},404);
  if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments ba WHERE ba.user_id=? AND (ba.campus IS NULL OR ba.campus=? OR ba.campus='Beide campussen') AND (ba.team_id IS NULL OR ba.team_id=?) AND (ba.category IS NULL OR ba.category=?)").bind(user.id,p.campus,p.team_id,p.category).first())requireRole(user,"admin");
  const quantity=Number(b.quantity),date=String(b.date||"");
  if(!Number.isFinite(quantity)||quantity<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"Vul een geldig geleverd aantal en een leverdatum in."},400);
  const total=await env.DB.prepare("SELECT COALESCE(SUM(quantity),0) total FROM purchase_deliveries WHERE purchase_id=?").bind(m[1]).first();
  if(Number(total.total)+quantity>Number(p.ordered_quantity))return json({error:"Het totaal van de deelleveringen mag de bestelde hoeveelheid niet overschrijden."},409);
  const deliveryId=crypto.randomUUID(),newTotal=Number(total.total)+quantity,status=newTotal>=Number(p.ordered_quantity)?"geleverd":"gedeeltelijk_geleverd";
  await env.DB.batch([env.DB.prepare("INSERT INTO purchase_deliveries(id,purchase_id,quantity,delivered_on,note,created_by) VALUES(?,?,?,?,?,?)").bind(deliveryId,m[1],quantity,date,clean(b.note,1000)||null,user.id),env.DB.prepare("UPDATE purchases SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,m[1]),env.DB.prepare("UPDATE order_items SET status=? WHERE id=?").bind(status,p.order_item_id),env.DB.prepare("INSERT INTO order_events(id,order_id,order_item_id,actor_id,event_type,message) VALUES(?,?,?,?,'delivery_recorded',?)").bind(crypto.randomUUID(),p.order_id,p.order_item_id,user.id,quantity+" eenheden geleverd op "+date+(clean(b.note,1000)?": "+clean(b.note,1000):""))]);
  await syncOrderStatus(env,p.order_id);
  return json({id:deliveryId,status,totalDelivered:newTotal,orderedQuantity:p.ordered_quantity},201);
 }
 m=path.match(/^\/api\/purchases\/([^/]+)$/);
 if(m&&method==="PATCH"){requireRole(user,"buyer","admin");const b=await bodyJson(req);if(!["besteld","gedeeltelijk_geleverd","geleverd","geannuleerd"].includes(b.status))return json({error:"Ongeldige aankoopstatus."},400);const p=await env.DB.prepare("SELECT p.id,p.order_item_id,oi.order_id,oi.quantity ordered_quantity,o.campus,o.team_id,ci.category FROM purchases p JOIN order_items oi ON oi.id=p.order_item_id JOIN orders o ON o.id=oi.order_id LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE p.id=?").bind(m[1]).first();if(!p)return json({error:"Aankoop niet gevonden."},404);if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (campus IS NULL OR campus=? OR campus='Beide campussen') AND (team_id IS NULL OR team_id=?) AND (category IS NULL OR category=?)").bind(user.id,p.campus,p.team_id,p.category).first())requireRole(user,"admin");const delivered=await env.DB.prepare("SELECT COALESCE(SUM(quantity),0) total FROM purchase_deliveries WHERE purchase_id=?").bind(m[1]).first();if(b.status==="geleverd"&&Number(delivered.total)<Number(p.ordered_quantity))return json({error:"Registreer eerst alle geleverde aantallen via deelleveringen."},409);if(b.status==="gedeeltelijk_geleverd"&&(Number(delivered.total)<=0||Number(delivered.total)>=Number(p.ordered_quantity)))return json({error:"De status gedeeltelijk geleverd moet overeenkomen met de geregistreerde deelleveringen."},409);await env.DB.batch([env.DB.prepare("UPDATE purchases SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.status,m[1]),env.DB.prepare("UPDATE order_items SET status=? WHERE id=?").bind(b.status,p.order_item_id),env.DB.prepare("INSERT INTO order_events(id,order_id,order_item_id,actor_id,event_type,message) VALUES(?,?,?,?,'delivery_status_changed',?)").bind(crypto.randomUUID(),p.order_id,p.order_item_id,user.id,"Leverstatus gewijzigd naar "+b.status)]);await syncOrderStatus(env,p.order_id);return json({ok:true})}
 if(path==="/api/users"&&method==="GET"){requireRole(user,"admin");const rows=await env.DB.prepare("SELECT id,email,display_name,role,campus,active FROM users ORDER BY display_name").all();return json({users:rows.results||[]})}
 if(path.startsWith("/api/users/")&&method==="PATCH"){
  requireRole(user,"admin");
  const uid=path.split("/").pop(),b=await bodyJson(req);
  const target=await env.DB.prepare("SELECT id,email FROM users WHERE id=?").bind(uid).first();
  if(!target)return json({error:"Gebruiker niet gevonden."},404);
  if(b.role!==undefined||b.active!==undefined)return json({error:"Rollen en accountstatus worden centraal beheerd in SAPOOV."},410);
  if(b.campus&&!(await isConfiguredCampus(env,b.campus)))return json({error:"Deze campus is niet geconfigureerd."},400);
  if(b.campus!==undefined)await env.DB.prepare("UPDATE users SET campus=? WHERE id=?").bind(clean(b.campus,100)||null,uid).run();
  return json({ok:true});
 }
 m=path.match(/^\/api\/users\/([^/]+)\/assignments$/);
 if(m&&method==="GET"){requireRole(user,"admin");const rows=await env.DB.prepare("SELECT campus,category,team_id FROM buyer_assignments WHERE user_id=? ORDER BY campus,category").bind(m[1]).all();return json({assignments:rows.results||[]})}
 if(m&&method==="PUT")return json({error:"Aankopersrollen en scopes worden centraal beheerd in SAPOOV."},410);
 if(path==="/api/settings"&&method==="GET"){const rows=await env.DB.prepare("SELECT setting_key,setting_value FROM app_settings ORDER BY setting_key").all();return json({settings:rows.results||[]})}
 if(path==="/api/settings"&&method==="PUT"){requireRole(user,"admin");const b=await bodyJson(req);if(!b.key||typeof b.value!=="string")return json({error:"Ongeldige instelling."},400);if(b.key==="campuses"){let campuses;try{campuses=JSON.parse(b.value)}catch{return json({error:"De campuslijst is ongeldig."},400)}if(!Array.isArray(campuses)||!campuses.length||campuses.length>30||campuses.some(c=>typeof c!=="string"||!clean(c,40))||new Set(campuses).size!==campuses.length)return json({error:"Voeg één tot dertig unieke, geldige campussen toe."},400);const usedOrder=await env.DB.prepare("SELECT campus FROM orders WHERE campus<>'Beide campussen'").all();const usedTeams=await env.DB.prepare("SELECT COALESCE(custom_campus,campus) campus FROM teams WHERE COALESCE(custom_campus,campus)<>'Beide campussen'").all();const missing=[...(usedOrder.results||[]).map(x=>x.campus),...(usedTeams.results||[]).map(x=>x.campus)].filter(c=>!campuses.includes(c));if(missing.length)return json({error:"Deze campus is nog gekoppeld aan bestaande bestellingen of teams en kan daarom niet verwijderd worden: "+[...new Set(missing)].join(", ")},409)}await env.DB.prepare("INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(clean(b.key,100),b.value.slice(0,4000),user.id).run();return json({ok:true})}
 
 if(path==="/api/teams"&&method==="GET"){
  let rows;
  if(user.role==="admin")rows=await env.DB.prepare("SELECT id,name,COALESCE(custom_campus,campus) campus,description,active,created_at,updated_at FROM teams WHERE active=1 ORDER BY campus,name").all();
  else if(user.role==="staff")rows=await env.DB.prepare("SELECT DISTINCT t.id,t.name,COALESCE(t.custom_campus,t.campus) campus,t.description,t.active,t.created_at,t.updated_at FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=? AND t.active=1 ORDER BY campus,t.name").bind(user.id).all();
  else rows=await env.DB.prepare("SELECT DISTINCT t.id,t.name,COALESCE(t.custom_campus,t.campus) campus,t.description,t.active,t.created_at,t.updated_at FROM teams t JOIN buyer_assignments ba ON ba.user_id=? AND (ba.team_id=t.id OR ba.team_id IS NULL) AND (ba.campus=COALESCE(t.custom_campus,t.campus) OR ba.campus IS NULL OR ba.campus='Beide campussen' OR (t.campus='Beide campussen' AND t.custom_campus IS NULL)) WHERE t.active=1 ORDER BY campus,t.name").bind(user.id).all();
  return json({teams:rows.results||[]});
 }
 if(path==="/api/teams"&&method==="POST"){
  requireRole(user,"admin");const b=await bodyJson(req),name=clean(b.name,120),campus=clean(b.campus,40);
  if(!name||!(await isConfiguredCampus(env,campus)))return json({error:"Vul een teamnaam en geldige campus in."},400);
  const fixed=["Ninove","Zottegem","Beide campussen"].includes(campus),storedCampus=fixed?campus:"Beide campussen";
  const id=crypto.randomUUID();try{await env.DB.prepare("INSERT INTO teams(id,name,campus,custom_campus,description) VALUES(?,?,?,?,?)").bind(id,name,storedCampus,fixed?null:campus,clean(b.description,1000)).run()}catch(e){if(/unique/i.test(e.message))return json({error:"Deze teamnaam bestaat al."},409);throw e}
  return json({id},201);
 }
 m=path.match(/^\/api\/teams\/([^/]+)$/);
 if(m&&method==="PATCH"){
  requireRole(user,"admin");const b=await bodyJson(req),hasCampus=Object.prototype.hasOwnProperty.call(b,"campus"),campus=hasCampus?clean(b.campus,40):null;
  if(hasCampus&&!(await isConfiguredCampus(env,campus)))return json({error:"Deze campus is niet geconfigureerd."},400);
  const fixedCampus=campus&&["Ninove","Zottegem","Beide campussen"].includes(campus),storedCampus=campus?(fixedCampus?campus:"Beide campussen"):null,customCampus=campus&&!fixedCampus?campus:null;
  await env.DB.prepare("UPDATE teams SET name=COALESCE(?,name),campus=COALESCE(?,campus),custom_campus=CASE WHEN ?=1 THEN ? ELSE custom_campus END,description=COALESCE(?,description),active=COALESCE(?,active),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.name?clean(b.name,120):null,storedCampus,hasCampus?1:0,customCampus,Object.prototype.hasOwnProperty.call(b,"description")?clean(b.description,1000):null,typeof b.active==="boolean"?(b.active?1:0):null,m[1]).run();return json({ok:true});
 }
 m=path.match(/^\/api\/teams\/([^/]+)\/members$/);
 if(m&&method==="GET"){
  const team=await env.DB.prepare("SELECT id FROM teams WHERE id=?").bind(m[1]).first();if(!team)return json({error:"Team niet gevonden."},404);
  if(user.role!=="admin"){const member=await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?").bind(m[1],user.id).first();if(!member)requireRole(user,"admin")}
  const rows=await env.DB.prepare("SELECT tm.user_id,tm.member_role,u.email,u.display_name,u.role,u.active FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=? ORDER BY u.display_name").bind(m[1]).all();return json({members:rows.results||[]});
 }
 if(m&&method==="PUT"){
  requireRole(user,"admin");const b=await bodyJson(req),members=Array.isArray(b.members)?b.members:[];
  const statements=[env.DB.prepare("DELETE FROM team_members WHERE team_id=?").bind(m[1])];
  for(const member of members){if(!member.userId)continue;statements.push(env.DB.prepare("INSERT INTO team_members(team_id,user_id,member_role) VALUES(?,?,?)").bind(m[1],member.userId,member.memberRole==="coordinator"?"coordinator":"member"))}
  await env.DB.batch(statements);return json({ok:true});
 }
 m=path.match(/^\/api\/orders\/([^/]+)\/events$/);
 if(m&&method==="GET"){
  const order=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(m[1]).first();if(!order)return json({error:"Bestelling niet gevonden."},404);
  const allowedRead=user.role==="admin"||(user.role==="staff"&&(order.requester_id===user.id||!!(await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?").bind(order.team_id,user.id).first())))||(user.role==="buyer"&&await buyerCanAccessOrder(env,user.id,order));
  if(!allowedRead)requireRole(user,"admin");
  const rows=await env.DB.prepare("SELECT e.*,u.display_name actor_name FROM order_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.order_id=? ORDER BY e.created_at,e.rowid").bind(m[1]).all();return json({events:rows.results||[]});
 }
 m=path.match(/^\/api\/orders\/([^/]+)\/information-requests$/);
 if(m&&method==="GET"){
  const order=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(m[1]).first();if(!order)return json({error:"Bestelling niet gevonden."},404);
  const member=order.team_id?await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?").bind(order.team_id,user.id).first():null;
  const assignment=user.role==="buyer"?await buyerCanAccessOrder(env,user.id,order):false;
  if(user.role!=="admin"&&!(user.role==="staff"&&(order.requester_id===user.id||member))&&!(user.role==="buyer"&&assignment))requireRole(user,"admin");
  const rows=await env.DB.prepare("SELECT ir.*,u.display_name requester_name FROM information_requests ir JOIN users u ON u.id=ir.requested_by WHERE ir.order_item_id IN (SELECT id FROM order_items WHERE order_id=?) ORDER BY ir.requested_at").bind(m[1]).all();return json({requests:rows.results||[]});
 }
 if(m&&method==="POST"){
  requireRole(user,"buyer","admin");const b=await bodyJson(req),order=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(m[1]).first();if(!order)return json({error:"Bestelling niet gevonden."},404);
  if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (campus IS NULL OR campus=? OR campus='Beide campussen') AND (team_id IS NULL OR team_id=?) AND (category IS NULL OR EXISTS (SELECT 1 FROM order_items oi LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE oi.order_id=? AND ci.category=ba.category))").bind(user.id,order.campus,order.team_id,order.id).first())requireRole(user,"admin");
  const item=await env.DB.prepare("SELECT oi.id,ci.category FROM order_items oi LEFT JOIN catalog_items ci ON ci.id=oi.catalog_item_id WHERE oi.id=? AND oi.order_id=?").bind(b.orderItemId,m[1]).first();if(!item||!clean(b.question,2000))return json({error:"Selecteer een bestelregel en vul de informatievraag in."},400);if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (campus IS NULL OR campus=? OR campus='Beide campussen') AND (team_id IS NULL OR team_id=?) AND (category IS NULL OR category=?)").bind(user.id,order.campus,order.team_id,item.category).first())requireRole(user,"admin");
  const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare("INSERT INTO information_requests(id,order_item_id,requested_by,request_text) VALUES(?,?,?,?)").bind(id,item.id,user.id,clean(b.question,2000)),env.DB.prepare("UPDATE orders SET status='info_requested',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(m[1]),env.DB.prepare("INSERT INTO order_events(id,order_id,order_item_id,actor_id,event_type,message) VALUES(?,?,?,?,'information_requested',?)").bind(crypto.randomUUID(),m[1],item.id,user.id,clean(b.question,2000))]);return json({id},201);
 }
 m=path.match(/^\/api\/information-requests\/([^/]+)\/respond$/);
 if(m&&method==="POST"){
  const b=await bodyJson(req),ir=await env.DB.prepare("SELECT ir.*,oi.order_id,o.requester_id,o.team_id FROM information_requests ir JOIN order_items oi ON oi.id=ir.order_item_id JOIN orders o ON o.id=oi.order_id WHERE ir.id=?").bind(m[1]).first();if(!ir)return json({error:"Informatieverzoek niet gevonden."},404);
  const member=ir.team_id?await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?").bind(ir.team_id,user.id).first():null;
  if(user.role!=="admin"&&ir.requester_id!==user.id&&!member)requireRole(user,"admin");
  const answer=clean(b.answer,3000);if(!answer)return json({error:"Vul een antwoord in."},400);
  await env.DB.batch([env.DB.prepare("UPDATE information_requests SET response_text=?,responded_at=CURRENT_TIMESTAMP WHERE id=?").bind(answer,m[1]),env.DB.prepare("UPDATE orders SET status='more_info_received',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(ir.order_id),env.DB.prepare("INSERT INTO order_events(id,order_id,order_item_id,actor_id,event_type,message) VALUES(?,?,?,?,'information_responded',?)").bind(crypto.randomUUID(),ir.order_id,ir.order_item_id,user.id,answer)]);return json({ok:true});
 }
 m=path.match(/^\/api\/catalog\/([^/]+)\/suppliers$/);
 if(m&&(method==="GET"||method==="PUT")){requireRole(user,"buyer","admin");const article=await env.DB.prepare("SELECT category FROM catalog_items WHERE id=?").bind(m[1]).first();if(!article)return json({error:"Artikel niet gevonden."},404);if(user.role==="buyer"&&!await env.DB.prepare("SELECT 1 FROM buyer_assignments WHERE user_id=? AND (category IS NULL OR category=?)").bind(user.id,article.category).first())requireRole(user,"admin")}
 if(m&&method==="GET"){const rows=await env.DB.prepare("SELECT s.id,s.name,s.enterprise_number,s.website,cis.preferred FROM catalog_item_suppliers cis JOIN suppliers s ON s.id=cis.supplier_id WHERE cis.catalog_item_id=? ORDER BY cis.preferred DESC,s.name").bind(m[1]).all();return json({suppliers:rows.results||[]})}
 if(m&&method==="PUT"){requireRole(user,"buyer","admin");const b=await bodyJson(req),ids=Array.isArray(b.supplierIds)?[...new Set(b.supplierIds)].slice(0,50):[];const statements=[env.DB.prepare("DELETE FROM catalog_item_suppliers WHERE catalog_item_id=?").bind(m[1])];for(const sid of ids)statements.push(env.DB.prepare("INSERT INTO catalog_item_suppliers(catalog_item_id,supplier_id,preferred) VALUES(?,?,?)").bind(m[1],sid,sid===b.preferredSupplierId?1:0));await env.DB.batch(statements);return json({ok:true})}
 if(path==="/api/suppliers"&&method==="GET"){
  const rows=await env.DB.prepare("SELECT id,enterprise_number,vat_number,name,street,house_number,box,zipcode,municipality,country,phone,email,website,image_url,contact_person,source,kbo_snapshot_date FROM suppliers ORDER BY name").all();return json({suppliers:rows.results||[]});
 }
 if(path==="/api/suppliers"&&method==="POST"){
  requireRole(user,"buyer","admin");const b=await bodyJson(req),name=clean(b.name,180),rawEnterprise=clean(b.enterpriseNumber,20).replace(/[^0-9]/g,""),enterprise=rawEnterprise?rawEnterprise.padStart(10,"0"):"";if(!name)return json({error:"Bedrijfsnaam ontbreekt."},400);
  if(enterprise&&!validEnterpriseNumber(enterprise))return json({error:"Het ondernemingsnummer is ongeldig."},400);
  if(enterprise){const duplicate=await env.DB.prepare("SELECT id FROM suppliers WHERE enterprise_number=?").bind(enterprise).first();if(duplicate)return json({error:"Dit ondernemingsnummer bestaat al."},409)}
  const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO suppliers(id,enterprise_number,vat_number,name,street,house_number,box,zipcode,municipality,country,phone,email,website,contact_person,source,kbo_snapshot_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,enterprise||null,clean(b.vatNumber,30)||null,name,clean(b.street,180)||null,clean(b.houseNumber,20)||null,clean(b.box,20)||null,clean(b.zipcode,20)||null,clean(b.municipality,100)||null,clean(b.country,60)||"België",clean(b.phone,50)||null,clean(b.email,180)||null,clean(b.website,250)||null,clean(b.contactPerson,180)||null,clean(b.source,30)||"manual",b.kboSnapshotDate||null).run();return json({id},201);
 }
 m=path.match(/^\/api\/suppliers\/([^/]+)\/articles$/);
 if(m&&method==="GET"){
  requireRole(user,"buyer","admin");
  const supplier=await env.DB.prepare("SELECT id FROM suppliers WHERE id=?").bind(m[1]).first();if(!supplier)return json({error:"Leverancier niet gevonden."},404);
  const rows=user.role==="admin"?await env.DB.prepare("SELECT ci.id,ci.name,ci.ean_code,ci.category,ci.unit,ci.image_url,cis.preferred FROM catalog_item_suppliers cis JOIN catalog_items ci ON ci.id=cis.catalog_item_id WHERE cis.supplier_id=? ORDER BY ci.category,ci.name").bind(m[1]).all():await env.DB.prepare("SELECT ci.id,ci.name,ci.ean_code,ci.category,ci.unit,ci.image_url,cis.preferred FROM catalog_item_suppliers cis JOIN catalog_items ci ON ci.id=cis.catalog_item_id WHERE cis.supplier_id=? AND EXISTS (SELECT 1 FROM buyer_assignments ba WHERE ba.user_id=? AND (ba.category IS NULL OR ba.category=ci.category)) ORDER BY ci.category,ci.name").bind(m[1],user.id).all();
  return json({articles:rows.results||[]});
 }
 m=path.match(/^\/api\/suppliers\/([^/]+)$/);
 if(m&&method==="PATCH"){
  requireRole(user,"buyer","admin");const b=await bodyJson(req);const enterprise=Object.prototype.hasOwnProperty.call(b,"enterpriseNumber")?clean(b.enterpriseNumber,20).replace(/\D/g,"").padStart(10,"0"):null;if(enterprise&&!validEnterpriseNumber(enterprise))return json({error:"Het ondernemingsnummer is ongeldig."},400);if(enterprise){const duplicate=await env.DB.prepare("SELECT id FROM suppliers WHERE enterprise_number=? AND id<>?").bind(enterprise,m[1]).first();if(duplicate)return json({error:"Dit ondernemingsnummer bestaat al."},409)}await env.DB.prepare("UPDATE suppliers SET name=COALESCE(?,name),enterprise_number=COALESCE(?,enterprise_number),vat_number=COALESCE(?,vat_number),street=COALESCE(?,street),house_number=COALESCE(?,house_number),box=COALESCE(?,box),zipcode=COALESCE(?,zipcode),municipality=COALESCE(?,municipality),phone=COALESCE(?,phone),email=COALESCE(?,email),website=COALESCE(?,website),contact_person=COALESCE(?,contact_person),country=COALESCE(?,country) WHERE id=?").bind(b.name?clean(b.name,180):null,enterprise,b.vatNumber?clean(b.vatNumber,30):null,b.street?clean(b.street,180):null,b.houseNumber?clean(b.houseNumber,20):null,b.box?clean(b.box,20):null,b.zipcode?clean(b.zipcode,20):null,b.municipality?clean(b.municipality,100):null,b.phone?clean(b.phone,50):null,b.email?clean(b.email,180):null,b.website?clean(b.website,250):null,b.contactPerson?clean(b.contactPerson,180):null,b.country?clean(b.country,60):null,m[1]).run();return json({ok:true});
 }
 return json({error:"API-route niet gevonden."},404);
}
export default {
 async fetch(req,env){
  const u=new URL(req.url);
  const origin=env.APP_ORIGIN||"*";
  const headers={"access-control-allow-origin":origin,"access-control-allow-methods":"GET,POST,PATCH,PUT,OPTIONS","access-control-allow-headers":"content-type,authorization","vary":"Origin"};
  if(req.method==="OPTIONS")return new Response(null,{headers});
  if(u.pathname==="/api/health")return json({ok:true,app:env.APP_NAME||"Richtpunt Bestelplatform",cloudflareAccessConfigured:!!(env.CF_ACCESS_TEAM_DOMAIN&&env.CF_ACCESS_AUD),databaseConfigured:!!env.DB,kboConfigured:!!(env.KBO_USERNAME&&env.KBO_PASSWORD&&env.KBO_ENDPOINT)});
  if(u.pathname.startsWith("/api/images/")&&req.method==="GET"&&u.pathname!=="/api/images/import"){
    try{if(!env.IMAGES)return json({error:"R2-afbeeldingenopslag is niet geconfigureerd."},503);const viewer=await authenticate(req,env);if(!viewer.active)return json({error:"Niet gemachtigd."},403);const key=decodeURIComponent(u.pathname.slice("/api/images/".length));if(!key||key.includes(".."))return json({error:"Ongeldig afbeeldingspad."},400);const object=await env.IMAGES.get(key);if(!object)return json({error:"Afbeelding niet gevonden."},404);return new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"application/octet-stream","cache-control":"private, max-age=3600","x-content-type-options":"nosniff"}})}catch(e){return json({error:e.message||"Afbeelding ophalen mislukt."},e.status||500)}
  }
  if(u.pathname==="/api/images/import"&&req.method==="POST"){try{return await importImage(req,env)}catch(e){return json({error:e.message||"Afbeeldingsimport mislukt."},500)}}
  if(u.pathname==="/api/kbo/search"&&req.method==="GET"){try{if(!env.DB)return json({error:"D1-databasebinding ontbreekt."},503);const kboUser=await authenticate(req,env);requireRole(kboUser,"buyer","admin");const q=(u.searchParams.get("q")||"").trim();if(!q)return json({results:[]});let body;if(/^\\d[\\d.\\s-]{7,12}$/.test(q)){const number=q.replace(/\\D/g,"").padStart(10,"0");if(!validEnterpriseNumber(number))return json({error:"Vul een geldig Belgisch ondernemingsnummer in."},400);body="<mes:ReadEnterpriseRequest><dat:EnterpriseNumber>"+number+"</dat:EnterpriseNumber></mes:ReadEnterpriseRequest>"}else{const terms=q.split(/\\s+/).filter(Boolean).slice(0,10);const parts=terms.map(t=>"<mes:Phoneme>"+esc(t)+"</mes:Phoneme>").join("");body="<mes:ReadEnterpriseByPhonemeRequest>"+parts+"<mes:TypeOfEnterprise>ELP</mes:TypeOfEnterprise><mes:ActiveFilter>true</mes:ActiveFilter></mes:ReadEnterpriseByPhonemeRequest>"}const xml=await kbo(env,body);return json(parseKboResults(xml))}catch(e){return json({error:e.message},503)}}
  if(u.pathname.startsWith("/api/")){if(!env.DB)return json({error:"D1-databasebinding ontbreekt."},503);try{const user=await authenticate(req,env);const response=await api(req,env,user,u);const safeHeaders=new Headers(response.headers);safeHeaders.set("access-control-allow-origin",env.APP_ORIGIN||"null");safeHeaders.set("vary","Origin");return new Response(response.body,{status:response.status,statusText:response.statusText,headers:safeHeaders})}catch(e){const response=json({error:e.message||"Interne API-fout."},e.status||500);const safeHeaders=new Headers(response.headers);safeHeaders.set("access-control-allow-origin",env.APP_ORIGIN||"null");safeHeaders.set("vary","Origin");return new Response(response.body,{status:response.status,statusText:response.statusText,headers:safeHeaders})}}
  return env.ASSETS?env.ASSETS.fetch(req):json({error:"Frontend niet gebouwd."},404);
 }
};
