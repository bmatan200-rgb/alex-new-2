# V26.0.0 — Super Admin + Customer Registration deployment fix

## Fixed
- The canonical Super Admin account `bmatan200@gmail.com` no longer depends on Firebase `emailVerified` in order to enter `/super-admin`.
- Global Super Admin access is still restricted server-side to that exact Firebase Auth email; stale `role=super_admin` claims on any other account do not grant access.
- Firestore Rules were aligned with the server: exact Super Admin email + `super_admin` claim is required, but `email_verified` is not.
- `/api/health` now returns the application version so a Render deployment can be verified immediately.
- `/api/customer/register` is the canonical customer registration route; `/api/register-webhook` now uses the same validated tenant-scoped persistence for backward compatibility with older cached clients.
- Production smoke coverage verifies that the registration route exists in the built `dist/server.cjs` and is not swallowed by the generic `API route not found` handler.

## Tenant isolation retained
- Business Admin remains limited to its bound `tenantId` and `ownerAuthUid`.
- Super Admin may manage any tenant without switching Firebase users.
- Customer registration writes only under the resolved tenant path: `tenants/{tenantId}/customers/{customerId}`.

## Deploy verification
After deployment, open `/api/health`. It must report `version: 26.0.0` before testing customer registration or Super Admin.
