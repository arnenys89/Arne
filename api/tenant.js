const cache = new Map();

export function isConsumerTenant(tid) {
  return String(tid || '').toLowerCase() === '9188040d-6c67-4c5b-b112-36a304b66dad';
}

export function tenantKey(tid) {
  return String(tid || '').trim().toLowerCase();
}

export function tenantConfig(tid) {
  const key = tenantKey(tid);
  if (!key || isConsumerTenant(key)) return null;
  if (cache.has(key)) return cache.get(key);

  const config = {
    tenantId: key,
    siteId: process.env.SHAREPOINT_SITE_ID || '',
    usersList: process.env.USERS_LIST_ID || process.env.USERS_LIST_NAME || 'AI Gebruikers',
    templatesList: process.env.TEMPLATES_LIST_ID || process.env.TEMPLATES_LIST_NAME || 'AI Sjablonen',
    usageList: process.env.USAGE_LIST_ID || process.env.USAGE_LIST_NAME || 'AI Gebruik'
  };
  cache.set(key, config);
  return config;
}

export function clearTenantCache() {
  cache.clear();
}
