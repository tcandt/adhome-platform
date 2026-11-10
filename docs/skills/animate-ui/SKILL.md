---
name: animate-ui
description: Build and refine AdHome interface components and loading states with the installed Animate UI library. Apply to UI changes across the project; not to backend-only work.
---

# Animate UI for AdHome

Use `@animate-ui/react`, already installed in `apps/console`, as the project's animation component library. This is a project-specific skill, not an upstream Animate UI skill distribution.

Inspect the installed package's export map and type declarations before choosing an API. Official reference: https://animate-ui.com/docs. Do not substitute lookalike CSS animation and call it Animate UI.

Existing primitives include:

- Dialog: `@animate-ui/react/primitives/base-ui/dialog`
- Animated progress: `@animate-ui/react/primitives/base-ui/progress`
- Animated buttons: `@animate-ui/react/primitives/buttons/button`

Keep reusable compositions in `apps/console/src/shared/ui`. Match existing colors, typography and spacing. Honor the library's reduced-motion support; avoid continuous decorative motion.

For long operations, expose accessible progress based on completed server requests, show which item is being processed, prevent duplicate submission and distinguish partial failures from success. Wait for provider read-back and parent data refresh when those are part of the operation. Use an indeterminate state when real progress is unavailable; never invent percentages or completion.

Keep failure summaries compact. Offer expandable per-item error details with useful sanitized reasons, preserving failed selections for retry. Never expose credentials, tokens or raw authenticated URLs.

Verify changed interactions on a narrow mobile viewport, keyboard access and reduced-motion mode. Check that actions remain reachable, progress does not overflow, and failure cannot trigger a success state.

For Hunonic tariff saves, use a compact Animate UI processing state inside the save button (`ShimmeringText`), not a progress bar or a separate progress panel. Keep loading active until real verification and parent refresh finish.
