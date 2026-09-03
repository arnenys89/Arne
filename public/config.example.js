// Alleen publieke waarden. NOOIT client secrets of OPENAI_API_KEY.
// De gebruikerslogin gebruikt Microsoft "common": werk/school + persoonlijke accounts.
window.EDUCATION_AI_CONFIG = {
  clientId: 'YOUR-ENTRA-APP-CLIENT-ID',
  authority: 'https://login.microsoftonline.com/common',
  apiScope: 'api://YOUR-ENTRA-APP-CLIENT-ID/access_as_user'
};
