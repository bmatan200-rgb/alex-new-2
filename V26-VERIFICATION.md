# V26 verification record

Checks executed while preparing this ZIP:

- `node scripts/verify-v26.mjs` — PASS.
- TypeScript/TSX syntax transpile across 41 `.ts/.tsx` files using TypeScript 5.x parser — PASS.
- Direct core tenant-isolation checks for `authorizeTenant` — PASS:
  - business admin own tenant allowed;
  - business admin other tenant rejected;
  - super admin target tenant allowed;
  - invalid traversal tenant ID rejected.
- Secret scan for embedded service-account private keys / Telnyx key values — no embedded secret found.

Full `npm ci`, Vite/esbuild build and Firebase emulator integration execution could not be completed in the packaging environment because npm registry downloads returned DNS `EAI_AGAIN`. This is why V26 makes `verify:source` and `verify-dist` part of the normal Render build: a Render deploy cannot complete successfully if the registration API is missing from the built server/client bundle.

Deployment acceptance check:
1. `GET /api/health` must return `version: 26.0.0`.
2. Sign in as `bmatan200@gmail.com` and open `/super-admin`.
3. Sign in as a business owner and verify another tenant is denied.
4. Register one test customer and confirm no `API route not found` message appears.
