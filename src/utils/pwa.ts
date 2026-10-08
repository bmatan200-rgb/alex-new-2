import { businessAdminIconAssetUrl, isBusinessAdminIconId } from './businessAdminIcons';

export type PwaRole = 'customer' | 'admin' | 'super-admin';

export function pwaRoleForPath(pathname: string): PwaRole {
  if (pathname === '/super-admin' || pathname.startsWith('/super-admin/')) return 'super-admin';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  return 'customer';
}

export function pwaMetadata(role: PwaRole, tenantId: string, tenantName: string, adminIcon?: string) {
  const tenantQuery = `tenant=${encodeURIComponent(tenantId)}`;
  if (role === 'super-admin') return {
    name: 'סופר אדמין',
    manifestHref: '/manifest.json?app=super-admin',
    icon: '/pwa-super-admin-192x192.png',
  };
  return {
    name: role === 'admin' ? `${tenantName} — ניהול` : tenantName,
    manifestHref: `/manifest.json?${role === 'admin' ? 'app=admin&' : ''}${tenantQuery}`,
    icon: isBusinessAdminIconId(adminIcon)
      ? businessAdminIconAssetUrl(adminIcon, tenantName) || '/apple-touch-icon.png'
      : role === 'admin' ? '/pwa-admin-192x192.png' : '/apple-touch-icon.png',
  };
}

export function buildPwaManifest(role: PwaRole, tenantId: string, tenantName: string, adminIcon?: string) {
  const customerUrl = `/?tenant=${encodeURIComponent(tenantId)}`;
  const startUrl = role === 'super-admin' ? '/super-admin'
    : role === 'admin' ? `/admin?tenant=${encodeURIComponent(tenantId)}` : customerUrl;
  const name = role === 'super-admin' ? 'סופר אדמין'
    : role === 'admin' ? `${tenantName} | ניהול העסק` : `${tenantName} | קביעת תורים`;
  const iconPrefix = role === 'super-admin' ? '/pwa-super-admin' : role === 'admin' ? '/pwa-admin' : '/pwa';
  return {
    name,
    short_name: role === 'super-admin' ? name
      : role === 'admin' ? `${tenantName.slice(0, 17)} · ניהול` : tenantName.slice(0, 24),
    description: role === 'super-admin' ? 'ניהול העסקים במערכת'
      : role === 'admin' ? 'ניהול היומן והעסק' : 'קביעת תורים אונליין',
    // Keep existing customer identities stable; management apps get their own identities.
    id: startUrl,
    start_url: startUrl,
    scope: role === 'super-admin' ? '/super-admin' : role === 'admin' ? '/admin' : '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: role === 'super-admin' ? '#0f172a' : role === 'admin' ? '#2563eb' : '#7c3aed',
    lang: 'he',
    dir: 'rtl',
    icons: role !== 'super-admin' && isBusinessAdminIconId(adminIcon) ? [
      { src: businessAdminIconAssetUrl(adminIcon, tenantName) || '/apple-touch-icon.png', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ] : [
      { src: `${iconPrefix}-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: `${iconPrefix}-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
