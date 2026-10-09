import { bookingLink } from '../src/utils/accountSecurity';
import test from 'node:test';
import assert from 'node:assert/strict';
import { platformDomainCandidates, allocatePlatformDomain, resolveHostTenant, selectTenant, tenantLinks } from '../server/platformDomains';
import { buildPwaManifest } from '../src/utils/pwa';
const registry = new Map([['alex.mbtorim.co.il', 'alex_beauty'], ['avi.mbtorim.co.il', 'avi']]);
const lookup = async (host: string) => registry.get(host) || null;

test('automatic business addresses are DNS-safe, bounded and have a stable collision alternative', () => {
  assert.equal(platformDomainCandidates('alex_beauty')[0], 'alex.mbtorim.co.il');
  assert.equal(platformDomainCandidates('avi')[0], 'avi.mbtorim.co.il');
  for (const id of ['nail_studio', 'www', '_', 'x'.repeat(128)]) {
    const candidates = platformDomainCandidates(id);
    assert.notEqual(candidates[0], candidates[1]);
    for (const host of candidates) assert.match(host, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.mbtorim\.co\.il$/);
    assert.deepEqual(candidates, platformDomainCandidates(id));
  }
  assert.notEqual(platformDomainCandidates('a_b')[1], platformDomainCandidates('a-b')[1]);
});
test('business hosts resolve only registered businesses and cannot be overridden by headers/body/query', async () => {
  assert.equal(selectTenant(await resolveHostTenant('avi.mbtorim.co.il', lookup), []), 'avi');
  assert.equal(selectTenant(await resolveHostTenant('alex.mbtorim.co.il', lookup), ['alex_beauty', 'alex_beauty']), 'alex_beauty');
  assert.throws(() => selectTenant('avi', ['alex_beauty']), {status: 400});
  assert.throws(() => selectTenant(null, ['avi', 'alex_beauty']), {status: 400});
  await assert.rejects(resolveHostTenant('missing.mbtorim.co.il', lookup), {status: 404});
  await assert.rejects(resolveHostTenant('unknown.example.com', lookup), {status: 404});
  await assert.rejects(resolveHostTenant('invalid/host', lookup), {status: 400});
});
test('old Render installations and root tenant links remain usable', async () => {
  for (const host of ['alex-new-2.onrender.com', 'mbtorim.co.il', 'www.mbtorim.co.il', 'localhost', '127.0.0.1']) {
    assert.equal(selectTenant(await resolveHostTenant(host, lookup), ['avi']), 'avi');
  }
  const old = tenantLinks({id: 'avi'}, 'alex-new-2.onrender.com');
  assert.equal(old.testUrl, '/?tenant=avi');
  assert.equal(old.domainUrl, 'https://avi.mbtorim.co.il/');
  assert.equal(tenantLinks({id: 'avi'}, 'mbtorim.co.il').testUrl, old.domainUrl);
  assert.equal(tenantLinks({id: 'avi', platformDomain: 'avi-123.mbtorim.co.il'}, 'mbtorim.co.il').testUrl, 'https://avi-123.mbtorim.co.il/');
});
test('custom business domains are retained while platform domains remain available', () => {
  const tenant = {id: 'avi', customDomain: 'avi.example.com', platformDomain: 'avi.mbtorim.co.il'};
  assert.equal(tenantLinks(tenant, 'avi.example.com').testUrl, 'https://avi.example.com/');
  assert.equal(tenantLinks(tenant, 'alex-new-2.onrender.com').testUrl, '/?tenant=avi');
});
test('new business PWA uses clean addresses while old Render PWA identities do not change', () => {
  assert.equal(buildPwaManifest('customer', 'avi', 'Avi').start_url, '/?tenant=avi');
  assert.equal(buildPwaManifest('customer', 'avi', 'Avi').id, '/?tenant=avi');
  assert.equal(buildPwaManifest('customer', 'avi', 'Avi', null, true).start_url, '/');
  assert.equal(buildPwaManifest('admin', 'avi', 'Avi', null, true).start_url, '/admin');
});

test('domain allocation is idempotent, preserves existing names and never takes another business name', async () => {
  const owners = new Map<string, string>();
  const ownerOf = async (host: string) => owners.get(host) || null;
  const first = await allocatePlatformDomain('a_b', undefined, ownerOf);
  owners.set(first, 'a_b');
  assert.equal(await allocatePlatformDomain('a_b', first, ownerOf), first);
  const collision = await allocatePlatformDomain('a-b', undefined, ownerOf);
  assert.notEqual(collision, first);
  owners.set(collision, 'a-b');
  assert.equal(await allocatePlatformDomain('a-b', collision, ownerOf), collision);
  await assert.rejects(allocatePlatformDomain('wrong', first, ownerOf), /conflict/);
  owners.set(platformDomainCandidates('a-b')[0], 'other');
  owners.set(platformDomainCandidates('a-b')[1], 'another');
  await assert.rejects(allocatePlatformDomain('a-b', undefined, ownerOf), /conflict/);
});

test('sharing a new-domain booking link keeps the clean business address', () => {
  assert.equal(bookingLink('https://avi.mbtorim.co.il/admin', 'avi'), 'https://avi.mbtorim.co.il/');
  assert.equal(bookingLink('https://alex-new-2.onrender.com/admin', 'avi'), 'https://alex-new-2.onrender.com/?tenant=avi');
  assert.notEqual(platformDomainCandidates('alex')[0], platformDomainCandidates('alex_beauty')[0]);
});
