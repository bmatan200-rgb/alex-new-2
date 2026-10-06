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

assert.equal(pkg.version, '26.0.1');
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

// V26.0.1 regression guards.
assert.match(app, /setCurrentUser\(getStoredUserSession\(\)\)/);
assert.doesNotMatch(app, /Clear only the customer session/);
assert.match(app, /addAppointmentToFirestore\(newApp as any, tenantId, \{ asAdmin: true \}\)/);
assert.doesNotMatch(storage, /removeItem\(`booking_access__\$\{tenantId\}`\)/);
assert.match(firebase, /auth:options\.asAdmin\?'required':'none'/);
assert.match(firebase, /if\(!options\.asAdmin\)/);
assert.match(authModal, /tenantId, \{ auth: 'none' \}/);
assert.doesNotMatch(torFlow, /upsertCustomerToFirestore/);
assert.match(server, /getAll\(\.\.\.refs\)/);

console.log('V26 source verification passed');
