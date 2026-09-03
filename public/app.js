let msalApp=null, account=null, accessToken=null, templates=[], me=null;
const $=s=>document.querySelector(s);
const state={selectedTemplate:null};

async function getConfig(){const r=await fetch('/api/config');return r.json()}
async function api(path,options={}){options.headers={...(options.headers||{}),Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'};const r=await fetch(path,options);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function toast(message){const t=$('#toast');t.textContent=message;t.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.style.display='none',3200)}
function escapeHtml(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function quota(){return `${Math.max(0,me.allocated-me.used).toLocaleString('nl-BE')} tokens`}
function setActive(page){document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page))}

async function login(){
  try{
    const c=await getConfig();
    if(!c.clientId||!c.tenantId){throw new Error('Microsoft 365 is nog niet geconfigureerd. Vul M365/AZURE tenant- en client-ID in op de server.')}
    msalApp=new msal.PublicClientApplication({auth:{clientId:c.clientId,authority:`https://login.microsoftonline.com/${c.tenantId}`,redirectUri:location.origin}});
    await msalApp.initialize();
    const result=await msalApp.loginPopup({scopes:[c.apiScope||`api://${c.clientId}/access_as_user`],prompt:'select_account'});
    account=result.account;
    accessToken=result.accessToken||await acquireToken();
    await startApp();
  }catch(e){toast(e.message||'Aanmelden mislukt.')}
}
async function acquireToken(){const c=await getConfig();const r=await msalApp.acquireTokenSilent({scopes:[c.apiScope||`api://${c.clientId}/access_as_user`],account});return r.accessToken}
async function startApp(){
  me=await api('/api/me');
  templates=await api('/api/templates');
  $('#login').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#userName').textContent=me.name||me.email;$('#quota').textContent=quota();
  if(me.admin)$('#adminNav').classList.remove('hidden');
  renderHome();
}
function renderHome(){
  setActive('home');
  $('#main').innerHTML=`<section class="hero"><div class="eyebrow">Goedgekeurde AI-sjablonen</div><h1>Wat wil je maken?</h1><p>Kies een sjabloon en geef de AI je onderwijscontext. De school bepaalt welke sjablonen en instructies beschikbaar zijn.</p></section><div class="cards">${templates.map((t,i)=>`<button class="card" data-template="${escapeHtml(t.id)}"><div class="card-num">${String(i+1).padStart(2,'0')}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.description)}</p><div class="chips">${(t.outputs||[]).map(x=>`<span class="chip">${escapeHtml(x)}</span>`).join('')}</div></button>`).join('')}</div>`;
  document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>openTemplate(b.dataset.template));
}
function openTemplate(id){state.selectedTemplate=id;renderGenerate()}
function renderGenerate(){
  setActive('generate');
  const selected=templates.find(t=>t.id===state.selectedTemplate)||templates[0];
  $('#main').innerHTML=`<section class="hero"><div class="eyebrow">AI-generator</div><h1>Nieuwe onderwijscontent</h1><p>Werk vanuit een goedgekeurd sjabloon. Controleer de gegenereerde inhoud altijd vóór gebruik, publicatie of communicatie met ouders.</p></section><div class="generator"><section class="panel"><div class="field"><label for="template">Sjabloon</label><select id="template">${templates.map(t=>`<option value="${escapeHtml(t.id)}" ${t.id===selected?.id?'selected':''}>${escapeHtml(t.title)}</option>`).join('')}</select><small id="templateInfo">${escapeHtml(selected?.description||'')}</small></div><div class="field"><label for="input">Context en opdracht</label><textarea id="input" placeholder="Beschrijf vak/domein, graad, klasgroep, onderwerp, leerdoelen, duur, voorkennis, materiaal, niveau, differentiatie en andere relevante afspraken."></textarea></div><div class="actions"><select id="format" style="max-width:150px"><option value="text">Tekst</option><option value="pdf">PDF</option></select><button class="btn primary" id="generateBtn">Genereren</button><span class="status" id="genStatus">${quota()} beschikbaar</span></div></section><section class="panel"><div class="output-head"><strong>Resultaat</strong><button class="btn secondary" id="copyBtn">Kopiëren</button></div><div id="output" class="output empty">Je gegenereerde content verschijnt hier.</div></section></div>`;
  $('#template').onchange=()=>{$('#templateInfo').textContent=templates.find(t=>t.id===$('#template').value)?.description||'';state.selectedTemplate=$('#template').value};
  $('#generateBtn').onclick=generate;$('#copyBtn').onclick=()=>navigator.clipboard?.writeText($('#output').textContent).then(()=>toast('Resultaat gekopieerd.'));
}
async function generate(){
  const btn=$('#generateBtn');const input=$('#input').value.trim();if(!input){toast('Geef eerst voldoende context en een opdracht.');return}
  btn.disabled=true;$('#genStatus').textContent='AI genereert…';$('#output').classList.remove('empty');$('#output').textContent='Even geduld…';
  try{const d=await api('/api/generate',{method:'POST',body:JSON.stringify({templateId:$('#template').value,input,format:$('#format').value})});$('#output').textContent=d.text||'Geen output ontvangen.';me.used=me.allocated-d.remaining;$('#quota').textContent=`${Math.max(0,d.remaining).toLocaleString('nl-BE')} tokens`;$('#genStatus').textContent=`${d.tokens.toLocaleString('nl-BE')} tokens gebruikt`;if(d.pdf)downloadPdf(d.pdf,d.filename)}catch(e){$('#output').textContent='';$('#output').classList.add('empty');$('#genStatus').textContent='Mislukt';toast(e.message)}finally{btn.disabled=false}
}
function downloadPdf(base64,filename){const a=document.createElement('a');a.href='data:application/pdf;base64,'+base64;a.download=filename||'onderwijsai.pdf';document.body.appendChild(a);a.click();a.remove();toast('PDF gegenereerd.')}

async function renderAdmin(){
  setActive('admin');
  $('#main').innerHTML=`<section class="hero"><div class="eyebrow">Beheer</div><h1>AI-beheer</h1><p>Beheer toegang, tokenbudgetten en de goedgekeurde sjablonen. De OpenAI-sleutel zelf blijft buiten deze interface en wordt uitsluitend server-side gebruikt.</p></section><div id="adminError"></div><div class="admin-grid"><div class="stat"><strong id="statUsers">—</strong><span>gebruikers</span></div><div class="stat"><strong id="statTokens">—</strong><span>toegewezen tokens</span></div><div class="stat"><strong>${templates.length}</strong><span>goedgekeurde sjablonen</span></div></div><section class="panel"><h2 class="section-title">Gebruikers & tokenbudget</h2><p class="section-sub">Een gebruiker moet in Microsoft Lists staan voordat die kan genereren.</p><div id="users"></div><div class="actions" style="margin-top:18px"><input id="newEmail" placeholder="leerkracht@school.be"><input id="newTokens" type="number" min="0" value="100000" style="max-width:170px"><button class="btn primary" id="addUser">Gebruiker toevoegen</button></div></section><section class="panel template-admin" style="margin-top:18px"><h2 class="section-title">Goedgekeurde sjablonen</h2><p class="section-sub">Pas beschrijving en systeemprompt aan. Wijzigingen worden in Microsoft Lists opgeslagen wanneer Lists is geconfigureerd.</p><div id="templateAdmin"></div></section><section class="panel" style="margin-top:18px"><h2 class="section-title">Technische status</h2><div id="setup" class="setup"></div></section>`;
  try{const [users,setup]=await Promise.all([api('/api/admin/users'),api('/api/admin/setup')]);renderUsers(users);renderTemplateAdmin();renderSetup(setup);$('#addUser').onclick=addUser}catch(e){$('#adminError').innerHTML=`<div class="error">${escapeHtml(e.message)}</div>`}
}
function renderUsers(users){
  $('#statUsers').textContent=users.length;$('#statTokens').textContent=users.reduce((a,u)=>a+Number(u.allocated||0),0).toLocaleString('nl-BE');
  $('#users').innerHTML=users.map(u=>`<div class="admin-row"><div><strong>${escapeHtml(u.name||u.email)}</strong><br><small>${escapeHtml(u.email)} · ${escapeHtml(u.role||'Leerkracht')}</small></div><input id="budget-${u.id}" type="number" min="0" value="${Number(u.allocated||0)}"><span>${Number(u.used||0).toLocaleString('nl-BE')} gebruikt</span><button class="btn secondary" onclick="saveUser('${escapeHtml(u.email)}','${escapeHtml(String(u.id))}')">Opslaan</button></div>`).join('')||'<p class="status">Nog geen gebruikers.</p>';
}
async function addUser(){const email=$('#newEmail').value.trim().toLowerCase();if(!email){toast('Vul een e-mailadres in.');return}try{await api('/api/admin/users/'+encodeURIComponent(email),{method:'PUT',body:JSON.stringify({allocated:Number($('#newTokens').value||0),active:true})});toast('Gebruiker opgeslagen.');renderAdmin()}catch(e){toast(e.message)}}
window.saveUser=async(email,id)=>{try{await api('/api/admin/users/'+encodeURIComponent(email),{method:'PUT',body:JSON.stringify({allocated:Number($('#budget-'+CSS.escape(id)).value||0),active:true})});toast('Tokenbudget opgeslagen.');renderAdmin()}catch(e){toast(e.message)}};
function renderTemplateAdmin(){
  $('#templateAdmin').innerHTML=templates.map(t=>`<details><summary><strong>${escapeHtml(t.title)}</strong> — ${escapeHtml(t.description)}</summary><div class="field" style="margin-top:14px"><label>Beschrijving</label><input id="desc-${escapeHtml(t.id)}" value="${escapeHtml(t.description)}"></div><div class="field"><label>Systeemprompt</label><textarea id="prompt-${escapeHtml(t.id)}" style="min-height:170px">${escapeHtml(t.prompt)}</textarea></div><button class="btn primary" onclick="saveTemplate('${escapeHtml(t.id)}')">Sjabloon opslaan</button></details>`).join('')||'<p class="status">Geen sjablonen gevonden.</p>';
}
window.saveTemplate=async id=>{try{const d=await api('/api/admin/templates/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({description:document.getElementById('desc-'+id).value,prompt:document.getElementById('prompt-'+id).value})});templates=templates.map(t=>t.id===id?d:t);toast('Sjabloon opgeslagen.')}catch(e){toast(e.message)}};
function renderSetup(s){const items=[['Microsoft Lists',s.listsConfigured],['OpenAI API',s.openaiConfigured],['Entra/API-authenticatie',s.apiConfigured],['SharePoint-site-ID',s.siteIdConfigured]];$('#setup').innerHTML=items.map(([label,ok])=>`<div class="setup-item"><span class="${ok?'ok':'warn'}">${ok?'● Geconfigureerd':'● Nog te configureren'}</span><br>${label}</div>`).join('')}

$('#loginBtn').onclick=login;
$('#logoutBtn').onclick=async()=>{try{if(msalApp)await msalApp.logoutPopup({account})}finally{location.reload()}};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(b.dataset.page==='home')renderHome();if(b.dataset.page==='generate')renderGenerate();if(b.dataset.page==='admin')renderAdmin()});
