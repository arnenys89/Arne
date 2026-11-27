import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(resolve(here, '../data/organization-registry.seed.json'), 'utf8'));
const organizations = seed.organizations;
const institutions = organizations.filter(x => x.organization_type === 'institution');
const keys = new Set(organizations.map(x => x.stable_key));

assert.equal(organizations.filter(x => x.organization_type === 'umbrella').length, 1, 'exactly one current umbrella is expected in the initial seed');
assert.equal(organizations.filter(x => x.organization_type === 'school_board').length, 1, 'exactly one current school board is expected in the initial seed');
assert.equal(institutions.length, 8, 'the initial scope must contain exactly eight education institutions');
assert.equal(new Set(organizations.map(x => x.institution_number).filter(Boolean)).size, institutions.length, 'institution numbers must be unique in the seed');

for (const org of organizations) {
  if (org.parent_key) assert.ok(keys.has(org.parent_key), `missing parent organization: ${org.parent_key}`);
  const locationKeys = (org.locations || []).map(x => x.stable_key);
  assert.equal(new Set(locationKeys).size, locationKeys.length, `duplicate location key under ${org.stable_key}`);
  assert.ok(!(org.locations || []).some(x => /buggenhout/i.test(x.display_name + ' ' + x.official_name)), 'Buggenhout must not be imported');
}

const byKey = new Map(organizations.map(x => [x.stable_key, x]));
assert.equal(byKey.get('richtpunt-campus-ninove-zottegem').locations.length, 2, 'Ninove-Zottegem must remain one institution with two locations');
assert.equal(byKey.get('richtpunt-campus-gent-godshuizenlaan').locations.length, 1, 'Gent Godshuizenlaan must have exactly one SAPOOV location');
assert.ok(!byKey.get('richtpunt-campus-gent-godshuizenlaan').locations.some(x => /oudenaarde/i.test(x.display_name + ' ' + x.official_name)), 'Oudenaarde must not be added under Gent Godshuizenlaan');
assert.equal(byKey.get('cvo-groeipunt').institution_number, '131888', 'the latest 2026 source number is used for CVO Groeipunt');
assert.equal(byKey.get('cvo-groeipunt').locations.length, 11, 'the initial CVO import contains the 11 campuses with a secretariat from the 2025-2026 center regulations');
assert.ok(seed.importPolicy.writeToProduction === false, 'the seed must never target production directly');

console.log(`Validated ${organizations.length} organization nodes, ${institutions.length} institutions and ${institutions.reduce((n, x) => n + (x.locations || []).length, 0)} locations.`);
