import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const database = 'sapoov-central-identity';
const persist = resolve(project, '.wrangler', 'organization-registry-test');

function run(args, label) {
  const result = spawnSync('npx', ['--yes', 'wrangler', ...args], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', NO_D1_WARNING: 'true' },
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(label + ' failed.\n' + (result.stderr || '') + '\n' + (result.stdout || ''));
  }
  return result.stdout || '';
}

function parseJson(output, label) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(label + ' did not return JSON.\n' + output);
  try { return JSON.parse(output.slice(start, end + 1)); }
  catch { throw new Error(label + ' returned invalid JSON.\n' + output); }
}

function findRows(value, expectedKeys) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    if (value.length && value[0] && typeof value[0] === 'object' &&
        expectedKeys.every(key => Object.prototype.hasOwnProperty.call(value[0], key))) return value;
    for (const item of value) { const found = findRows(item, expectedKeys); if (found) return found; }
    return null;
  }
  for (const child of Object.values(value)) { const found = findRows(child, expectedKeys); if (found) return found; }
  return null;
}

console.log('Applying all migrations to a dedicated local-only D1 database…');
run(['d1', 'migrations', 'apply', database, '--local', '--persist-to', persist], 'Local D1 migrations');

const sql = `SELECT
  (SELECT COUNT(*) FROM organizations) AS organization_count,
  (SELECT COUNT(*) FROM organizations WHERE organization_type='institution') AS institution_count,
  (SELECT COUNT(*) FROM organization_locations) AS location_count,
  (SELECT COUNT(*) FROM organization_locations l JOIN organizations o ON o.id=l.organization_id WHERE o.slug='cvo-groeipunt') AS cvo_location_count,
  (SELECT COUNT(*) FROM organization_locations l JOIN organizations o ON o.id=l.organization_id WHERE o.slug='cvo-groeipunt' AND (l.general_phone='' OR l.general_phone IS NULL)) AS cvo_missing_phones,
  (SELECT COUNT(*) FROM organizations WHERE lower(display_name) LIKE '%buggenhout%') + (SELECT COUNT(*) FROM organization_locations WHERE lower(display_name) LIKE '%buggenhout%') AS buggenhout_count,
  (SELECT COUNT(*) FROM (SELECT institution_number FROM organizations WHERE institution_number<>'' GROUP BY institution_number HAVING COUNT(*)>1)) AS duplicate_institution_number_groups,
  (SELECT COUNT(*) FROM organizations WHERE status<>'draft') AS non_draft_organization_count,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_violation_count,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_module_access') AS module_access_table,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='team_memberships') AS team_memberships_table,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_scoped_role_assignments') AS scoped_roles_table,
  (SELECT COUNT(*) FROM organization_location_sources s JOIN organization_locations l ON l.id=s.location_id JOIN organizations o ON o.id=l.organization_id WHERE o.slug='cvo-groeipunt' AND (s.source_url NOT LIKE 'https://%' OR s.source_url='')) AS invalid_cvo_source_urls;`;
const raw = run(['d1', 'execute', database, '--local', '--persist-to', persist, '--command', sql, '--json'], 'Local D1 invariant query');
const parsed = parseJson(raw, 'Local D1 query');
const keys = ['organization_count','institution_count','location_count','cvo_location_count','cvo_missing_phones','buggenhout_count','duplicate_institution_number_groups','non_draft_organization_count','foreign_key_violation_count','module_access_table','team_memberships_table','scoped_roles_table','invalid_cvo_source_urls'];
const rows = findRows(parsed, keys);
if (!rows || rows.length !== 1) throw new Error('Could not find the expected invariant result row.\n' + raw);
const row = rows[0];
const expected = {
  organization_count: 10,
  institution_count: 8,
  location_count: 19,
  cvo_location_count: 11,
  cvo_missing_phones: 0,
  buggenhout_count: 0,
  duplicate_institution_number_groups: 0,
  non_draft_organization_count: 0,
  foreign_key_violation_count: 0,
  module_access_table: 1,
  team_memberships_table: 1,
  scoped_roles_table: 1,
  invalid_cvo_source_urls: 0
};
for (const [key, value] of Object.entries(expected)) {
  if (Number(row[key]) !== value) throw new Error(key + ': expected ' + value + ', received ' + row[key]);
}
console.log('Local D1 integration checks passed: 10 organizations, 8 institutions, 19 locations, 11 CVO campuses; no FK, status, uniqueness or source URL violations.');
