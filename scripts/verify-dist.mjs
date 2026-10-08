import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const server = readFileSync('dist/server.cjs', 'utf8');
assert.match(server, /api\/customer\/register/, 'built server is missing /api/customer/register');
assert.match(server, /api\/register-webhook/, 'built server is missing the legacy registration compatibility route');
assert.match(server, /API route not found/, 'built server is missing the API catch-all');
assert.ok(server.indexOf('api/customer/register') < server.indexOf('API route not found'), 'built API catch-all precedes customer registration');
assert.match(server, /38\.0\.0/, 'built server does not contain V38.0.0 version marker');

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const clientText = files('dist').filter(p => /\.(js|html)$/.test(p) && !p.endsWith('server.cjs')).map(p => readFileSync(p, 'utf8')).join('\n');
assert.match(clientText, /\/api\/customer\/register/, 'built browser bundle is missing the customer registration API call');
console.log('V38 dist verification passed');
