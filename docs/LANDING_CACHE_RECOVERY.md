# Public landing cache recovery — 2026-11-03

## Evidence

- Live adhome.vn returned 200 for current JS, CSS and /brand/adhome-icon.svg.
- A nonexistent /assets/obsolete-test-chunk.js returned 200 text/html (SPA fallback).
- The screenshot matches the preboot recovery UI, before React mounts. Its static logo was explicitly hidden by CSS.
- Incognito working is consistent with stale browser state, but the affected iPhone's network/console logs are still needed to establish the exact cause. No service worker registration was found in landing source.

## Changes

- Keep the inline SVG logo visible without JavaScript.
- On a failed entry module or Vite preload, try one fresh document navigation using the existing reload query parameter. Do not loop; offline users keep a manual retry and phone link. Preserve the route, other parameters and hash; remove the recovery parameter after mounting.
- Revalidate documents and stable public URLs; cache Vite content-hashed assets as immutable.
- Route /assets/* through the Worker and return 404/no-store instead of HTML when an asset is missing.

## Verification

`pnpm run build:worker` passed. WebKit mobile regression covers normal loading, stale HTML referencing a removed entry chunk, persistent chunk failures, offline status, and reduced motion. It checks visible logos, bounded reloads, preserved URL, keyboard retry access, and mobile overflow. Worker missing-asset behavior was checked separately.

Harness: `.artifacts/cache-regression.mjs`; results: `.artifacts/cache-regression.json`; screenshots: `.artifacts/cache-*.png`.

Deployed to adhome.vn on 2026-11-03. Cloudflare Worker version: `39858f4c-85c4-4a3e-a3a8-7d83a71c961a`. Live checks confirm the recovery script, HTML revalidation, immutable hashed JS, visible logo source, and 404/no-store for missing assets.


## Follow-up after iPhone still failed (2026-11-03)

The earlier release was insufficient: the screenshot showed its updated fallback, but React still did not mount. The original cause on the physical iPhone remains unconfirmed; no device console trace has been obtained. Do not describe HTTP 200 checks or a new logo alone as proof of recovery.

Production now uses one deferred classic IIFE bundle targeting Safari 15, with no ES-module entry, vendor imports, or modulepreloads. This gives all application code a fresh content-hashed URL and removes the previous dependency on Safari's module loading/cache state. Its gzip size is about 163 KB. Google Fonts loads without blocking application startup. Entry HTML is `no-store`.

The initial HTML contains an accessible, responsive property introduction, inline SVG brand, photo, phone and email contacts. It remains usable without JavaScript. It never claims live room availability. On startup or React rendering failure, the HTML view stays visible or is restored; there is no repeated automatic reload. A bounded, same-origin boot-report endpoint logs sanitized fixed diagnostic fields (no URL queries, cookies or credentials). React loading skeleton width was corrected for narrow screens while the API is pending.

Verification: build/typecheck and targeted lint passed. WebKit 390x844 tested 10 cases: normal, old HTML/module failure followed by a normal reload, missing JS, runtime error, render error, disabled JavaScript, reduced motion, inaccessible browser storage, stalled API, and stalled Google Fonts. Fallback keyboard retry and mobile overflow were checked. Diagnostic endpoint accepted valid reports and rejected cross-origin, invalid, and oversized reports. Test results: `.artifacts/boot-v2-results.json`; harness: `.artifacts/boot-v2-test.mjs`; screenshots: `.artifacts/boot-v2-*.png`.

Deployed Worker version: `f14f0d43-d7bf-446a-a6ee-8340066da6d6`; entry: `/assets/index-ChmpMrTj.js`. Live checks confirm `no-store` HTML, the classic script, and 404 for missing assets. The live room API separately returns 503 because its upstream is unavailable/unconfigured; no room data was fabricated.

Live WebKit cold navigation and reload in the same browser session both passed: ready=true, no boot errors, header present, loader removed, content opacity=1. Evidence: `.artifacts/boot-v2-live-results.json` and `.artifacts/boot-v2-live.png`. Physical iPhone confirmation is still pending.


## Header/footer icon follow-up

The user confirmed the page opened, but Safari showed broken image placeholders in both the header and footer. Those icons still used external stable SVG image URLs; this was distinct from the loader's docking visibility.

Added the shared `BrandIcon` component, using canonical inline SVG geometry, per-instance gradient IDs, and color/white variants. Header and footer no longer request external logo files. Local source and deployed production share this component.

Build/typecheck and targeted lint passed. WebKit mobile, desktop and reduced-motion checks passed with all `/brand/*` requests blocked: no logo requests, visible header after docking, white footer icon, valid gradient references, no overflow, and keyboard-accessible home link. Live production also confirmed both icons are inline SVG and header visibility is restored. Evidence: `.artifacts/inline-logo-results.json`, `.artifacts/inline-logo-*.png`, `.artifacts/inline-logo-live.mjs`.

Deployed Worker: `07827ea1-1626-4f73-be26-0b4aa2973ae3`; entry `/assets/index-Be7WBcCr.js`.
