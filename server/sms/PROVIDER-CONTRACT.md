# SMS provider contract and migration

The scheduler calls the provider-neutral gateway in server.ts. HTTP calls and Telnyx response mapping live exclusively in providers.ts. The registry currently implements **Telnyx only**.

## Adapter semantics

- `send(to, text)`: `success: true` means the provider accepted a request and returned a message ID; it never promises delivery. Preserve the ID even if a delivery failure is already known. Accepted messages keep deduplication locks.
- Explicit rate rejection without an accepted ID may set `retryable`, `retryAfterMs`, and `rateLimited`. The scheduler owns retries and caps. An adapter must not independently retry POST calls.
- A timeout, lost response, malformed acceptance, or potentially accepted failure sets `uncertain`. Never fall back to another vendor or resend on uncertain acceptance.
- `lookup(id, expectedPhone)` makes read-only provider calls and returns normalized delivery state. Throw on lookup failures, expired retention, auth errors, malformed replies or recipient/ID mismatches. Lookup failure must not change delivery status.
- Credentials remain server-side. No caller-controlled URLs. Do not log keys or raw provider payloads.
- All normalized errors must be bounded strings. UI renders them as text.

## Routing and migration

Active provider: private settings `provider`, then server `SMS_PROVIDER`, then legacy default `telnyx`. Unknown provider IDs fail closed. Existing Telnyx flat credential fields and environment variables remain supported; optional `providers.telnyx` groups retained credentials for old messages.

New logs and locks record provider identity and message ID. Historical lookup selects the recorded provider, regardless of the active provider. Pre-V41 messages resolve to Telnyx. Preserve old Telnyx credentials during the retention window. Changing an account's key to a different account may make old IDs inaccessible; the UI reports this without resending.

An Inforu implementation must supply send/lookup methods and verified rejection/uncertain semantics, its configuration mapping and credential handling, rate/retention documentation, adapter fixture tests and endpoint integration tests. No changes to reminder keys, tenant boundaries, or scheduler are required to add the adapter. Do not turn the provider setting on until those pieces and live acceptance/delivery checks are complete.

## Delivery checks

`POST /api/sms/logs/:logId/check-delivery` accepts only tenant log IDs. Provider IDs are resolved from server-owned logs or exact legacy lock keys; users cannot query arbitrary IDs from the shared account. A 10-second result cache, per-admin limiter and in-process in-flight guard bound lookups. No background polling or webhook configuration is introduced.

Only the log changes after a lookup. Accepted locks remain locked on delivery failure. Transactions preserve terminal results against slower pending responses. Old UI records without a recoverable ID stay explicitly unverifiable.
