const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconText = (icon) => ({'shopping-cart':'B','calendar':'A','graduation-cap':'P','calendar-check':'C','book-open':'R','layout-dashboard':'D','network':'N'}[icon] || '•');
async function api(path) {
  const response = await fetch(path, { headers: { 'accept':'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function start() {
  try {
    const data = await api('/api/me');
    $('identity').textContent = data.user.display_name || data.user.email;
    $('message').textContent = `Aangemeld als ${data.user.email}. Je ziet de toepassingen waarvoor je toegang hebt.`;
    $('apps').innerHTML = data.applications.length ? data.applications.map(app => `
      <a class="app" href="${esc(app.url || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="app-icon">${esc(iconText(app.icon))}</span><h3>${esc(app.name)}</h3><p>${esc(app.description)}</p>
      </a>`).join('') : '<div class="message">Er zijn nog geen toepassingen aan je account toegewezen.</div>';
    if (data.superadmin) {
      $('admin').classList.remove('hidden');
      const [users, audit] = await Promise.all([api('/api/admin/users'), api('/api/admin/audit')]);
      $('users').innerHTML = users.users.map(u => `<div class="table-row"><span>${esc(u.display_name || u.email)}<br><small>${esc(u.email)}</small></span><span>${u.application_count} apps · ${esc(u.status)}</span></div>`).join('') || 'Nog geen gebruikers.';
      $('audit').innerHTML = audit.events.map(e => `<div class="table-row"><span>${esc(e.action)}<br><small>${esc(e.actor_email)}</small></span><span>${esc(e.created_at)}</span></div>`).join('') || 'Nog geen gebeurtenissen.';
    }
  } catch (error) {
    $('message').textContent = error.message;
    $('apps').innerHTML = '';
  }
}
start();
