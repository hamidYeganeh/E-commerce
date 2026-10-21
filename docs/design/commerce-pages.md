# Catalog, purchase and administration pages

Implemented on the existing Next.js app; Base44's separate hosted-app workflow was not used to migrate the project. Designly direction preserves Yekan Bakh, RTL flow, the yellow Sera preset and the supplied honey image. The 12ui branch service was attempted and unavailable; no generated branch was represented as completed.

## Pages

- `/products`, `/products/[slug]`: existing database-backed filters/gallery/variants, restyled with the landing's visual system; product details now add to the persistent browser cart.
- `/cart`: quantity/remove controls, loading/error/empty states and server-validated prices/availability.
- `/checkout`: normalized Persian phone/postal digits, field validation, address review, server-calculated shipping/total and gated Zarinpal handoff.
- `/account/orders`, `/account/orders/[id]`: authoritative order/payment/shipment state, restricted to the signed-in owner.
- `/admin`: actual metrics and shortcuts; existing catalog/taxonomy/editor retained.
- `/admin/orders`, `/admin/orders/[id]`: search/status filters, counts, immutable item snapshots, totals, address permission gating, timeline, notes, processing, unpaid cancellation, full-order shipment/tracking and delivery.

Reference: the split cart/order-summary arrangement and inline quantity/removal controls were informed by the [adidas cart](https://mobbin.com/screens/669358ee-a750-4f11-87ad-0534c5aa0f6c) and [Uvodo cart](https://mobbin.com/screens/800bf175-4c86-4a33-8807-37fb05bcccfe). Actual screens were inspected; no reference screenshots are shipped as site content.

## Local catalog decisions

The user approved 1,000,000 IRR per 900g honey jar (100,000 toman). Their affirmative response to the proposed setup was interpreted and communicated as 50 initial units and fixed 600,000 IRR shipping (60,000 toman). These values are applied in the local database/config. `scripts/prepare-honey.ts` records an audit and assigns initial stock once using a stable movement key. Do not automatically rerun it as a recurring seed; future prices and stock changes belong in catalog/inventory administration.

Database/Redis containers run locally through Compose. Migrations and foundation seed were applied. Temporary QA staff/customer/order records and the test session were removed after browser verification; final stock is 50 on hand, 0 reserved and no test orders remain.

## Purchasing and payment boundaries

Cart persistence stores only variant IDs/quantities. The server ignores client prices. Address stays in component memory; the checkout retry fingerprint in session storage is SHA-256, not the address itself. Orders need a real verified session and phone. The same checkout key cannot create a second order, and its payload cannot change. Catalog and sorted stock locks plus conditional versions protect reservations; snapshots preserve the order's original prices. No coupon behavior is simulated.

Zarinpal adapter uses explicit IRR, fixed official hosts, network timeouts, request/verify/inquiry endpoints, and environment-specific provider identities. No merchant secret or bank response is logged or returned to the browser. Callback query status never proves payment; only server verification consumes reservations and confirms an order. Callback replays are idempotent. Explicit request rejection cancels/releases; ambiguous transport outcomes retain reservations for review. Definitive FAILED/REVERSED inquiry releases reservations. A periodic worker rechecks expired pending attempts before deciding anything about inventory.

References: [official connection/verification](https://www.zarinpal.com/docs/paymentGateway/connectToGateway), [sandbox](https://www.zarinpal.com/docs/paymentGateway/sandBox), [currency](https://www.zarinpal.com/docs/paymentGateway/moreFeatures/currency), [inquiry](https://www.zarinpal.com/docs/paymentGateway/otherMethods/Inquiry).

Real payment remains disabled by default. Activation requires `ZARINPAL_MERCHANT_ID`, an explicit `SHIPPING_FLAT_RIAL`, and `CHECKOUT_ENABLED=true`; use sandbox first and `ZARINPAL_SANDBOX=false` only on the HTTPS production origin. Keep the worker running with the same environment (e.g. `node --env-file=.env.local --import tsx src/workers/main.ts`). Kavenegar credentials/template are also required for actual customer OTP login. No real bank transaction was made or claimed.

An uncertain request that returned no authority is marked NEEDS_REVIEW and keeps inventory reserved. This exceptional case still requires an operator to reconcile against the merchant dashboard; it is deliberately never auto-cancelled or marked paid. Paid cancellation/refunds, returns and partial shipments remain outside this implementation. The admin cancellation action is limited to unpaid orders without pending/uncertain transactions. Production launch requires a support procedure for those cases and a real sandbox-to-live acceptance run.

## Validation

- Unit suite, full existing integration suite and eight focused commerce integration cases passed.
- Isolated real PostgreSQL, multiple connections: two buyers competing for the final unit create one reservation/order; concurrent callback replay creates one sale movement. `npm run test:checkout-concurrency` reproduces this using a disposable database and removes it afterward.
- Production webpack build and TypeScript/ESLint passed.
- Browser: actual catalog/detail/add-to-cart; cart quantity changes reprice to 260,000 toman for two jars plus shipping; checkout empty-field errors and Persian-digit address normalization; gated payment; staff redirect when unauthenticated; temporary authorized staff processing→shipment→delivery succeeded.
- Native desktop and 390px mobile screenshots inspected; document width equals viewport. Evidence under `.data/commerce-qa/` includes checkout-mobile, admin-orders-desktop and admin-order-mobile. QA order screenshots intentionally show clearly named temporary data.

## Visual refresh — 2026-10-18

Added generated honey still-life banners, a breakfast editorial story, tactile product stages, an olive purchase card, a warm cart summary and checkout step indicator. The shop, information pages, authentication and admin surfaces share the existing Sera preset. Buttons, inputs, selects, textareas and tables in auth/catalog/admin now render shared shadcn primitives; product options and stock filters use RadioGroup and Checkbox. Product records, pricing, permissions and payment activation rules are unchanged.

Motion uses the existing progressive Reveal and verbatim transitions.dev number, badge, success and accordion recipes, tuned to 250ms / 40ms and restrained distances. Reduced-motion guards remain. New copy is included in the Persian next-intl catalog. Image prompts and final files are recorded in commerce-refresh-images.md.

References inspected through Mobbin: [Savor](https://mobbin.com/sites/sections/fe1d2bf2-b322-4d2c-8b81-0043fc0a47cb) for warm editorial photography and [Yellowbird](https://mobbin.com/sites/sections/85c49435-dbab-4310-974d-26eb5516e46c) for restrained yellow accents. Designly guided composition. 12ui corpus acquisition and one resume both returned an ambiguous response; no generated 12ui reference was available. Base44 was not used to move or rebuild the existing Next.js application.

Validation: ESLint, TypeScript and a production Webpack build passed; all 10 unit tests passed. Browser checks covered desktop listing/product/admin and 390px cart/information/admin layouts, actual add-to-cart and server repricing, mobile filters including empty results, FAQ interaction and reduced-motion emulation. At 390px, document width equals viewport width. Temporary admin/order QA fixtures and the signed session were removed; persisted stock is still 50 with zero reserved and no orders. Production page navigation recovered in a fresh HTTP tab after the original preview tab retained its server-restart error document. No new verified Next.js feedback candidate was retained in this request.
