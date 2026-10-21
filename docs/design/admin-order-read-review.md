# Admin Order read tools and current-source review

Date: 2026-10-19. The owner explicitly authorized current-source review in this chat. Only the initial commit exists; pre-edit list/detail page snapshots were captured before implementation. Requirements come from docs/domain-rules.md admin controls, ADR-001 in docs/architecture.md and the existing permission model. No issue tracker is configured.

## Delivered behavior

Admin Order listing now supports name/order number with Persian or Arabic digits, full normalized mobile number matching the Customer account or recipient snapshot, Order status, an inclusive calendar date range in Tehran, and Orders with NEEDS_REVIEW PaymentAttempts. Filters combine, survive status/pagination links, and reset via a clear action. Dates are explicitly labeled Gregorian; displayed dates use Persian formatting. Invalid or duplicated filters and reversed/impossible dates fail closed with a form error rather than silently broaden results. Pagination is limited to 20 rows and ordered by createdAt/id; status metrics retain every non-status filter.

The new orders/admin-read.ts module places filter validation, DB permission checking, date semantics and allowlisted projections at one seam used by both pages. Every read verifies an active actor with orders.read. Phone matching requires customers.read and financial filtering requires payments.read, including counts. The page's permission hints do not authorize queries. List/count/metrics and detail/payment reads use RepeatableRead snapshots.

Calendar bounds are calculated by PostgreSQL with Asia/Tehran. The inclusive last date becomes the next local midnight; UTC timestamp values are returned explicitly before use in Prisma comparisons. An initial boundary test exposed session-timezone-dependent raw timestamp interpretation; the explicit UTC conversion fixed it. The test now exercises UTC, Asia/Tehran and America/New_York database sessions, checking the exact start, last millisecond and next midnight.

Details now include a read-only payment-history panel for payments.read: bounded provider names, statuses, exact amounts, numeric transaction references and created/updated/verified timestamps. NEEDS_REVIEW has bounded explanations for missing authority/manual follow-up or uncertain results. Authority, idempotency keys, checkout secrets and raw provider failures are not returned. Address and Customer note are selected only with customers.read or shipments.write. No new permission, role grant, mutation, provider request or inventory operation was introduced.

## UI

Existing shadcn preset b6GxvgdZA remains in use. New functionality composes the installed Card, Field, Input, Checkbox, Button, Table, Badge, Alert and Empty components. Labels and new payment/filter messages use next-intl's Persian catalog. These are functional additions to the existing admin layout, not a new visual direction.

The protected live page correctly routed to staff login in the available browser session. No login bypass or live test account was created. The actual new components were rendered with synthetic data in an ignored temporary preview, then inspected in the in-app browser at desktop and 390px. The narrow document stayed 390px wide; the payment table scrolled within its container. Populated/manual-review/success and empty financial states were inspected. This component preview does not claim a signed-in end-to-end admin session was exercised. Screenshot: `.data/admin-read-components.png`.

## Standards

Independent initial review found one low-impact shadcn mismatch: a two-choice NativeSelect. It was replaced with the existing Checkbox representing the single boolean review filter, with Field label/description and form name/value preserved. Independent reread confirmed the finding resolved. Final bounded review: **0 hard violations, 0 actionable judgment smells**. Existing unrelated detail Cards predate this snapshot and were not counted as regressions.

## Spec

Independent Spec review: **0 findings**. The requested order number/mobile/date/status filters and PaymentAttempt visibility are implemented. Server permissions cover sensitive filters and counts, minimal projections omit operational secrets, address access remains separate from finance access, date boundaries/pagination/metrics match the chosen behavior, and financial reads cause no bank or inventory action.

Counts: Standards 0 remaining (1 resolved) / Spec 0; no remaining worst issue in either axis.

## Validation

66 integration tests passed, including 8 new admin read scenarios: role/disabled-user denial; Persian/Arabic order numbers; exact account/recipient phones; financial/address permission separation; date boundaries across three DB timezones; malformed filters; metrics/stable pagination; and bounded payment fields with unchanged financial state. All existing catalog, checkout, reservation and reconciliation regressions passed. 12 unit tests also passed. TypeScript and ESLint passed. Production build and independent security outcome are recorded below after completion.

Tests use disposable databases. No live RBAC, financial state or stock was changed. Source was frozen before the scoped security pass; documentation and build activity continued.

Final form detail: validated/normalized filters populate controls on successful reads, so Persian date digits accepted in URLs display correctly in native date fields. Invalid input remains accompanied by an error and no results. The checked payment filter's rendered native form input was inspected with name=payment, value=review and checked=true.

## Scoped security result

Official Codex Security Standard scan `57c1aa55-40b3-4e15-bbb6-69c6fcca274a` completed with **0 reportable findings**. Scope: the three files under `src/modules/orders`; changed list/detail pages and UI were read as context, including the final normalized form-value change. An independent baseline, architecture map and coordinator trace examined permission checks, sensitive-filter counts, parameterized date predicates, minimal financial/address projections and protected callers. No security correction, configuration change or provider call was needed. Token measurement was unavailable; Daybreak advisory access remained unavailable and nonblocking.

Official generated report: `/Users/mahdi/.codex/state/plugins/codex-security/scans/honey-commerce/ad5c5e137518b0d5f0aeb6c8f8ade8d43ee86e43_20261018T211544Z_zj5mpp1r/report.md`.

The workbench detected wider working-tree changes and kept its original snapshot identity. The contextual form-value correction was reread, while docs/build activity continued. This scoped static inspection is not an immutable certificate for the final entire working tree or a production deployment certification. Prior sealed reports were left intact.

Final production Webpack build succeeded, including final-source TypeScript, all 37 static page generation tasks and route compilation. The earlier in-progress build was deliberately interrupted to include the final normalized form-value correction; the subsequent complete build passed. The synthetic component-preview server was stopped after screenshots were saved. Restart of the local preview is tracked separately: automatic permission review timed out on the first attempt; one permitted retry follows.

Next.js feedback reporting pass: no new qualifying framework issue was retained in this request. The date boundary issue was application/adapter timezone handling, corrected and tested locally, rather than a verified Next.js defect. Build interruptions were intentional lifecycle operations.

The permitted retry successfully started the local Next development process on port 3107; the initial approval timeout required no permission or configuration change.
