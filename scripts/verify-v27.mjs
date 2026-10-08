import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/utils/storage.ts', import.meta.url), 'utf8');
const firebase = readFileSync(new URL('../src/lib/firebase.ts', import.meta.url), 'utf8');
const authModal = readFileSync(new URL('../src/components/AuthModal.tsx', import.meta.url), 'utf8');
const torFlow = readFileSync(new URL('../src/components/TorModalFlow.tsx', import.meta.url), 'utf8');
const installPrompt = readFileSync(new URL('../src/components/AddToHomePrompt.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const manifestRoute = server.slice(server.indexOf("app.get('/manifest.json'"), server.indexOf("app.param(['tenantId','id']"));
const serviceWorker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');

assert.equal(pkg.version, '38.0.1');
assert.match(server, /const PRIMARY_SUPER_ADMIN_EMAIL = 'bmatan200@gmail\.com'/);
assert.match(server, /if \(email === PRIMARY_SUPER_ADMIN_EMAIL\) \{/);
assert.doesNotMatch(server, /email === PRIMARY_SUPER_ADMIN_EMAIL && currentUser\.emailVerified/);
assert.match(rules, /request\.auth\.token\.email == 'bmatan200@gmail\.com'/);
assert.doesNotMatch(rules, /request\.auth\.token\.email_verified/);

const registerPos = server.indexOf("app.post('/api/customer/register'");
const catchAllPos = server.indexOf("app.use('/api',(_req,res)=>res.status(404)");
assert.ok(registerPos > 0, 'customer registration route is missing');
assert.match(server, /app\.post\('\/api\/register-webhook', registerCustomer\)/, 'legacy registration compatibility route is missing');
assert.ok(catchAllPos > registerPos, 'API catch-all appears before customer registration route');
assert.match(server, /version:APP_VERSION/);
assert.match(server, /authorizeTenant\(admin,\[req\.body\?\.tenantId,req\.query\.tenant,req\.headers\['x-tenant-id'\]\]/);
assert.match(server, /tenant\.data\(\)\?\.ownerAuthUid !== decoded\.uid/);

// V26.0.1 session and booking-performance regression guards.
assert.match(app, /setCurrentUser\(getStoredUserSession\(\)\)/);
assert.doesNotMatch(app, /Clear only the customer session/);
assert.match(app, /addAppointmentToFirestore\(newApp as any, tenantId, \{ asAdmin: true \}\)/);
assert.doesNotMatch(storage, /removeItem\(`booking_access__\$\{tenantId\}`\)/);
assert.match(firebase, /auth:options\.asAdmin\?'required':'none'/);
assert.match(firebase, /if\(!options\.asAdmin\)/);
assert.match(authModal, /tenantId, \{ auth: 'none' \}/);
assert.doesNotMatch(torFlow, /upsertCustomerToFirestore/);
assert.match(server, /getAll\(\.\.\.refs\)/);

// V38 professional icon branding and tenant-specific install prompt guards.
assert.match(installPrompt, /pwa-install-opt-out:\$\{tenantId\}/, 'install dismissal is not business-scoped');
assert.match(installPrompt, /localStorage\.setItem\(optOutKey, '1'\)/, 'permanent dismissal is not persisted');
assert.match(installPrompt, /pwa-install-complete:\$\{tenantId\}/, 'completed installation is not business-scoped');
assert.doesNotMatch(installPrompt, /הוספתי למסך הבית/, 'manual confirmation button must not be shown');
assert.match(installPrompt, /type="checkbox"/, 'dismissal must use a checkbox');
assert.match(installPrompt, /beforeinstallprompt/);
assert.match(installPrompt, /standalone\?: boolean/);
assert.match(installPrompt, /Share.* באייפון|באייפון או באייפד/);
assert.match(main, /serviceWorker\.register\('\/service-worker\.js'/);
assert.match(manifestRoute, /buildPwaManifest\(role, tenantId, tenantName, adminIcon\)/);
assert.match(manifestRoute, /role === 'super-admin'/);
assert.match(manifestRoute, /adminIcon = await ensureTenantAdminIcon\(tenantId\)/, 'customer and admin manifests must share the tenant icon');
assert.match(server, /tenant-admin-icons\/:iconId\.svg/);
assert.match(readFileSync(new URL('../src/utils/businessAdminIcons.ts', import.meta.url), 'utf8'), /Twenty-four/);
assert.match(readFileSync(new URL('../src/pages/SuperAdmin.tsx', import.meta.url), 'utf8'), /BUSINESS_ICON_CATEGORIES/);
assert.match(server, /BUSINESS_ADMIN_ICON_TAKEN/);
assert.match(server, /tenantAdminIcons/);
assert.match(readFileSync(new URL('../src/pages/SuperAdmin.tsx', import.meta.url), 'utf8'), /בחרו סמל/);
assert.match(serviceWorker, /skipWaiting/);
assert.doesNotMatch(serviceWorker, /caches\.open|caches\.match/, 'PWA worker must not cache customer or booking data');


// V29.0.1 regression guards: explicit customer logout must stay logged out,
// and opening the new-business wizard must never reuse Super Admin credentials.
assert.match(storage, /localStorage\.removeItem\(STORAGE_KEY_USER_SESSION\)/, 'legacy Alex customer session is not cleared on logout');
const superAdmin = readFileSync(new URL('../src/pages/SuperAdmin.tsx', import.meta.url), 'utf8');
assert.match(superAdmin, /resetTenantForm\(\); setActiveTab\('onboarding'\)/, 'new-business wizard does not reset to blank values');
assert.match(superAdmin, /<form onSubmit=\{handleSubmit\} autoComplete="off"/, 'onboarding form may be browser-autofilled');
assert.match(superAdmin, /name="new-business-owner-email"[\s\S]*?autoComplete="off"/, 'new owner email may reuse signed-in credentials');
assert.match(superAdmin, /name="new-business-owner-password"[\s\S]*?autoComplete="new-password"/, 'new owner password may reuse signed-in credentials');
assert.doesNotMatch(torFlow, /executeBookingSubmission\(cleanName, cleanPhone, isAdmin\)/, 'obsolete booking argument remains');

assert.match(readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8'), /getBusinessAdminIconDetails\(tenant\.adminIcon/);
assert.match(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), /getBusinessAdminIconDetails\(tenant\.adminIcon/);
console.log('V38 icon source verification passed');
