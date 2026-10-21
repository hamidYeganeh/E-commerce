# PaymentAttempt reconciliation: implementation and current-source review

Date: 2026-10-19. The owner authorized review of current code rather than a commit comparison. Only the initial commit exists; the previous Worker source was captured in an OS temporary snapshot before this change. This is a bounded current-source review. Requirements: docs/domain-rules.md payment rules 3–7 and ADR-001 in docs/architecture.md. No issue tracker is configured; the owner previously requested continuing current-source review.

## Implementation

`src/modules/payments/reconciliation.ts` now owns bounded discovery, conditional retry claims, per-attempt failure isolation and summary counters. The Worker adapter retains runtime configuration and construction of ZarinpalProvider. No new invoice is requested during reconciliation. The provider dependency and clock are explicit at the module interface; tests use the same interface with disposable databases and a fake provider.

Discovery retains the existing conditions: at most 10 PENDING/NEEDS_REVIEW attempts, the configured provider, updated more than 15 minutes ago, with an expired AWAITING_PAYMENT Order. Oldest timestamps are ordered first with id as a stable tie-breaker. A conditional DB update repeats eligibility and compares the selected authority and exact updatedAt before touching updatedAt to claim one retry window. A stale selection or another Worker that loses the claim does not call the provider.

This is a bounded cooldown using the existing retry timestamp, not an indefinite exclusive lock or exactly-once guarantee. Crash or provider/settlement failure becomes eligible after the same 15-minute interval; the timestamp also moves a poison attempt out of the next due batch so later attempts can progress. A long future provider operation that exceeds the interval may overlap another check. Callback/customer checks are not excluded by this claim and remain safe through the existing Order lock and once-only inventory effects.

Provider verification runs outside DB transactions and uses existing verifyCheckout for all financial decisions. Definite failure may release stock through that path; clock expiry, missing authority, exceptions and unknown results never release it. Missing authority is conditionally marked NEEDS_REVIEW with a bounded manual-reconciliation failure code; concurrent terminal states or late authority assignment are not overwritten. Exceptions are counted without logging provider response contents, authority, address, customer fields or error text.

Worker ticks now catch Outbox and reconciliation failures independently. Outbox failure does not skip reconciliation. A payment failure is logged as payment reconciliation rather than Outbox dispatch failure. Production batch logging contains aggregate counters only. No schema migration, UI change, payment activation or live inventory edit was required.

## Standards

Independent review: **0 hard documented-standard violations, 0 actionable judgment smells**. The module preserves timeout-versus-failure rules, provider call placement, shared financial settlement, current timestamp/authority claims and safe logging. Runtime configuration stays in the adapter; discovery/claim/error behavior gains locality in a real module with a testable interface. Tests exercise actual DB behavior and provider interactions rather than mirror helper implementation.

## Spec

Independent review: **0 findings**.

- “batch max10 … same provider … expired awaiting Orders older15min”: all conditions retained for discovery and repeated on claim.
- “آزادسازی رزرو فقط بعد از شکست قطعی مجاز است”: unknown, missing authority and errors retain stock; definite failure uses existing verification.
- “provider outside DB locks” and “idempotent settlement”: provider call remains outside transactions, with existing locked settlement and no invoice creation.
- “per-item error isolation + fair retry”: errors do not block later attempts, and cooldown allows progress beyond a failing batch.
- “Outbox failure does not prevent reconciliation”: independent catches preserve both tick responsibilities.

Counts: Standards 0 / Spec 0; neither axis identified a worst issue.

## Validation

- 58 integration tests passed, including 5 new reconciliation tests for per-item errors, terminal outcomes, cooldown and retry, unknown results, missing authority, provider/time/status discovery filters, callback overlap and progress beyond a page of 10 failures.
- After the final exact-timestamp CAS guard, all 5 reconciliation tests passed again.
- 12 unit tests passed. TypeScript and ESLint passed after the final source edits.
- Disposable real PostgreSQL multi-connection checks passed, including the new three-Worker reconciliation race: one successful claim, one provider verification, one SALE and reserved stock returning to zero. Existing last-unit/callback/quota/replay/release/consume races also passed.
- Financial tests use injected providers, no actual bank requests, and disposable databases; no live stock was altered.
- No UI or Next route changed. The local development preview remains running. Production Next build was not repeated for this Worker-only change; final source was typechecked and the changed module exercised directly.

## Architecture

Before: the Worker mixed configuration, discovery, provider construction and a failure-prone batch loop; the tick coupled Outbox success with reconciliation. After: a small reconciliation interface hides bounded selection, CAS retry claims and per-item outcomes; existing verification retains financial responsibility. The deletion test spreads this knowledge back into the Worker if the module is removed. This improves locality and leverage without adding a new DB adapter or repeating settlement rules. No conflict with ADR-001.

Next.js feedback pass: no qualifying framework issue was observed or retained during this Worker-focused request.

Actual Worker process regression also passed against disposable Redis and PGlite: durable Outbox processing, unique repeated dispatch and graceful SIGTERM shutdown. Gateway configuration was explicitly disabled for the child process. Total unique tests passed in this request: 71 (58 integration + 12 unit + 1 Worker/queue integration), in addition to the PostgreSQL concurrency script and focused re-run.

## Security result

Official Codex Security Standard scan `6475bea1-ea5c-4c84-9a63-2a94fdd07112` completed with **0 reportable findings**. Authoritative scope: all four files under `src/modules/payments`; Worker and checkout/inventory callers were read as context. An independent baseline, architecture map and coordinator trace examined claims, provider verification, once-only settlement, retained stock on unknown outcomes and safe Worker error handling. This is a scoped static inspection, not a scan of every route or a production deployment certification. No source/config changes or provider calls were made by the scan. Daybreak advisory access was unavailable and nonblocking. Measured token usage was unavailable.

Generated report: `/Users/mahdi/.codex/state/plugins/codex-security/scans/honey-commerce/ad5c5e137518b0d5f0aeb6c8f8ade8d43ee86e43_20261018T204935Z_rjha2wgr/report.md`.

The finalizer detected broader working-tree changes and kept its original snapshot identity. Production source remained frozen during security inspection; documentation and test execution continued. Do not describe it as an immutable certificate of the entire final working tree. Previous sealed reports were not changed.
