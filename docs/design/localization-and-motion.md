# Persian landing and motion

`next-intl` request configuration is in `src/i18n/request.ts`; `fa` is the default and currently the supported locale. Messages live in `messages/fa.json`, with typed keys through `src/i18n/types.d.ts`. The root client provider uses the same locale, messages and Asia/Tehran time zone as server translations. Existing URLs remain unchanged; locale prefixes and a language switcher are not introduced. The home title and description are translated. Persian text uses locally hosted Vazirmatn, with Inter retained for the preset's Latin typography.

The landing follows the VitaBoost source section sequence, adapted to honey, RTL and the user-selected Sera/Yellow preset. Showcase cards include one known product plus editorial use cases. Serving ideas replace unverifiable customer endorsements, and the community CTA uses the existing account registration flow instead of pretending to register newsletter subscriptions. No fictional prices, ratings, discounts, contact details or medical claims are added.

Motion uses the transitions-dev text reveal and text-state swap recipes in `src/styles/landing-motion.css`. Entered sections remain visible; content is also visible without JavaScript. Reveal offsets are 40ms per item and capped at 240ms, with 500ms entrances. Carousel text swaps use 150ms and 4px; Radix FAQ expansion uses symmetric 250ms; dialogs use 250ms open and 150ms close. Scroll scenes update on animation frames, only while visible. Cleanup removes observers, listeners and timers.

Reduced-motion preferences disable reveal transitions, blur and parallax. The carousel and FAQ remain usable. Persian words are kept intact instead of splitting contextual glyphs into animated characters.

## Responsive and supporting-page update (2026-10-18)

- Root layout now loads the supplied Yekan Bakh variable WOFF2 via `next/font/local`; the font is bundled in `src/app/fonts/yekan-bakh-variable.woff2`. Persian glyph shaping remains intact.
- `/about`, `/contact`, and `/faq` use the `StorePages` next-intl namespace, static metadata and the shared storefront navigation. Catalog and product routes share that navigation too.
- Contact is a working navigation/help page. Direct contact details have not been supplied; no message submission is simulated.
- Narrow screens use a single-column benefits grid and ingredient feature list. The header moves to two rows below 700px. Ingredient decoration sizes scale with viewport width.
- Reveals preserve already visible SSR content during hydration, use a zero intersection threshold for tall mobile sections, and respond to reduced-motion preference changes. Text reveal easing is `ease-in-out`; card hover uses 250ms smooth-out. FAQ stays symmetric at 250ms.
- About-page editorial photo/text direction was informed by the Eat Hungry Tiger section on Mobbin: https://mobbin.com/sites/sections/2331ed49-dec3-4209-aef8-dae217fa3578 . Base44 hosts separate apps; changes remain in the existing Next.js project.
