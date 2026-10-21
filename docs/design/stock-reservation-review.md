# StockReservation implementation and current-source review

Date: 2026-10-18. The owner previously selected review of current code rather than a commit comparison. This request implements the next Strong architecture candidate from the PaymentAttempt review. Source snapshots of the touched files were captured before editing; this does not claim a commit-level branch review. Specs: GLOSSARY.md, docs/domain-rules.md and ADR-001 in docs/architecture.md. There is no issue-tracker configuration.

## Implementation

`src/modules/inventory/reservations.ts` now owns reserve, release and consume. It receives the caller's Prisma transaction; it creates no connection, independent transaction or provider request. Reserve sorts variant locks, rereads stock and performs guarded increments. It returns the reservation rows that checkout persists with its Order in the same transaction. Price mismatch, stock failure or failed Order persistence rolls back every stock increment.

Release and consume reread persisted reservations under the Order lock, then acquire sorted variant locks. Only ACTIVE reservations transition; repeating the same terminal effect is a no-op and the opposite terminal transition is rejected. Release decrements reserved only; consume decrements reserved and onHand together and writes the existing unique SALE event key. Conditional status updates provide a second check before completion. A foreign Order's payment cannot be used to consume stock.

Authorization, cancellation rules, PaymentAttempt verification, Order transitions, timeline and audit remain with their existing callers. Unknown gateway results retain stock. Network calls remain outside database transactions. No migration, payment activation or UI behavior change is needed for this extraction.

## Standards

Independent Standards review: **0 hard violations, 0 actionable judgment smells** in the bounded reservation extraction. Transaction scope, lock order, documented module responsibility and domain vocabulary are preserved. The private shared implementation with named release/consume operations improves locality and is not an actionable Middle Man smell. Test coverage was added after that initial review and executed by the parent.

## Spec

Independent Spec review: **0 findings** in the bounded extraction.

- “در یک تراکنش … رزرو موجودی، ساخت snapshot سفارش/آدرس/اقلام و payment attempt”: returned reserve rows and Order commit together.
- “ACTIVE → CONSUMED یا RELEASED؛ وضعیت نهایی دوباره اثر نمی‌گذارد”: terminal replay is once-only, opposite transitions fail.
- “آزادسازی رزرو فقط بعد از شکست قطعی مجاز است”: failure/cancel eligibility remains in callers; unknown outcomes do not release.
- “عملیات مجاز بر اساس permission و وضعیت” and “reserve/consume/release با قفل مرتب‌شده”: authorization and sorted locking remain.
- “snapshot هستند” and “ارتباط شبکه با درگاه خارج از قفل دیتابیس است”: snapshot and bank-call placement remain.

Counts: Standards0 / Spec0; neither axis identified a worst issue in this extraction.

## Security follow-up

The separately invoked Codex Security review found a low-severity open-redirect issue in the pre-existing login return-path check. A decoded TAB in a path could be removed by URL parsing and produce an external navigation. `safeReturnPath` now rejects all ASCII controls and backslash, canonicalizes against a fixed origin, enforces that origin and rejects normalized login/API loops. Regression tests cover decoded query input, all ASCII controls, dot segments, auth fragments and the legitimate checkout return.

The security scan retains original source evidence with the remediation disposition. Its scope is modules plus relevant callers; it is an offline static review, not a production deployment certification. The implementation fix happened during scanning, so its initial snapshot identity must not be presented as a final-tree certificate. Token measurement is unavailable unless the scan supplies a measured value.

## Validation

- 37 integration tests passed, including eight new reservation tests for atomic multi-variant reserve, failure rollback, idempotent release/consume, conflicting terminal state, guarded settlement rollback, foreign-payment rejection and invalid input.
- 12 unit tests passed, including the added return-path security regression.
- Disposable real PostgreSQL multi-connection verification passed: last-unit contention, concurrent callback replay, same-Customer fresh-key quota, invoice continuation, concurrent release and consume-versus-release. No provider was contacted and no live stock was changed.
- ESLint and TypeScript passed. Production build and authentication regression results are recorded after completion below.

## Architecture report

A separate HTML report in the OS temporary directory illustrates before/after StockReservation locality and the deferred Product eligibility candidate. No new DB adapter was introduced; PostgreSQL and PGlite tests exercise the existing transaction seam.

Final verification: 10 authentication tests also passed (59 total across unit/integration/auth), alongside the disposable PostgreSQL concurrency checks. Production Webpack build succeeded. No production data was changed by tests. The local development preview was stopped for the build and restarted afterward.

Codex Security scan `65bb305f-4eda-4a9c-9060-009a9a05e0a9` completed successfully; original low-severity redirect evidence and its fixed-source disposition are retained in the generated report. The scan's worktree-change warning reflects the authorized return-path correction during review. No remaining reportable issue was identified in the scoped static inspection. Token measurement was unavailable.

Next.js feedback pass: no new qualifying framework issue retained in this request; ordinary compilation and development reloads did not require a framework feedback report.
