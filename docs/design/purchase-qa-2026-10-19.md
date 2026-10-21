# Purchase and order-management QA — 2026-10-19

The current working source was reviewed and exercised; most implementation files are untracked and HEAD remains the initial commit. This was not a historical commit-range review. The user previously requested current-source review instead of supplying a new baseline. `docs/agents/issue-tracker.md` is absent; issue-tracker integration would require `/setup-matt-pocock-skills`, but the conversation and existing order/domain documentation supplied this task's acceptance criteria.

## Changes verified

- Verified financial settlement subtracts purchased quantities from the persisted cart in the same transaction as payment, stock and order changes. An owned, once-only `cart.settled` receipt lets the browser reconcile its pending checkout without erasing later quantities or sibling variants. Failed or uncertain payments retain their cart selection.
- Account cart writes carry owner, expected activity version and a UUID mutation key. `CartWriteReceipt` preserves the original write result even after later edits or a lost response. The browser records pending writes before sending, resolves owned receipts before rebasing, retains uncertain 5xx/timeout outcomes and guards account switches. Receipts currently have no age-based expiry; deleting an unacknowledged receipt would break recovery. The migration is additive and was applied to the local store.
- Public callbacks, customer recovery and reconciliation share a per-payment 60-second verification claim before external verification. Provider calls stay outside database transactions; uncertainty never releases reservations. A customer recovery result also requests cart synchronization on the same route.
- Editing a reviewed delivery address retains all six field values. Checkout attempt fingerprints include the cart owner. Zero-total orders have an accurate explanation that no bank payment occurs.
- Account/session cards use shadcn composition; session and admin-order callouts use Alert.
- Global PageMotion no longer mutates streamed React/NextImage attributes before their hydration. Functional screens use short CSS entrances; existing hero/ritual wrappers use supported CSS scroll timelines. Landing Reveal/ScrollScene retain their own scoped GSAP lifecycle. Reduced-motion and print handling remain in place.
- Cart requests have a 15-second timeout and are aborted on route cleanup; failed reads retry after a delay. Web Locks serialize browser load/rebase/save work. A guest-cart merge is attempted once per route lifecycle rather than on every local edit.

## Standards

Initial review found one grouped shadcn composition/callout finding in account/session/order-control UI. It was corrected. Existing documented money, ownership, snapshot and reservation rules remained intact. Architecture changes were restricted to the cart settlement/write-receipt seam needed by reproduced faults; no unrelated restructuring was performed.

Standards: 1 grouped finding corrected; no remaining finding established in the bounded review.

## Spec

Initial review found that purchased lines were never consumed, and identified absent HTTP acceptance coverage. Follow-up review caught lost-response write duplication, a receipt-less read racing checkout creation and stale-account metadata writes. They were addressed with transactional receipts, idempotent writes and request/owner guards. Address-edit data loss was also corrected.

Spec: 1 initial purchase-flow finding corrected, plus follow-up recovery defects corrected. The full requested feature catalogue was not re-audited by this purchase QA task.

## Automated verification

- 18 unit tests passed, including atomic local receipt application, subsequent quantities, owner isolation, and acknowledging a submitted baseline before rebasing later edits.
- 99 integration tests passed. Coverage includes authoritative totals, coupon quota, product eligibility, successful/failed/uncertain/free checkout, ownership, inventory, cart settlement rollback/replay, order preparation/packing/shipping/delivery and reports.
- 10 authentication tests passed.
- Real local PostgreSQL concurrency checks passed using a newly created/dropped test database: last-unit checkout, callback settlement, same-customer keys, reservation release/consume, worker reconciliation and concurrent cart-write replay. Providers were injected in-process.
- Twelve HTTP acceptance checks passed against the disposable UI server: malformed/unknown/wrong-gateway callbacks, Status=NOK without fabricated settlement, anonymous account access, rejected customer admin mutation, cross-origin rejection, customer-vs-MFA-staff invoice/label access, and another user's order returning not-found.
- A later repeat of the HTTP batch hit its 20-second development-server timeout. It does not replace the earlier completed batch. Final lint and typecheck passed. The production build completed successfully; it retains five existing Turbopack warnings about dynamic local media filesystem paths causing broad output tracing. Those media-storage/deployment warnings were not silently suppressed or changed in this purchase-flow task.

The first broad integration run had a PGlite/Prisma count-result error in an existing catalog rollback test. The standalone catalog rerun and both subsequent complete suites passed; no unsupported product fix was made for that transient fixture result.

## Browser acceptance

Synthetic customers and MFA staff were seeded in a separate disposable PostgreSQL database. A test-only 100% coupon plus free shipping exercised the real zero-total checkout HTTP path without a bank. No simulated payment endpoint was added to production.

Verified in the browser:

1. Honey variant selection, quantity changes and cart totals.
2. Persian delivery address normalization, shipping selection, coupon recalculation, and retained address on edit.
3. A confirmed zero-total order; authoritative paid confirmation and no bank redirect.
4. One-time local cart receipt: quantity 0, pending checkout false, settlement marker present.
5. Admin start-preparation, packed/ready state, carrier/tracking submission and customer-visible tracking.
6. Mobile checkout/account/customer order/admin at width 390: document scrollWidth 390. Desktop admin/account at 1440: document scrollWidth 1440.
7. Fresh final account render: no console errors/warnings, no hidden headings. The earlier hydration mismatch was reproduced before removing global DOM mutation; fresh-page verification followed the fix.

Screenshots are local QA artifacts in `.data/flow-qa/`: checkout-mobile.png, account-mobile.png, account-desktop-final.png, customer-shipment-mobile.png, admin-shipped-mobile.png and admin-shipped-desktop.png.

Real OTP entry, actual bank settlement, SMS delivery and physical printer output were not exercised. Positive/failed/uncertain bank outcomes were tested through the production checkout interface with injected providers. Print HTML/permissions were checked; no physical print job was sent.

## Security review

Codex Security Standard scan was scoped to `src/modules/checkout`, with supporting callers read only to understand those controls. Its independent baseline found callback verification amplification; the shared claim fixed it during this task, and independent static follow-up plus concurrency regressions validated the control. No surviving scoped finding was established.

The workbench bound the original working-tree snapshot and warned that files changed during the scan. Its generated report retains the original candidate and remediation disposition; it is not a whole-store certification or a fresh immutable scan of every final file. Daybreak access was not granted, but the local report was generated.

Workbench usage measurement was reported for four rollout threads: total 13,917,757; input 13,880,373; cached input 13,634,816; output 37,384. These are cumulative rollout counts returned by the tool, not an estimate of tokens spent solely on this task's scoped scan.

## Isolation and cleanup

The disposable UI database was removed. Temporary browser authentication/cart state was restored and QA tabs closed. No bank or SMS provider was contacted. The original local store's product price/stock were checked separately after cleanup. The regular development preview was restored on port 3107 after the final build; health returned HTTP 200.
