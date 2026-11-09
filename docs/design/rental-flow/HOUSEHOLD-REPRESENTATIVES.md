# Household members and contract representatives

Deployed to production on 2026-11-09. Feature commit `8e31b7b` was pushed to `origin/main`; Console version `ac959763-0d4f-4965-865e-370f3e1ef4b4` serves 100% of traffic.

## Behavior

- The onboarding member switch chooses the role for the next person added. Each member also has a switch, allowing mixed households and representatives without changing other members. Switching a role preserves identity fields and any previously entered relationship.
- Main signatories display `HĐ Chính`, co-representatives display `Đại diện HĐ`, and household members display `Người cùng hộ`.
- Roles persist through direct rentals, legacy takeover, draft edits and reservation conversion. Existing `FAMILY` / `OTHER` occupant metadata is reused; unclassified legacy roommates default to household members.
- The tenant table includes both scheduled and active occupants. Members without an independent CRM record appear through the existing occupant directory adapter and open their room residency profile.
- Main and representative lease documents use the same authoritative financial contract, dates, rent and deposit. Each representative has a separate document identity and link. This does not create additional financial contracts, invoices, deposits or Zalo registration obligations.
- Representative document editing updates the corresponding profile member, preserving the primary tenant. Stable occupant IDs select existing representatives; person indexes support unsaved draft profiles. Representative downloads have distinct filenames.
- CT01 section 11 includes the other household members attached to the selected household head. Co-representatives are excluded and act as their own head unless a head was explicitly assigned. Required identity and relationship details are validated before export.
- The supplied CT01 styling is retained. Body rows use a consistent template, expand as needed, avoid splitting a row across pages and repeat the header on continuation pages. Removed residents are excluded from merged document profiles.
- A full residence bundle includes each person's CT01 and leases for the main signatory and co-representatives. A selected representative bundle includes that person's CT01 and lease.

## Verification

Passed:

| Check | Coverage |
| --- | --- |
| `node scripts/test-rental-workflow.mjs` | Actual handlers with an in-memory database: direct/import/conversion/draft flows, mixed roles, financial conservation, no duplicate financial records, role read-back, selected lease identities, invalid selections, exact CT01 section 11 and 12-member expansion |
| `node scripts/test-rental-people.mjs` | Scheduled residents appear once in the tenant table, legacy roles, removed residents, saved identity preservation |
| `node scripts/test-contract-documents.mjs --pdf` | Contract/org/building isolation, exact historical contract, member merging, valid representative selection and actual Word-to-PDF conversion |
| `node scripts/test-rental-member-ui.mjs` | Chromium at 1440/390/320 px with reduced motion: keyboard switching, mixed roles, capacity, request payloads, rejected writes preserve fields and never display success, no horizontal overflow |
| `node scripts/test-representative-doc-ui.mjs` | Chromium at 1440/390/320 px: representative links, stable occupant selection, member-only identity edits, verified save response and rendered PDF |
| `node scripts/test-rental-member-bundle.mjs` | Actual conversion and assembly: full mixed bundle has 26 pages; selected representative bundle has 14 pages, including synthetic attachments |
| Console production build | `pnpm --filter @adhome/console build` |
| API bundle build | `pnpm --filter @adhome/landing build:api` |
| Focused server typecheck | TypeScript checks for `rentalPeople.ts`, `rentalDocuments.ts`, `contractDocumentsApi.ts`, `rentalWorkflowApi.ts` |

CT01 fixtures with one and twelve household members and both representative lease templates were converted using Microsoft Word and all rendered page images were inspected. The twelve-member CT01 has three content-bearing pages with a repeated table header, without a blank trailing page. Local LibreOffice is unavailable; Word conversion requires running outside the sandbox. Production conversion itself was not exercised for this feature.

Synthetic fixtures and screenshots are under `.artifacts/rental-workflow/`, `.artifacts/rental-members/` and `.artifacts/contract-preview/`. API tests use mocks and synthetic identities, not the production database.

## Existing verification failures outside this feature

- The older `test-rental-ui.mjs` stops on its desktop footer-left-alignment assertion before reaching the member controls. The current desktop footer groups actions on the right. The focused member suite covers the new controls and all three viewports.
- The older `test-contract-preview-ui.mjs` expects an iframe for printing, while the current application uses the PDF canvas viewer. It stops at the obsolete iframe lookup. The focused representative suite verifies the actual canvas PDF viewer.
- A broad manual TypeScript check of `consoleBusinessApi.ts` reports three errors in existing unrelated code: the bulk-room item's `rentalModel` field around line 2502 and union Prisma model calls for business/login audit logs around lines 9082-9083. These blocks were not changed for this feature. The configured landing typecheck covers frontend source only, so its success is not evidence of a clean whole-server typecheck.
- Vite reports its existing large-chunk warning. Production builds complete successfully.

## Release scope

No database migration is required. Both Console and API must be released together, including the new `@xmldom/xmldom` runtime dependency and existing rental templates. The workspace contains unrelated changes which must be reviewed separately before staging a release.

The release is built from an isolated source tree based on Git HEAD plus the rental feature and its existing runtime dependencies. Unrelated building-directory redesign and session changes are excluded. Minimal host wiring makes the tenant popup reachable without adopting that redesign; the initial module is preserved while authentication loads. The isolated API build is byte-identical to the installed tested API: SHA256 `958cba832593012249728167f39140828ccf7ecfbc6ef79752a813bc10eff107`.

The API installer is `scripts/deploy-rental-members-20261109.sh`; its VPS stage is `/home/tcandt/adhome-rental-members-20261109`. The previous server is preserved under that directory's `backup/`. Previous Console production version: `9cd5fb1d-7faa-423f-8999-6205c85d0aa1`. Existing CCCD models, metadata and branding assets are preserved byte-for-byte from production.

Both focused UI suites pass against the isolated production build and Cloudflare staging at all three viewport widths. These checks mock API responses and do not create production tenants or contracts.

Post-deployment verification: both focused UI suites also pass against `https://console.adhome.vn` at 1440/390/320 px. The asset suite passes for fresh HTML, QR JavaScript, WASM MIME and missing-asset 404 responses. Installed API checksum matches the tested release; service reports `active/running`, `NRestarts=0`, public endpoint HTTP 200 and unauthenticated Console endpoint HTTP 401. Production tenant and contract records were not modified by verification.
