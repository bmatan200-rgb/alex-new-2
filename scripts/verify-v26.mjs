import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '26.0.0');
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

console.log('V26 source verification passed');
