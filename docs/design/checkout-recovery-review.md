# Current-source review and checkout recovery

Date: 2026-10-18. Scope: current checkout, payments, customer orders and directly related presentation. The owner explicitly chose current-source review; this is not a commit diff review. No issue-tracker configuration exists; acceptance criteria come from the conversation and repository domain rules.

## Standards

Independent Standards review found two documented shadcn violations: the customer order list used a custom empty state, and the order detail used Cards without header/content composition. Both are corrected with Empty and full Card composition.

Two judgment smells remain: product eligibility is duplicated between quote and submission; reservation release logic is duplicated between failure and cancellation paths. These are follow-up deepening opportunities, not tooling failures or blockers to the bounded recovery change. They were not bundled into a broad refactor.

Count: two hard findings corrected; two judgment smells remain. The most consequential remaining smell is duplicated reservation mutation logic.

## Spec

The repository promises owner-bound idempotency and provider-confirmed payment results. Before this change, a successful create followed by a lost response stranded the Customer: replay always raised PAYMENT_IN_PROGRESS. Recovery now returns the same invoice only for the same key/body/owner, matching provider, pending attempt and valid active reservations. It creates no additional invoice, Order or reservation and does not reprice an existing snapshot.

The cart was also removed before gateway navigation; it now remains, together with its attempt key. An Order-owned recovery action can recheck the provider or continue the stored attempt. Unknown and missing-authority outcomes never release inventory or blindly restart payment. Documentation claiming checkout was unimplemented has been updated.

Count: two behavior gaps corrected and one documentation gap corrected. Remaining scope limits: missing-authority manual reconciliation, refunds, partial shipments, cross-device cart and order notifications are not implemented here. Payment activation still needs real configuration and operational acceptance.

## Verification

Integration regressions cover lost responses, unchanged invoice after price changes, owner/hash conflicts, fresh-key quota, disabled continuation, mismatched provider, expiry, terminal replay, unknown results and missing authority. Browser handoff rejects arbitrary hosts, credentials, query parameters, fragments and noninvoice paths.

A per-Customer advisory lock enforces one unresolved checkout across web instances, including fresh UUID keys. The owned POST recheck has a Redis-backed 30-second per-Customer cooldown and retains same-origin/session checks. Redis unavailability fails closed. Real PostgreSQL concurrency tests use a disposable database and injected bank adapters; they never send bank requests.

## Architecture

Top recommendation implemented: deepen PaymentAttempt recovery at a shared continuation/recovery seam. One provider interface has a production Zarinpal adapter and injected test adapters. Shared invoice destination validation serves both browser handoffs. See the separate temporary HTML architecture report for before/after diagrams and remaining candidates.

## Results and security scope

ESLint and TypeScript passed; 11 unit tests and 10 commerce integration tests passed. Real PostgreSQL multi-connection checks passed for last-unit contention, concurrent callback replay, same-Customer fresh-key contention and reuse of the winning invoice. Initial sandbox loopback denial required rerunning the disposable integration database with local loopback permission; the first automatic review timed out, and its allowed retry succeeded.

Codex Security completed scoped Standard scan 05393e21-0912-4bf9-826e-df8ec8a1a3ea. Its original stock-hold candidate was addressed by the per-Customer unresolved-checkout quota and verified by the real PostgreSQL test. The sealed report identifies the original snapshot because source changed during scanning. A subsequent independent current-source reread covered the new recovery route, continuation eligibility and destination guard; it reported no additional issue. This is scoped offline inspection, not certification of a production deployment. Security token measurement was unavailable.

Browser QA: rendered the new recovery card with a temporary Customer-owned Order on desktop and at 390px (document width390, no horizontal overflow). The unconfigured bank check was correctly disabled. HTTP checks returned401 for anonymous,403 for foreign origin,400 for invalid action and400/PAYMENT_NOT_CONFIGURED without merchant configuration; no provider was contacted. Temporary Order, Customer, session and browser cookie were removed after review. Screenshot: `.data/commerce-qa/payment-recovery-desktop.png` (test-only Order).

Next.js feedback pass: no qualifying new framework friction retained; sandbox socket restrictions and a permission-review timeout were environment constraints, resolved on retry.
