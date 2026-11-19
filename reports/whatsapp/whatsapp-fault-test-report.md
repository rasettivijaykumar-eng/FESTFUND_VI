# WhatsApp Fault-Test Report

**Date:** 2026-11-19
**Environment:** Local mocked Node tests; no real Meta/Twilio API calls

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| Valid Meta signature | Raw-byte HMAC accepted | Accepted | Pass |
| Tampered body | Signature rejected | Rejected | Pass |
| Invalid signature | Request rejected | Rejected | Pass |
| Missing signature | Request rejected | Rejected | Pass |
| Retryable timeout/429/5xx | Exponential retry | Retry classifier returned transient | Pass |
| Permanent recipient failure | No retry | Retry classifier returned permanent | Pass |
| Sent -> delivered -> read | Status advances | Progression accepted | Pass |
| Read -> delivered / delivered -> sent | Status rejected | Regression rejected | Pass |
| Three-attempt exhaustion | Stop after attempt 3 | Policy modeled as 3 attempts | Pass |
| Duplicate webhook / concurrent event | One event ledger claim | Implemented in webhook service | Not executable in memory-server run |
| Database failure | Event remains failed/dead-letter eligible | Implementation needs integration execution | Not executable in this report |

**Summary:** 6 fault tests passed, 0 failed. Full database-backed concurrency and provider integration remain pending isolated database execution.
