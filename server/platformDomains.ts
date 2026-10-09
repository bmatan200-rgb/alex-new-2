import { createHash } from 'node:crypto';

import { PLATFORM_DOMAIN, isPlatformRoot, isPlatformHost } from '../src/utils/platformHost';
export { PLATFORM_DOMAIN, isPlatformRoot, isPlatformHost };
export function platformDomainCandidates(tenantId: string): string[] {
  const digest = createHash('sha256').update(tenantId).digest('hex').slice(0, 12);
  let label = tenantId === 'alex_beauty' ? 'alex' : tenantId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!label) label = 'business';
  if (label === 'alex' && tenantId !== 'alex_beauty') label = 'alex-business';
  if (['www', 'admin', 'super-admin'].includes(label)) label += '-business';
  if (label.length > 50) label = `${label.slice(0, 37).replace(/-$/, '')}-${digest.slice(0, 8)}`;
  return [`${label}.${PLATFORM_DOMAIN}`, `${label.slice(0, 37).replace(/-$/, '')}-${digest}.${PLATFORM_DOMAIN}`];
}
export function tenantLinks(tenant: {id: string; customDomain?: string; platformDomain?: string}, host: string) {
  const domain = tenant.customDomain || tenant.platformDomain || platformDomainCandidates(tenant.id)[0];
  const canonical = `https://${domain}`;
  // Keep old Render links usable until DNS and TLS have actually been connected.
  const canonicalHere = isPlatformHost(host) || host === tenant.customDomain;
  return {testUrl: canonicalHere ? `${canonical}/` : `/?tenant=${encodeURIComponent(tenant.id)}`,
    adminUrl: canonicalHere ? `${canonical}/admin` : `/admin?tenant=${encodeURIComponent(tenant.id)}`,
    domainUrl: `${canonical}/`, platformDomain: tenant.platformDomain || platformDomainCandidates(tenant.id)[0]};
}
export async function resolveHostTenant(host: string, lookup: (host: string) => Promise<string | null>): Promise<string | null> {
  if (!/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(host)) throw Object.assign(new Error('Invalid hostname'), {status: 400});
  // Platform root and legacy Render origins allow explicit tenant selection.
  if (isPlatformRoot(host) || host === 'localhost' || host === '127.0.0.1' || /^[a-z0-9-]+\.onrender\.com$/.test(host)) return null;
  const tenantId = await lookup(host);
  if (!tenantId) throw Object.assign(new Error('העסק בכתובת הזאת לא נמצא'), {status: 404});
  return tenantId;
}
export function selectTenant(boundTenant: string | null, selectors: unknown[], fallback = 'alex_beauty'): string {
  const values = selectors.filter(v => v !== undefined && v !== '');
  if (values.some(v => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(v)) || new Set(values).size > 1)
    throw Object.assign(new Error('Invalid or conflicting tenant selectors'), {status: 400});
  if (boundTenant && values.length && values[0] !== boundTenant)
    throw Object.assign(new Error('הכתובת שייכת לעסק אחר'), {status: 400});
  return boundTenant || (values[0] as string) || fallback;
}

// Read-only allocation phase; callers reserve the returned name in the same transaction.
export async function allocatePlatformDomain(tenantId: string, current: string | undefined,
  ownerOf: (hostname: string) => Promise<string | null>): Promise<string> {
  for (const host of current ? [current] : platformDomainCandidates(tenantId)) {
    const owner = await ownerOf(host);
    if (!owner || owner === tenantId) return host;
  }
  throw new Error(`Business subdomain conflict: ${tenantId}`);
}
