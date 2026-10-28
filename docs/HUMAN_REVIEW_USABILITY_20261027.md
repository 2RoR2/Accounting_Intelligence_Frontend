# Human Review usability review — 27 October 2026

Goal: fit genuine JPG/PNG originals, readable extraction fields and accessible evidence inspection. Review owner: Angeline; evidence rendering can also be reviewed by Jonathan. No backend/API/schema changes.

Branch: `feature/human-review-usability-20261027`, based on clean `features` HEAD `43813a2d108fdb4c2320638ac5534784578dca00`. Prepared for the authorized commit and fast-forward push; no manual deployment. Original demo remains on port 3017 and its `.next-features-integration-20261027` build was not modified. Earlier isolated production preview: http://127.0.0.1:3002, configured for backend port 8017. At final verification, the backend and email mailbox were stopped; they were not restarted.

## Changes

- `src/components/common/documents/document-viewer.tsx`: native PNG/JPG image surface, fit-to-page default, bounded zoom, keyboard reset, scrollable magnification, image retry, selected source text/pages and genuine coordinate overlays. Existing PDF iframe and page navigation retained.
- `src/features/common/documents/document-review.tsx`: full-width field cards, accessible field/source selection including line editors, expandable raw/extracted/saved values, method, nullable confidence and correction actor/time; inline selected evidence on mobile. Existing save/conflict/refresh/revalidation handlers retained.
- `src/styles/accountant.css`: bounded desktop panes, 16px labels/inputs, wrapping metadata, responsive stacking and focus styles.
- `src/types/extraction.ts`: describes the already-returned optional `page_size` evidence property. No wire-contract change.
- `src/lib/document-viewer.ts`: accepts only explicit page-one top-left, bounded coordinates with known units and a compatible source size. Unmappable evidence remains readable without an invented highlight. Source-block boxes are labelled as blocks.
- `tests/document-viewer.test.ts`, `tests/browser/human-review-live.spec.ts`, `playwright.review.config.ts`: coordinate safety and opt-in real-browser acceptance.

## API assumptions checked

Existing same-origin `GET /api/documents/{id}/file`, document/extraction responses, field/line evidence, `page_size`, coordinate units/origin, raw/current values, warnings, nullable confidence, content revisions and persisted line history. No new endpoints or mutation payload changes. Account login used real password + local email MFA; no session cookie injection.

The earlier local acceptance run covered three existing JPG documents: a receipt (2055×4638), invoice and restaurant bill (both 3000×4000). Tenant document IDs and private account locations are intentionally omitted from shared notes.

## Earlier reported tests (retained review history)

- PASS `npm run typecheck` (exit 0).
- PASS `npm run lint` (exit 0).
- PASS `$env:API_BASE_URL='http://127.0.0.1:8017'; npm test`: 57 tests, 57 pass, 0 fail, 0 skip. Most contract/unit tests use controlled responses; the three backend health/unauthenticated-access checks used the real backend. Initial default-port run passed 54 and skipped 3; rerun at the actual backend resolved the skips.
- PASS `$env:NEXT_BUILD_DIR='.next-human-review-20261027'; $env:BACKEND_URL='http://127.0.0.1:8017'; $env:NEXT_TELEMETRY_DISABLED='1'; npm run build`: compiled, generated 44 pages, exit 0. Nonblocking webpack cache snapshot warnings. Build-generated tsconfig/next-env changes restored to original content.
- PASS `npx playwright test --config playwright.review.config.ts` with the local account-file path and the three document IDs supplied via environment: 1 passed (23.3s). Installed Chrome, actual production frontend/backend, no mock extraction DTOs. Checks all three sources at 1366×768, 1440×900, 1093×614 (125%-zoom-equivalent CSS viewport), and 390×844. All fitted without image or page horizontal overflow; labels measured 16px. Checks source text, nullable confidence, raw/current values, zoom in/out, keyboard Fit/reset, mobile selected evidence, persisted correction history and identical extraction responses after reload. A single intercepted PATCH returns a test-only 409 to verify retained drafts and no automatic replay; it never reaches the database. No document mutation or revalidation was submitted.
- PASS `git diff --check`.

Reproduce browser acceptance after starting the isolated build:

```powershell
$env:REVIEW_ACCOUNTS_PATH='<local-private-test-account-file>'
$env:REVIEW_DOCUMENT_IDS='<comma-separated-local-test-document-ids>'
npx playwright test --config playwright.review.config.ts
```

## Earlier local browser evidence

[Desktop: full 3000×4000 source and readable values](../test-results/human-review/desktop-invoice.png)

[Mobile: selected source beside its field](../test-results/human-review/mobile-receipt.png)

[Measured findings](../test-results/human-review/human-review-live-genuine--bb209-layout-and-retained-history/acceptance-findings.json)

The test output directory also contains fit, zoom and mobile screenshots for all three documents. Evidence artifacts are ignored local files.

## Known limitations and next smallest task

No processed PDF or PNG is accessible in this test tenant. PDF iframe behavior remains in source, but a live PDF/PNG regression is outstanding. The 125% check uses an equivalent reduced CSS viewport, not browser zoom UI. A new upload/extraction pipeline and successful live corrections/revalidation were deliberately not rerun to preserve the existing demo data; their existing service/handler behavior is unchanged. Unmapped or missing coordinates produce no highlight. No approval, posting or settlement is implied.

Next: Angeline reviews the UI; complete genuine PNG/PDF acceptance in a disposable test tenant when the local backend is available.

## Final push verification — 27 October 2026

- Preserved the original nine changed/untracked files in a separate local backup before finishing this change.
- Corrected the live test MFA-code regular expression and removed the viewer file BOM. Removed tenant document IDs and private account locations from these shared notes.
- Added `tests/browser/human-review-viewer.spec.ts` and included it in `playwright.review.config.ts`. Its synthetic PNG/PDF fixtures are generated in memory, and all API requests are intercepted. No real authentication or document mutation occurs in these tests.
- PASS `npm run typecheck` and `npm run lint` (exit 0).
- PASS `API_BASE_URL=http://127.0.0.1:8017 npm test`: 54 passed, 3 skipped, 0 failed (57 total). The skipped tests require the stopped backend: health and two unauthenticated-access checks.
- PASS `npm run build` with `BACKEND_URL=http://127.0.0.1:8017`: compiled and generated 44 pages (exit 0).
- PASS `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3032 npx --no-install playwright test --config playwright.review.config.ts`: 2 passed, 1 skipped (exit 0), using installed Chrome and an isolated production build. The skipped live test requires local account and document environment variables plus the running backend/mailbox.
- Synthetic PNG coverage: image failure/retry, retained unsaved draft, fit at 1366×768, 1440×900, 1093×614 and 390×844, zoom, keyboard Fit, coordinate overlay and mobile source text. Synthetic PDF coverage: original iframe/source link, selected page 2 and desktop/mobile width. PDF raster rendering and genuine PNG/PDF backend processing remain unverified.
- Validation ran from a source copy whose original file hashes were checked against this repository before finalization. The original frontend previews/builds, backend and generated configuration files were not changed. Initial browser attempts could not access installed Chrome/the restricted preview; the successful run used an accessible isolated preview.
- No generated screenshots/builds, private account files or credentials are included in the commit. API endpoint and mutation contracts are unchanged. Earlier live-run results above are historical reports, not claims of a live rerun in this session.