# Motion system

The existing honey visual design is preserved. GSAP owns entrance and scroll choreography; CSS owns button, card, chevron, badge, number, accordion and dialog feedback.

## Coverage

- Landing: spring-settled hero jar entrance; separate scroll layer for the jar, heading and landscape; independently moving/rotating ingredient cutouts; scenic jar; ritual, scenic, footer and editorial background parallax; staggered section headings, bento cards and other existing Reveal groups.
- Storefront: product/category/tag and information banners, product cards, detail gallery and information, descriptions, and editorial stories.
- Functional pages: short surface entrances for cart/address, account cards, authentication cards, admin headings, cards, metrics and operation grids. Cart totals remain stationary; individual inputs and table rows are not staggered.
- Shared interactions: spring-like card return, button press/hover, CTA chevron, active navigation underline, cart badge and changing numbers. Existing shadcn accordion/dialog motion keeps quick dismissal.

## Lifecycle and accessibility

`useGSAP` scopes every animation. `gsap.matchMedia` reverts animations for reduced motion, printing and breakpoint changes. The page controller reverts on pathname changes, ignores hidden retained Next.js routes, and enrolls visible server-streamed content through its media context. Font/image loads and container size changes refresh geometry; there are no per-component native scroll listeners, scroll interception, forced snapping or long pins.

Server HTML starts visible. Reveal uses opacity and transform only, has at most 240ms total stagger, and completes immediately if its content receives focus. Mobile parallax has a smaller travel range. Functional surface entrances take the shared 250ms duration; editorial reveals use 500ms. Print routes skip the shared controller.

Implementation: `src/components/motion`, `src/components/landing/motion.tsx`, `src/styles/page-motion.css`. The existing CSS timing scale is read by GSAP in seconds.

## Verification — 2026-10-19

- Production build, TypeScript and lint pass.
- Chrome at 1200px: hero orbit changed from no inline transform to a translated/rotated transform while scrolling; ingredient progress changed from -1 to approximately -0.57 when entering the section.
- Chrome at 390px: document width remained 390px; the ingredient range restarted at -0.45. Hero and CTA remained readable.
- Changing the browser's reduced-motion preference live removed scene and hero inline motion styles; no Reveal text remained at zero opacity. The override was then cleared.
- Public client navigation to the product listing rendered the banner and catalog. This exposed hidden retained route nodes, which the controller now filters using rendered geometry.
- An isolated PostgreSQL fixture was used for a further admin check. The admin request returned 200, but the browser reported a suspended network connection and subsequent automation timed out. Final admin animation, account and checkout visual verification in this pass is not claimed. No live customer/order data was modified, and the disposable database was removed.
- Screenshots: `.data/motion-qa/landing-desktop.png` and `landing-mobile.png`. They prove layout, not the full temporal animation.

## References

[GSAP React cleanup](https://gsap.com/resources/React/), [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [responsive matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/). Mobbin food-commerce section references informed the restrained product emphasis; static references were not treated as animation specifications.

## Refresh/jank correction — 2026-10-19

The earlier all-pages motion change did not sufficiently validate development stability. During investigation the Turbopack preview log showed recurring recompilations and document requests; a filesystem snapshot comparison found no source-file changes during the observation interval. The Webpack control remained stable. The exact Turbopack invalidation source was not established. `npm run dev` now uses Webpack; `npm run dev:turbo` remains available for diagnosis. Production builds retain their previous bundler.

Motion corrections:

- Layout refresh is debounced for 180ms, compares actual container geometry, waits until scrolling stops, and cancels pending work on cleanup. Fixed-size image load events do not restart scrubbed timelines.
- Hero scrub uses explicit `fromTo` bounds. Refresh cannot accumulate a new start position from the current transform. Unnecessary `invalidateOnRefresh` flags were removed.
- Ingredient and scenic layers animate direct transform aliases instead of a custom property inherited by the entire subtree. Scroll catch-up was reduced to 350ms and travel/rotation toned down.
- Streamed-content discovery is coalesced into one animation frame and ignores text/script-only mutations; surface geometry reads are grouped before initial writes.

Verification: the regression test dispatches repeated load/resize events, verifies no refresh for unchanged dimensions, one refresh for a real size change after scrolling ends, no feedback refresh, and no callback after cleanup. A 20.067-second browser idle sample recorded zero navigations, zero layouts and zero style recalculations. A separate 1.8-second scroll sample recorded 109 frames with 95th-percentile frame spacing 17.5ms (one observed environment, not a guarantee for every device). Desktop navigation through listing and detail, return to the retained landing, 390px width with no horizontal overflow, and live reduced-motion cleanup were verified. These checks supersede the earlier limited public navigation checks.
