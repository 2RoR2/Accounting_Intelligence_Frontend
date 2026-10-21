# Phase 3D - independent frontend corrections

Worktree: C:\Users\60103\Documents\GitHub\Accounting_Intelligence_Frontend_V2_integration_20261020
Branch: integration/features-accounting-v2-20261020
HEAD: 14883335d8a4badff1fdf4c2f25027f12feca160
MERGE_HEAD: 645135776929184a07b1a3292e13e05934bb4668
Merge remains resolved, staged and UNCOMMITTED. No original repository, backend, environment secret or saved demo evidence was accessed or modified during this phase.

## Changes

- Removed the unavailable self-service authenticator-reset UI, password collection and API adapter. Existing login/MFA enrollment remains. Guidance says to contact the administrator under the approved recovery policy; no replacement process or success is invented.
- API errors preserve server messages/statuses, including invalid-login versus protected-resource 401. No refresh/replay was added.
- auth/me returns null only for 401. Permission, backend and transport failures propagate. Workspace and welcome pages distinguish loading, retryable failure and unauthenticated state. The welcome page no longer claims the user is signed in when the session is unavailable.
- PDF-only selection/drag/drop/paste now agrees with the upload service without environment flags. Camera capture is disabled, including the document-list menu and direct camera query. AP/AR and Auto-detect behavior is unchanged; unsupported credit/debit kinds stay disabled.
- Bank request validation requires exact decimal strings (including negative values) without Number conversion; numeric JSON, non-finite/exponential/grouped money and malformed rows are rejected before fetch. References accept strings, null or omission. Results remain candidate-only, never settlement/posting.
- Revalidation has its observed errors/checks DTO instead of the GET validation summary. Support responses have a separate mapping/type; absent category/validation/date metadata is not fabricated. Normal record-list mapping and detail lookup remain unchanged, including undefined for missing records. No endpoint was added.

## Files edited in this phase

src/features/application.tsx
src/features/auth/public-pages.tsx
src/features/common/documents/documents.tsx
src/features/common/records/records.tsx
src/features/common/reports/accounting-reports.tsx
src/lib/api/auth.service.ts
src/lib/api/client.ts
src/lib/api/document-contract.ts
src/lib/api/document.service.ts
src/lib/api/record.service.ts
src/lib/api/workflow.service.ts
src/lib/api/bank-contract.ts (new)
tests/frontend-independent.test.ts (new)
tests/browser/phase3d-independent.spec.ts (new)
playwright.phase3d.config.ts (new)
docs/FRONTEND_PHASE3D_REPORT.md (new)

## Verification

- npm run typecheck: PASS.
- npm run lint: PASS, zero errors/warnings in the final source.
- API_BASE_URL=http://127.0.0.1:9; npm test: 25 PASS, 0 FAIL, 3 deliberate live-backend SKIP. Eight new tests exercise error distinctions, null/error states, bank validation/payloads, support mapping, revalidation and empty record lookup. Requests are mocked.
- NEXT_BUILD_DIR=.next; BACKEND_URL=http://127.0.0.1:9; npm run build: PASS, 40/40 static pages. Output target was verified before prebuild cleanup.
- npx playwright test --config playwright.phase3d.config.ts: final run 5 PASS, 0 FAIL, 8.0 seconds. Chrome on dedicated port 3107, every API request intercepted, synthetic fixtures and no credentials/cookie injection. Tests cover login error, unavailable recovery, service failure/retry, welcome loading/error/signed-out, PDF-only controls/AP-AR/Auto-detect, empty reports and bank validation/candidate presentation.
- Initial browser failures were test-harness mistakes: ambiguous Next route-announcer alert, guessed empty text and bank test aimed at company performance reports instead of existing accountant reports. Corrected selectors/route; no production routing changes or weakened assertions.
- Four sanitized screenshots in test-results/phase3d-independent/: service-error.png, welcome-signed-out.png, pdf-only-upload.png, bank-candidates.png (within per-test directories). PDF upload screenshot visually inspected at 1440px. This is not a full responsive/zoom or accessibility audit.
- No genuine extraction, login, persistence, PostgreSQL, RQ, Docling, Qwen, settlement or posting was tested. Synthetic browser responses are not production evidence.

## Deferred - requires backend Phase 3D report

Canonical tenant ID/display code and assignedTo mapping; the existing Phase 3B canDocument mismatch remains unresolved and can disable valid review actions.
Retry payload/state/dispatch handling and the possible open-job unique-index 503.
Line-item revision/amendment/ownership contract.
Backend-driven approval/standardisation permissions.
Session refresh and replay policy.

These deferred blocks were preserved. The genuine review/evidence component, field corrections, source viewer, role/tenant permission helpers and standardisation request were not changed in this phase. Real cross-repository contracts and runtime acceptance remain BLOCKED. The production build intentionally targets unused port 9 and must be rebuilt with approved isolated configuration before connected testing. No commit, push or deployment.

Recommendation: independent frontend corrections ready for review; NO-GO for connected acceptance until the backend report and deferred P0 fixes are verified.
