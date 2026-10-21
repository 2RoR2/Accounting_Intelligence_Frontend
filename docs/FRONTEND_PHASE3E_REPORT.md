# Frontend Phase 3E contract alignment

Completed/resumed: 21 October 2026. Candidate remains UNCOMMITTED.

## Goal and preserved Git state

Frontend worktree: C:\Users\60103\Documents\GitHub\Accounting_Intelligence_Frontend_V2_integration_20261020
Branch: integration/features-accounting-v2-20261020
HEAD: 14883335d8a4badff1fdf4c2f25027f12feca160
MERGE_HEAD: 645135776929184a07b1a3292e13e05934bb4668

Existing resolved merge/index preserved. Phase 3E modifications and new files remain unstaged/untracked over the earlier staged candidate. No merge restart, staging, commit, push, deployment, original-worktree modification or backend write. No environment/credential changes or preserved demo backend access.

On resume, inspected Git status/diffs, existing tests, saved Playwright passed result and production-build timestamps. Application source was already complete; this continuation changed only the focused browser test and added this report. Completed checks were not rerun unnecessarily.

## Exact Phase 3E files touched

Modified existing files (relative to the earlier staged frontend candidate):

- src/types/auth.ts: nullable display tenantCode, separate from canonical tenantId.
- src/types/document.ts: nullable assignedTo; existing contentRevision retained.
- src/types/tenant.ts: canonical UUID documentation.
- src/lib/api/auth.service.ts: identity mapping and identity-contract key.
- src/features/application.tsx: refreshed/versioned identity resource.
- src/features/auth/public-pages.tsx: welcome identity refresh and separate company-code display.
- src/components/common/layout/app-shell.tsx: display company code separately.
- src/lib/api/client.ts: preserve structured error detail alongside HTTP status/message.
- src/lib/api/document.service.ts: retry cannot claim success without an agreed protocol.
- src/lib/api/workflow.service.ts: actual review DTOs, required revisions and server-confirmed line/review responses.
- src/features/common/hooks/use-resource.ts: expose state setter for server-confirmed correction state.
- src/features/common/documents/document-review.tsx: owner/assignee/administrator controls, genuine line correction, revision refresh, review/standardisation gates and retry feedback.
- src/styles/accountant.css: contain editable line cells and wrap long error text.

New files:

- src/features/common/documents/line-item-correction.tsx
- src/lib/permissions/document-review.ts
- src/lib/api/retry-error.ts
- tests/phase3e-contract.test.ts
- tests/browser/phase3e-alignment.spec.ts
- playwright.phase3e.config.ts
- docs/FRONTEND_PHASE3E_REPORT.md

Previous Phase 3B/3D and team merge changes, including staged next-env.d.ts, were retained. This list describes Phase 3E only, not the whole unfinished merge.

## API assumptions checked against actual staged backend source

Read-only backend: C:\Users\60103\Documents\GitHub\Accounting_Intelligence_Backend_V2_Integration_20261020
Report: docs/PHASE3D_BACKEND_P0_REMEDIATION.md
Backend HEAD c65b41fb1c165f49b5bac791127d8f4838a33fab; MERGE_HEAD 39e68a1850daf6e875d7935dbb0138db55f3f170.
Authoritative inspected staged app.py blob: d2a4122a73ad876358a0191a0f59a3595d0065ce. References below are to this INDEX version, not an integration commit or runtime proof.

| Contract | Staged backend evidence | Frontend mapping/behavior |
| --- | --- | --- |
| Canonical identity | app.py:220 public_user; tenantId UUID/null, tenantCode separate | auth.service.ts:17-25; canonical tenant equality only; display code never substitutes for access |
| Document identity/assignment | app.py:789 list, :803 detail; assignedTo UUID/null, contentRevision | document.ts and existing mapDocument; nullable assignment retained |
| Authorization and immutability | app.py:536 shared locked document guard | permissions/document-review.ts; accountant owner OR assignee, same tenant; local administrator tenant-wide; platform administrator does not gain review authority; existing records protect stale statuses |
| Line revision input | app.py:339 and :381 strict expectedContentRevision; PATCH route :1406 | workflow.service.ts:117 sends value and current expectedContentRevision |
| Line correction response | app.py:1449 response lineItemId, fieldKey, value, correctedBy, contentRevision | validates server result; exact returned decimal string and revision update current state; refreshes authoritative extraction |
| Stale write | app.py:1421 revision mismatch HTTP 409 | refresh without automatic replay; dirty draft retained with conflict guidance; next explicit edit/save uses refreshed revision |
| Review history | GET /api/documents/{id}/reviews app.py:1296 | actual submissions/decisions DTO; approvedRevision nullable; unavailable history disables approval-dependent standardisation |
| Submit | POST /api/documents/{id}/review app.py:1951 | explicit current integer revision, actor restrictions, server-confirmed document/decision/status |
| Decide | POST /api/documents/{id}/review/decision app.py:1969 | local administrator only; conservative distinct-submitter UI; server still checks current revision and eligible submission |
| Standardisation | POST /api/records/from-document/{id} app.py:1186 | real existing backend request; current revision, validation, current approval and state gates; record shown only from API |
| Retry | POST /api/documents/{id}/retry app.py:831-857 | deliberate 409 errors retained: AMENDMENT_REQUIRED, JOB_ALREADY_OPEN, DOCUMENT_NOT_RETRYABLE, RETRY_PROTOCOL_REQUIRED; actual jobStatus/no-dispatch details shown; 403/500/503 remain errors |

During the final read, backend app.py acquired independent unstaged changes (34 insertions/33 deletions); staged blob remained unchanged. They were not authored, resolved or adopted here. The contract baseline in this report is explicitly the staged Phase 3D source. Recheck subsequent backend Phase 3E evidence before connected acceptance or changing the retry adapter.

GET reviews does not provide submission content revision. The UI conservatively uses the newest submitter and document state; backend selects a current-revision submission by a different actor. A legitimate administrator may therefore be conservatively disabled in some multi-submission histories. No revision field was invented. Owner review is needed for any contract expansion.

## Accounting behavior preserved

- UUID tenant identity, nullable assignment, owner/assignee access and tenant-wide local administrator affordances; server authorization remains authoritative.
- No session refresh/replay policy added. Identity is fetched without cache on mount/resource changes; display-code identity is not reused as authorization identity.
- Four genuine line corrections: description, quantity, unit_price and amount. All carry positive integer expectedContentRevision. Strings remain strings and returned normalized values are used.
- HTTP 409 requests authoritative refresh, preserves dirty line draft, and disables resubmission until deliberate editing. Unsaved drafts remain visible if document becomes read-only. No automatic mutation replay.
- Corrections invalidate displayed validation/approval until authoritative refresh; review/standardisation require coherent document/extraction revision and applicable validation/approval gates.
- Accountants submit; they cannot approve. Local administrators cannot approve their own latest submission in the UI. Existing standardised record prevents editing even if document status is stale.
- Actual AP/AR PDF intake, source classification including Unknown, nullable confidence, decimal rendering, original-PDF access, genuine validation/exceptions/history and real standardisation paths remain. No fabricated records, fallback review data or simulated standardisation introduced.
- Retry never emits queued/dispatched success. Even unexpected HTTP 2xx is an unconfirmed outcome pending an agreed backend protocol. No new retry response shape invented.

## Tests PASS / FAIL / SKIP / BLOCKED

Completed before pause, carried forward because application source has not changed since those checks:

- PASS npm run typecheck.
- PASS npm run lint, no errors/warnings.
- PASS API_BASE_URL=http://127.0.0.1:9; npm test: 35 passed, 0 failed, 3 deliberate live-backend skips (38 total).
- PASS NEXT_BUILD_DIR=.next; BACKEND_URL=http://127.0.0.1:9; npm run build: 40/40 static pages. Build timestamp is later than final application CSS changes. No build rerun on resume.
- PASS npx playwright test --config playwright.phase3e.config.ts: 12 mocked-browser checks (5 Phase 3D plus 7 Phase 3E); saved .last-run.json confirmed passed on resume. Covers identity/code display, assignee access, revisions/drafts, administrator restrictions, rejected standardisation/no fabricated record, immutable records and retry refusal.

Outstanding verification completed on resume:

- PASS focused line-editor regression at 1440x900, 1366x768 and 390x844: npx playwright test --config playwright.phase3e.config.ts --grep 'line stale 409'; 1 passed (5.3s), exit 0.
- Asserts retained draft, disabled conflicted save, authoritative saved value, no horizontal line-table/page overflow, editor visible after scrolling, subsequent server-confirmed corrections and revision payload sequence [1,2,3].
- Two initial focused attempts failed: visibility assertion before scrolling to the editor; then next edit started before preceding save had finished. Test now scrolls and explicitly waits for enabled editor/confirmed value before next edit. No application behavior or assertions weakened to force a pass.
- PASS focused ESLint: node node_modules/eslint/bin/eslint.js tests/browser/phase3e-alignment.spec.ts.
- PASS git diff --check; no unmerged index entries or conflict markers found in src/tests.
- Three live-backend unit tests remain SKIP. Real PostgreSQL/RQ/Docling, interactive MFA/login, PDF rendering, persistence, Qwen and full-stack acceptance remain BLOCKED/NOT RUN. Mocked browser responses do not prove those features.

Dedicated browser server: 127.0.0.1:3108, existing production build, BACKEND_URL unused port 9, every API request intercepted with synthetic fixtures, no real credentials, no shared DB. Successful test run completed and managed its own server. Production build configuration must be reviewed/rebuilt for an approved isolated backend before connected testing.

## Screenshot or browser evidence

Visually inspected current sanitized screenshots:

- test-results/phase3e-alignment/phase3e-alignment-line-sta-32a65--saves-use-the-new-revision/line-stale-draft.png (1440px)
- test-results/phase3e-alignment/phase3e-alignment-line-sta-32a65--saves-use-the-new-revision/line-stale-draft-1366.png
- test-results/phase3e-alignment/phase3e-alignment-line-sta-32a65--saves-use-the-new-revision/line-stale-draft-390.png

The 1366/mobile screenshots were inspected on resume. Draft 49.00 remains while saved value is 52.00, with explicit conflict guidance. Four columns wrap heavily at mobile width: no overflow, but dense/long presentation remains a UX limitation. This is not a full responsive, keyboard, accessibility or 125% zoom audit. Synthetic /file intentionally returns 404; screenshots do not establish native PDF rendering.

Focused Playwright execution reuses its configured output directory, replacing previous full-suite artifacts; previous 12-test PASS was read before running the focus test. Current .last-run.json records the focused PASS.

## Known limitations and next smallest task

NO-GO for full-stack acceptance/rollout. Frontend source alignment and mocked regression checks are ready for review, not proof of connected processing.

P0: reliable job/dispatch/claim/completion/failure/recovery protocol remains pending the backend report; re-evaluate independently changing backend source and reverify any successful retry contract. Actual PostgreSQL tenant/assignment/revision/rollback/immutable-record behavior must pass in a separately approved disposable target.

P1: exercise genuine login/session expiry, synthetic PDF upload/AP-AR/classification/evidence, two-user stale writes, revalidation, distinct administrator approval and server-persisted standardisation in that isolated stack. No live tests against preserved demo resources. MFA self-service recovery remains unavailable, and bank matching remains candidate-only. No settlement/posting claim.

P2: review compact mobile line-edit ergonomics with UI owner; current approval affordance can conservatively reject multi-submission histories because the history response omits submission revision. No backend contract/schema expansion was attempted.

Next smallest task: review this frontend report alongside the final backend Phase 3E worker/protocol evidence, then authorize the exact disposable full-stack acceptance environment and tests. Leave the merge and all work uncommitted.
