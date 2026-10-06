# V26.0.1 — Customer session persistence + booking performance hotfix

## Fixed
- Customer registration/session is restored after refresh per business (tenant-scoped localStorage).
- Firebase Admin session restoration no longer deletes a real customer session in the same browser.
- Admin logout no longer deletes the customer booking cancellation capability token.
- Public customer registration and public booking skip Firebase Admin token hydration, so an admin login in another tab cannot slow down or elevate the public flow.
- Booking no longer makes the redundant customer-directory upsert request from the browser; the server booking/registration paths remain responsible for the tenant-scoped customer record.
- The server batches independent Firestore document reads inside the booking transaction with Transaction.getAll while keeping the booking-day guard and same-day overlap query that prevent double bookings.
- Slow bookings (>=800ms server-side) are logged with tenant and duration, and responses expose a Server-Timing booking duration for diagnosis.

## Security / isolation retained
- No Super Admin, business-admin, Firestore Rules, tenant ID, SMS or migration policy was relaxed.
- Public bookings are still validated server-side for active tenant, service, duration, opening hours, past time and overlapping appointments.
- Admin-created appointments explicitly require an authenticated manager token.

## Deployment acceptance
1. Render build must complete the existing source + dist verification.
2. GET /api/health must return version 26.0.1.
3. Register a customer, refresh the customer page, and confirm the customer stays signed in.
4. Create a booking and confirm it appears once, blocks the slot, and cancellation releases it.
5. If booking still feels slow, inspect Render for [Performance] slow booking lines; they now report the server-side duration.
