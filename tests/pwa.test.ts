import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildPwaManifest, pwaRoleForPath, pwaMetadata } from '../src/utils/pwa';

test('customer, business management and platform management install as distinct apps', () => {
  const manifests = [buildPwaManifest('customer', 'alex_beauty', 'Alex'),
    buildPwaManifest('admin', 'alex_beauty', 'Alex'), buildPwaManifest('super-admin', '', '')];
  assert.equal(new Set(manifests.map(m => m.id)).size, 3);
  assert.deepEqual(manifests.map(m => m.start_url), ['/?tenant=alex_beauty', '/admin?tenant=alex_beauty', '/super-admin']);
  assert.deepEqual(manifests.map(m => m.scope), ['/', '/admin', '/super-admin']);
  assert.equal(manifests[0].id, '/?tenant=alex_beauty', 'existing customer installation must keep its identity');
  assert.equal(manifests[2].name, 'סופר אדמין');
  assert.match(manifests[1].name, /Alex.*ניהול/);
  for (const manifest of manifests) {
    assert.ok(manifest.start_url.startsWith(manifest.scope));
    for (const icon of manifest.icons) assert.ok(existsSync(`public${icon.src}`), `missing icon: ${icon.src}`);
  }
});

test('business apps retain tenant identity while Super Admin is independent of tenant', () => {
  for (const role of ['customer', 'admin'] as const) {
    assert.notEqual(buildPwaManifest(role, 'avi', 'Avi').id, buildPwaManifest(role, 'alex_beauty', 'Alex').id);
    assert.equal(new URL(buildPwaManifest(role, 'avi', 'Avi').start_url, 'https://example.com').searchParams.get('tenant'), 'avi');
  }
  assert.deepEqual(buildPwaManifest('super-admin', 'avi', 'Avi'), buildPwaManifest('super-admin', 'alex_beauty', 'Alex'));
  assert.equal(pwaMetadata('super-admin', 'avi', 'Avi').manifestHref, '/manifest.json?app=super-admin');
});

test('business admin icon choices change tenant manifest artwork without changing install identity', () => {
  const alex=buildPwaManifest('admin','alex_beauty','Alex','flower_purple');
  const avi=buildPwaManifest('admin','avi','Avi','diamond_teal');
  assert.notEqual(alex.icons[0].src,avi.icons[0].src);
  assert.equal(alex.icons[0].type,'image/svg+xml');
  assert.equal(alex.id,'/admin?tenant=alex_beauty');
  assert.equal(avi.id,'/admin?tenant=avi');
  assert.equal(pwaMetadata('admin','avi','Avi','diamond_teal').icon,'/tenant-admin-icons/diamond_teal.svg?name=Avi');
});

test('the selected business identity appears in customer and admin apps for the same tenant', () => {
  const customer = buildPwaManifest('customer', 'avi', 'Avi', 'diamond_teal');
  const admin = buildPwaManifest('admin', 'avi', 'Avi', 'diamond_teal');
  assert.equal(customer.icons[0].src, '/tenant-admin-icons/diamond_teal.svg?name=Avi');
  assert.equal(admin.icons[0].src, customer.icons[0].src);
  assert.equal(customer.id, '/?tenant=avi');
  assert.equal(admin.id, '/admin?tenant=avi');
  assert.equal(pwaMetadata('customer', 'avi', 'Avi', 'diamond_teal').icon, customer.icons[0].src);
});

test('route roles distinguish management routes, nested routes and customer paths', () => {
  for (const path of ['/admin', '/admin/', '/admin/dashboard']) assert.equal(pwaRoleForPath(path), 'admin');
  for (const path of ['/super-admin', '/super-admin/']) assert.equal(pwaRoleForPath(path), 'super-admin');
  for (const path of ['/', '/administrator', '/super-admin-other']) assert.equal(pwaRoleForPath(path), 'customer');
});

test('initial page manifest and Apple metadata select the correct app before React starts', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  for (const [pathname, search, role] of [
    ['/', '?tenant=avi', 'customer'], ['/admin', '?tenant=avi', 'admin'],
    ['/admin/dashboard', '?tenant=alex_beauty', 'admin'], ['/super-admin', '?tenant=avi', 'super-admin'],
  ] as const) {
    const elements: Record<string, any> = {};
    const document = { title: '', querySelector: (selector: string) => elements[selector] ||= { setAttribute(key: string, value: string) { this[key] = value; }, remove() { this.removed = true; } } };
    runInNewContext(script, { window: { location: { pathname, search } }, document, URLSearchParams });
    const actual = new URL(elements['link[rel="manifest"]'].href, 'https://example.com');
    const tenant = new URLSearchParams(search).get('tenant')!;
    const expected = new URL(pwaMetadata(role, tenant, 'Name').manifestHref, 'https://example.com');
    assert.equal(actual.pathname, expected.pathname);
    assert.deepEqual([...actual.searchParams], [...expected.searchParams]);
    if (role === 'admin') assert.equal(elements['link[rel="apple-touch-icon"]'].removed, true);
    if (role === 'super-admin') {
      assert.equal(document.title, 'סופר אדמין');
      assert.equal(elements['link[rel="apple-touch-icon"]'].href, '/pwa-super-admin-192x192.png');
    }
  }
});
