# Product purchase eligibility: implementation and current-source review

Date: 2026-10-19. The owner authorized reviewing current code rather than a commit comparison. The pre-edit versions of catalog/repository.ts, checkout/quote.ts and checkout/submit.ts were captured in an OS temporary snapshot. This is a bounded current-source review, not a branch-wide commit review. Requirements come from docs/domain-rules.md, docs/catalog.md, ADR-001 in docs/architecture.md and the existing purchase behavior. No issue tracker is configured.

## Implementation

The catalog/purchase-policy.ts module places the runtime predicate, Prisma filter and parameterized SQL expression at one seam. A Product must be ACTIVE, have media, have a visible primary category, and have no category mapping outside the visible taxonomy. The caller computes taxonomy visibility including ancestor activity within its existing transaction. Public Product reads require at least one active, positively priced ProductVariant; quote and submission check the exact requested ProductVariant. Public projection uses the same priced-variant predicate.

The SQL adapter deliberately uses fixed Product p and ProductVariant v aliases. Price, stock and attribute listing conditions remain on that same v row. An empty visible-category set produces FALSE SQL and cannot accidentally admit uncategorized Products. Missing stock, exhausted stock and reserved stock do not hide an otherwise eligible Product; quantity checking and stock reservation remain separate responsibilities.

RepeatableRead on public reads/quote and the submission catalog advisory lock are retained. No transaction, network call or authorization rule moved. Order snapshots, totals, StockReservation transitions and PaymentAttempt behavior remain in their existing modules. This refactor introduces no new purchase requirement or UI change.

## Standards

Independent review: **0 hard violations, 0 actionable judgment smells**. Money remains bigint, selected-variant validation is retained, stock remains outside eligibility, and SQL alias assumptions are explicit. The module supplies real runtime, Prisma and SQL adapters rather than a hypothetical seam. The integration tests exercise caller interfaces rather than reproduce helper implementation.

## Spec

Independent review: **0 findings**.

- “Product ACTIVE + media + visible primary + all mapped categories visible”: retained in all three representations.
- “Valid sibling must not authorize invalid selected variant”: quote/submission check the requested variant; public projection excludes inactive variants.
- “Missing/out-of-stock product stays public”: catalog eligibility excludes stock; quote/submission enforce availability.
- “Preserve same v alias filters, RepeatableRead and catalog lock”: preserved, along with snapshots/totals/provider lifecycle.
- “Parity coverage and rejection without effects”: integration cases exercise real listing/detail/quote/submission paths and verify rejected requests create no owned Order, payment or reservation and make no provider call.

Counts: Standards 0 / Spec 0; neither axis identified a worst issue.

## Validation

53 integration tests passed, including 16 new purchase-policy scenarios: valid purchase, draft/archived Product, missing media/primary/categories/variants, inactive category/ancestor/secondary category, inactive variant, inactive free variant with valid sibling, empty/fully reserved/missing stock, and no visible taxonomy. Existing same-variant price/stock/attribute and SQL input tests also passed. 12 unit tests passed. TypeScript and ESLint passed.

One test fixture initially mixed a Prisma scalar relation key with a nested relation creation; it was corrected before the full passing run. No production implementation change was needed for that test failure. PostgreSQL concurrency, production build and the independent scoped Codex Security result are recorded below when complete.

Final build verification: the production Webpack build succeeded, including TypeScript, all 37 static page generation tasks and route compilation. The local development preview was stopped for the build and restarted afterward. Disposable real PostgreSQL concurrency checks passed: last-unit contention, duplicate callbacks, same-Customer fresh-key quota/invoice replay, concurrent release and consume-versus-release. Tests used injected providers and disposable data; no bank or live stock changes occurred.

Next.js feedback pass: no new qualifying framework issue was retained in this request. Build and development-server lifecycle verification completed without a framework diagnostic requiring a feedback report.

## Scoped security result

Codex Security scan `14428698-c5c8-4604-a2f3-64d0b9f30b72` completed and generated its official report. The full `src/modules` scope (35 source files) was reviewed, with independent baseline/architecture inspection and a coordinator trace of purchase-policy callers. **0 reportable findings**; no security source correction was needed. This was an offline static review; executable test evidence above is separate. Daybreak advisory access was unavailable and nonblocking. Token measurement was unavailable.

Report: `/Users/mahdi/.codex/state/plugins/codex-security/scans/honey-commerce/ad5c5e137518b0d5f0aeb6c8f8ade8d43ee86e43_20261018T203310Z_pufvabw1/report.md`.

The scan finalizer detected working-tree changes and retained its original snapshot identity. Production module source was frozen during review; documentation/build activity continued. The report must not be represented as an immutable certificate of the entire final working tree.

Restored preview smoke check: `GET /api/catalog/products` returned HTTP 200 with the expected JSON listing structure.
