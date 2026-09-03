// Kopieer dit bestand naar public/config.js als je de configuratie niet via /api/config wilt aanbieden.
// Alleen publieke waarden horen hier te staan. NOOIT client secrets of OPENAI_API_KEY.
window.EDUCATION_AI_CONFIG = {
  clientId: 'YOUR-ENTRA-APP-CLIENT-ID',
  tenantId: 'YOUR-ENTRA-TENANT-ID',
  apiScope: 'api://YOUR-ENTRA-APP-CLIENT-ID/access_as_user'
};
