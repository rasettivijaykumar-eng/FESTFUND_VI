# FestFund Security Audit

**Audit phase:** Phase 0
**Scope:** Existing repository as inspected in the workspace
**Date:** 2026-11-19

## 1. Executive Summary

FestFund uses a TypeScript Express API, MongoDB/Mongoose, JWT authentication stored in an HTTP-only cookie or Bearer header, a React/Vite frontend, Cloudinary or local filesystem uploads, and optional Twilio/Meta WhatsApp notifications.

The project has a useful shared festival access function in `server/src/services/access.service.ts`, but object-level authorization is inconsistent. Most list and create operations derive a Fest ID and call `loadFestivalForActor`, while several update/delete/download operations first perform an ID-only lookup and only then check the returned record's festival. This allows cross-festival information or authorization behavior to depend on whether a controller leaks a 404 versus 403, and it creates bypass and race risks. Private downloads and uploaded files also need additional protection.

The WhatsApp implementation has raw-body support and some signature checking, but it currently mixes Twilio and Meta behavior and lacks a deduplication/event ledger, explicit monotonic status transitions, idempotent outbound sending, and retry/dead-letter handling.

## 2. Existing Implementation

### Frontend

- React 19, React Router 7, TypeScript, Vite, TanStack Query, Axios, Zod, Recharts, Tailwind CSS.
- Uses server API routes under `/api` and supports admin, committee, vendor, and public visitor flows.
- Production static frontend deployment is described in `render.yaml`.

### Backend

- Node.js/Express/TypeScript ESM server.
- MongoDB/Mongoose models.
- Passwords use bcrypt; JWT verification is in `server/src/middleware/auth.ts`.
- CORS, Helmet, cookie parsing, JSON raw-body capture, and global rate limiting are configured in `server/src/app.ts`.
- API routes are centralized in `server/src/routes/index.ts`.

### Authentication and Authorization

`requireAuth`:

- Accepts an HTTP-only cookie or Bearer token.
- Reloads the user from MongoDB for the current role and status.
- Rejects pending committee members.
- Populates `req.auth` with `id`, `role`, `festId`, name, and email.

`requireRoles` performs route-level role checks.

`loadFestivalForActor` checks:

- ADMIN: festival exists and `festival.createdBy` equals the authenticated admin.
- COMMITTEE: approved auth context Fest ID matches the requested festival; admin-only writes are denied.
- All other roles: 403.

This is a good foundation for festival ownership, but it needs an object-level `findOne({ _id, festId })` helper and consistent use across all mutations and downloads.

### Models and Ownership

Festival-owned models contain `festId` plus a festival ObjectId where applicable:

- `Festival`: `festId`, `createdBy`
- `Donor`: `festId`, `festival`, `createdBy`, `submissionId`
- `Expense`: `festId`, `festival`, `addedBy`, bill fields
- `Event`: `festId`
- `GalleryItem`: `festId`, `festival`, uploaded-by fields
- `AdminNote`: `festId`, `festival`, author fields
- `CommunityMessage`: `festId`, `festival`, sender fields
- `Receipt`: `receiptNo`, `festId`, `festival`, donor
- `CommitteeMember` / `CommitteeRequest`: `festId`
- `Notification`: user-scoped, type, link
- `Vendor` / `Advertisement`: vendor/user-scoped rather than one festival

### Forecasting and Anomaly Detection

The financial advisor in `server/src/services/financialAdvisor.service.ts` calculates an in-product forecast using:

- Pace estimate: `current / progress`
- Historical median
- Weight `paceWeight = min(0.85, max(0.5, progress))`
- Formula: `paceEstimate * paceWeight + historicalMedian * (1 - paceWeight)`

There is no external forecast implementation in the inspected repository; the `/analytics/forecast` endpoint is an optional HTTP forecast service and otherwise reports no estimate.

Expense anomaly detection is a modified median/deviation threshold:

- Requires at least five prior same-category records.
- Baseline is the category median.
- Median absolute deviation is computed.
- Threshold is `max(baseline * 2, baseline + medianDeviation * 3)`.

It excludes future records in `reviewExpenseForAnomaly` by filtering `createdAt < expense.createdAt`, although historical order and equal timestamps need validation.

Budget alerts are generated in `classifyBudgetThreshold` at crossing 80% and 100% spend thresholds.

### Test and Deployment Configuration

- Server tests use Node's built-in `node:test`, `tsx`, `mongodb-memory-server`, and direct handler invocation.
- One existing integration suite is `server/tests/whatsapp.integration.test.ts`.
- Root dependencies include Jest, Supertest, ts-jest, and Autocannon, but no working cross-festival or load test suite is present.
- `render.yaml` contains production services and secrets supplied through environment variables.
- The repository has no CI workflow, k6/Artillery script, Python evaluation suite, or usability/SUS tooling in the inspected structure.

## 3. Security Vulnerabilities

### High: ID-only record lookups

The following mutations or downloads load a record only by `_id` before festival checks:

- Donor update/delete
- Expense update/delete
- Event update/delete
- Gallery delete/download
- Note delete
- Community message delete
- Report receipt lookup/PDF
- WhatsApp donor resend

The cross-festival return then depends on an `loadFestivalForActor` call with the record's own `festId`. While this often results in 403/404, it does not establish a festival-scoped database lookup at the data access boundary and may permit existence inference or TOCTOU behavior.

The committee request lookup and vendor/ad lookups also need event-specific review under the centralized model, although the route role may restrict some resources.

### High: Public receipt, report, and donor data routes

Public routes expose information based on a Fest ID and record ID:

- `GET /api/public/festivals/:festId/donors/:donorId/receipt`
- `GET /api/public/festivals/:festId/reports/:type`
- Public festival/community endpoints

Public receipt generation includes donor name and amount in a PDF. Public reports include donor names, mobile values, expenses, and aggregate records. These routes may intentionally support public transparency, but they expose sequential or predictable identifiers and require an explicit privacy policy and non-sequential/public token design.

The public receipt/report routes should not be assumed private. If they are intended private, authentication and record scoping are required.

### High: Public or unprotected media

- `GET /api/gallery/:id/download` is unauthenticated.
- Local uploads are mounted as `app.use('/uploads', express.static(...))`.
- Cloudinary URLs are stored and returned directly.
- Expense bills and note attachments are not protected by dedicated download endpoints.
- Uploaded file names use timestamp plus original name for local storage, while URLs for Cloudinary are public HTTPS URLs.

Cloudinary `secure_url` values and `/uploads/*` URLs can permit direct access regardless of API authorization.

### Medium: Public community chat

Public chat requires only a valid festival and permits guest display names. It is intentionally public, but media is stored with Cloudinary/local URLs. Spam, attachment abuse, and guest impersonation need moderation controls and tamper-resistant file links.

### Medium: Client-supplied Fest IDs

Several create operations accept `festId` in request data and rely on `loadFestivalForActor`. This is functionally checked for ADMIN and COMMITTEE, but it is not consistently derived from session membership. It should never be the sole authorization source.

`loadFestivalForActor` derives the admin's relationship from `Festival.createdBy`; committee derives it from `req.auth.festId`. Vendor and donor contexts are not first-class in the current auth model. Donors have no account role.

### Medium: Search and analytics may exceed intended scope

Review required:

- `/api/analytics` has a festival scope helper, but vendors and community models may still leak aggregate/public metadata.
- `/api/search` restricts by admin ownership or committee Fest ID, but should have negative tests.
- Report advertisements query all ads for the `advertisements` report and role/ownership should be explicit.
- Nearby vendors intentionally exposes public vendor location metadata.

### Medium: Input and rate-limit gaps

- Global 400-request/15-minute limit is broad.
- Auth routes have 40 attempts/15 minutes.
- Public chat has 30 messages/10 minutes.
- WhatsApp resend has 10 attempts/15 minutes.
- Receipt/report/public routes do not have endpoint-specific rate limits.
- Public download URLs are not expiring.
- Global JSON limit is 2 MB, separate from multipart limits.

### Medium: Production cookie/CORS assumptions

Auth relies on cookies and CORS. Production cookie settings should be confirmed during deployment. Cross-origin credentials require exact allowed origins and HTTPS; wildcard origins are not used. `render.yaml` does not configure several WhatsApp legacy variables and relies on synchronized secrets.

## 4. Missing Authorization Checks

- Add a centralized `getFestivalOwnedRecord(model, recordId, festId)` helper.
- Replace ID-only lookups with `{ _id: recordId, festId: authenticatedFestId }` or equivalent ObjectId ownership fields.
- Derive authorized Fest IDs from `req.auth`, not untrusted request fields.
- Add explicit 401/403/404 semantics:
  - 401: no valid authentication.
  - 403: valid actor lacks role or festival relationship.
  - 404: record absent or outside authenticated festival context.
- Cover donor, contribution, expense, receipt, gallery, note, chat, report, committee, bill/document, event, and notification resources.
- Review advertiser/vendor ownership separately: vendor ownership is `user`/`vendorUser`, not necessarily Fest ID.
- Ensure public routes are intentionally public and do not expose PII accidentally.
- Do not permit admin A to modify/admin B by supplying the B Fest ID or B object ID.
- Add no-leak tests that confirm the response body and headers contain no Festival B fields.

## 5. WhatsApp Integration Weaknesses

### Signature Verification

The service supports both Twilio and Meta signatures:

- Meta uses `X-Hub-Signature-256`, HMAC-SHA256 over raw bytes, and `timingSafeEqual`.
- Raw body capture exists only for `/api/whatsapp/webhook` JSON requests.
- Twilio relies on `x-twilio-signature` and URL/parameter or raw HMAC behavior.

Missing or weak areas:

- Controller reads `x-twilio-signature`, not `X-Hub-Signature-256` for a Meta webhook.
- Meta signature verification is in the service but controller routing is Twilio-oriented.
- The Twilio raw fallback compares a base64 HMAC but may not be the canonical provider validation required for status callbacks.
- Webhook status processing does not persist a deduplication/event ledger.
- No replay timestamp window is enforced.
- No concurrent deduplication key exists.

### Sending and Retries

- `sendDonationReceipt` is called after receipt/contribution creation.
- Duplicate contributions use `submissionId` to avoid repeated donor creation.
- Resend blocks based on status and can return 409, but outbound Meta/Twilio sends are not idempotency-keyed.
- Failures are recorded as status values, but no exponential retry queue or retry-count state exists.
- HTTP 429 and retryable 5xx responses are not automatically retried.
- Permanent errors and retry exhaustion are not modeled separately.
- The Meta and Twilio branches use separate mechanisms and error classes.

### Status Updates

- Meta status can move in arbitrary order because `processWhatsAppWebhook` assigns the reported status directly.
- Twilio status has no monotonic guard.
- `read -> delivered -> sent` regressions are possible.
- Failure terminal states may be overwritten by later status callbacks.
- Status timestamps are not used to reject stale events or out-of-order callbacks consistently.
- Delivery failures can send repeated notifications because `alreadyFailed` is checked in memory before save but duplicate callbacks are not atomic.

### Event and Database Reliability

No database model exists for:

- Provider event ID or message ID deduplication.
- Event type and received timestamp.
- Processing status/result.
- Outbound idempotency key.
- Retry count, next retry time, terminal failure/dead-letter state.

Message status is embedded in `Donor`; this is insufficient for an auditable event ledger and concurrent duplicate processing.

### Logging

Some provider errors are redacted and status callbacks do log IDs. Additional controls are needed:

- No access tokens or app secrets in logs.
- Do not log donor phone numbers or names.
- Keep provider error codes and sanitized reason text.
- Store no raw webhook body or authorization headers.
- Avoid including mobile numbers in Webhook/Twilio errors.

## 6. Media and Document Security

### Existing

- Multer validates MIME types and size for images, video, community attachments, bills, and notes.
- Cloudinary stores uploads when configured; otherwise a timestamped local filename is written.
- Local `/uploads` is served statically and is not authenticated.
- Gallery download is unauthenticated and looks up by MongoDB `_id`.
- Receipt PDF is protected by auth and a role check but not festival-scoped at lookup.
- Bill and note URL fields are returned directly and have no dedicated authorization endpoint.

### Missing

- Private-download route authentication and festival ownership checks.
- Cloudinary signed or transformed download URLs with expiry.
- Unguessable private resource identifiers.
- Authorization validation before redirect or `res.download`.
- Cache-control/no-store headers for private PDFs and documents.
- Receipt filename/content protections against enumeration.
- Deletion of Cloudinary/local objects when records are deleted.
- Malware/virus or document parsing validation beyond MIME type.
- Content-sniffing protections and safe download headers.

## 7. Testing Gaps

- No cross-festival isolation suite currently exists.
- Existing WhatsApp tests are primarily unit/integration handler tests and use MongoDB memory server.
- No test for public receipt/report/document leakage.
- No test for ID-only lookup bypasses.
- No Twilio/Meta HTTP fault-injection suite with nock/MSW-equivalent mocks.
- No explicit webhook database deduplication tests.
- No concurrent duplicate webhook test.
- No load testing script or separate 50/100/200 VU configuration.
- No forecast accuracy, budget alert, anomaly benchmark, or SUS usability tooling.
- No CI workflow to prevent regressions.
- No production migration test for indexes or webhook models.

## 8. Deployment and Secret Review

- `render.yaml` uses `sync: false` for database and provider secrets and a generated `JWT_SECRET`.
- Production server refuses startup only if `MONGODB_URI` or `JWT_SECRET` is missing; stronger provider validation can remain at feature-use time.
- `server/.env` and frontend environment files must remain out of source control.
- API and client origins must match in `CLIENT_URL` and `VITE_API_URL`.
- Cloudinary credentials and WhatsApp credentials are server-only.
- Local uploads are ephemeral on Render and can disappear across deployments.
- No secret scanning or `.env`/CI policy is currently visible.

## 9. Recommended Changes (Priority)

### Phase 1A: Object Authorization

1. Implement `getFestivalOwnedRecord(model, recordId, festivalId)` and add a `req.auth.festId`-based context helper.
2. Add explicit status mapping for 401/403/404.
3. Replace ID-only owner lookups for donors, expenses, events, gallery, notes, community messages, receipts, and WhatsApp resend.
4. Add centralized no-leak tests for every resource category.

### Phase 1B: Media

1. Remove unauthenticated direct gallery download.
2. Protect `/uploads` and bill/attachment URLs.
3. Add authenticated festival-scoped document routes.
4. Use Cloudinary signed URLs or short-lived signed API download URLs.
5. Add random private IDs and cache/no-store headers.

### Phase 1C: WhatsApp Reliability

1. Preserve raw JSON bytes and validate Meta HMAC-SHA256 or Twilio signature using the provider-specific canonical method.
2. Add webhook event ledger and unique message/event index.
3. Add idempotency keys, retry state, exponential backoff, retry classification, and dead-letter state.
4. Enforce monotonic sent/delivered/read transitions.
5. Add replay protection and timestamp tolerance without rejecting delayed legitimate events.

### Phase 1D: Public Transparency

1. Document which routes are intentionally public.
2. Remove PII from public reports and public receipts unless explicit consent/privacy requirements permit it.
3. Replace sequential receipt exposure with public opaque tokens if public receipts remain required.
4. Add public-route rate limits and content moderation controls.

### Phase 2: Validation

1. Build isolated cross-festival test fixtures for two synthetic festivals and all roles.
2. Use the existing Node test runner and Mongo memory server.
3. Test read/write/delete and direct media access concurrently.
4. Add mocked WhatsApp fault injection tests.

### Phase 3: Evaluation

1. Import only authorized/anonymized historical financial records.
2. Implement leave-one-festival-out forecast and baseline evaluation.
3. Evaluate budget alert classification and anomaly methods on identical historical datasets.
4. Record that no real or synthetic accuracy claim is valid without supplied data.

### Phase 4: Operations

1. Add staging-only k6 load profiles for 50/100/200 VUs.
2. Configure dedicated staging rate-limit policy.
3. Add CI build/test/secret scanning checks.
4. Add migration/index verification.

## 10. Current Residual Risk

Until the object-level and media changes are implemented, the application should be treated as having:

- **High** cross-festival authorization risk for unprotected object/download endpoints.
- **High** private-media/direct-URL risk.
- **Medium** public PII/report risk.
- **Medium** WhatsApp replay, duplicate, status regression, and retry risk.
- **Medium** insufficient automated security regression coverage.

No security claim in this audit should be interpreted as passing cross-festival validation until tests are executed against an isolated database.

## 11. Phase 0 Findings Required for Implementation

Files created or modified: `docs/SECURITY_AUDIT.md`.

Important code changes: none. This phase was read-only.

Relevant tests run: none required; no implementation was changed.

Remaining issues:

- Centralized object authorization not yet implemented.
- Protected media routes not yet implemented.
- WhatsApp event ledger/retries/status monotonicity not yet implemented.
- Cross-festival and fault-injection suites not yet written.
- Evaluation and usability files not yet created.

## 12. Phase 1 Implementation Status

Implemented:

- Shared `getFestivalOwnedRecord` helper in `server/src/services/access.service.ts`.
- Festival-scoped object lookups for donor, expense, event, gallery, note, community message, committee request, receipt, and WhatsApp resend mutations.
- Authentication added to gallery download.
- Protected bill and note attachment download routes added.
- Static public `/uploads` middleware removed.
- Private cache-control headers added for protected gallery and receipt responses.

Validation:

- Server TypeScript build passed.
- Existing WhatsApp integration suite passed 5/5 tests.
- Cross-festival isolation test file was created and has no editor diagnostics.
- Cross-festival executable validation did not complete because MongoDB memory-server initialization stalled; no unauthorized-leak pass is claimed.

Remaining work:

- Complete cross-festival test execution in a reliable isolated database environment.
- Replace remaining direct public receipt/report behavior if it is intended private.
- Replace Cloudinary direct URLs with signed expiring downloads for private resources.
- Proceed to WhatsApp event ledger, retries, idempotency, and monotonic status updates.

**Phase 0 and Phase 1 implementation work is complete. Cross-festival runtime validation remains pending approval and a stable test environment.**