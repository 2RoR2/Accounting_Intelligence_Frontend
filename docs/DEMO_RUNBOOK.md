# Five-minute lecturer demo — D4-A verified, 19 October 2026

Real Chrome password/TOTP login → PDF upload → RQ/CPU Docling → persisted fields/evidence → deterministic validation → revision-aware correction. No parser mocks, injected sessions, automatic approval or payment inference. Local acceptance is not production/Vercel certification.

## Startup and local URLs

Frontend: http://127.0.0.1:3000 | Backend: http://127.0.0.1:8002

Reuse running services. Only if stopped, from Backend_V2 in separate terminals:
```powershell
docker start saic-v2-d1a-postgres18 saic-v2-d1a-redis
wsl -d Ubuntu --cd /mnt/c/Users/60103/Documents/GitHub/Accounting_Intelligence_Backend_V2 --exec /home/donut99/.venvs/accounting-intelligence/bin/python -B scripts/d1a.py api
wsl -d Ubuntu --cd /mnt/c/Users/60103/Documents/GitHub/Accounting_Intelligence_Backend_V2 --exec /home/donut99/.venvs/accounting-intelligence/bin/python -B scripts/d1a.py worker
```
From Frontend_V2:
```powershell
$env:NEXT_BUILD_DIR='.next-d22-dev'
npm run dev -- --port 3000 --hostname 127.0.0.1
```
Ignored `.env.local` uses `BACKEND_URL=http://127.0.0.1:8002` and `NEXT_PUBLIC_DEMO_DIGITAL_PDF_ONLY=true`. Keep secrets out of public variables. The backend launcher checks the existing isolated PostgreSQL 18 identity (loopback 55434, accounting_intelligence_v2_demo) and Redis 6382. Do not initialize schemas or start duplicate/shared services. CPU Docling reuses the SSD models at `/mnt/d/Jonathan Files/AccountingIntelligence_SSD_Starter/AccountingIntelligence/models/docling`; no model download is needed.

## Synthetic accounts, fixtures and saved records

Three synthetic LOCAL_ADMIN accounts: main reviewer, exception/correction reviewer, controlled vendor-catalogue reviewer. Private credentials/TOTP seeds remain exclusively in Backend_V2 `runs/d4a/814d04e9829648768ce4d28eb3a268e3/accounts.json`, in that order. Use separate browser profiles with real login/TOTP; never capture credentials or MFA screens.

The same ignored directory contains the 20 PDF fixtures used by acceptance. `runs/d4a/manifest.json` records their hashes and locations. **They have already been uploaded.** Exact reuploads can return 409; repeated business references can correctly produce EX-007. Use saved records for the timed demo; do not call them fresh uploads. Original layout fixtures remain in Backend_V2 `tests/extraction/data/development/synthetic_invoice_001.pdf` and `tests/extraction/data/multidocument/{invoice_b,utility_bill,retail_receipt,unknown}.pdf`.

Open `/company/documents/{id}` under the indicated account:

| Scenario / account | Verified document ID | Actual result |
| --- | --- | --- |
| Valid invoice / main | 0e841af7-8269-487e-8835-bccb3f218e30 | 50.00, EXTRACTED / PASS, human review required |
| Incorrect invoice / exception | 9f7885dd-7633-4868-877f-c794ee2fd17a | 99.00, EXCEPTION / EX-005, left incorrect |
| Alternate invoice / main | de4e5729-6c7e-4b1d-89f5-f1a66aeb30f0 | 48.00, EXTRACTED / PASS |
| Utility bill / main | 885ca455-cd17-474e-a625-97df0ecf7b98 | 80.00, REVIEW_REQUIRED; field/date/period PASS, reconciliation NOT_CHECKED |
| Retail receipt / main | 12172914-a86f-480d-9b08-5c38ca1d9ba2 | 10.60, PASS including line/subtotal/total; still human review |
| Unknown / main | 45a885ab-3648-4af4-9367-5c9f9d1a76ae | EXCEPTION / review required; no accounting fields or lines |
| Saved correction / exception | c6745a2d-fc6d-4553-850a-efbf3c07895e | Original 99.00, current 50.00, revision 3, revalidated PASS |
| Business duplicate / main | 0e946471-d0a0-4bc4-be20-2ad5250217a2 | EX-007 high; links a9c705a2-9e16-4e7b-849a-31face286928 |
| Vendor suggestion / catalogue | 64102188-bb5a-46db-8ae9-937448caa09e | EX-008 medium; actual candidate/name similarity, not extraction confidence |

## Five-minute walkthrough

Prepare main and exception profiles before presenting. These saved examples were all uploaded through the real website, not seeded extraction records.

1. 0:00–0:45: Main profile: show Upload, Auto-detect, explicit intake category and real processing history. Open the valid invoice. Show 50.00, two units × 25.00, source classification, nullable confidence and human-review requirement. Focus Total to show actual text/page references and available boxes.
2. 0:45–1:30: Open alternate invoice: subtotal 50.00 − discount 5.00 + tax 3.00 = 48.00 / PASS. Open original source. Authenticated PDF delivery and uploaded-byte SHA256 were verified; headless Chrome showed a blank native PDF viewer, so visual PDF rendering remains a manual browser check.
3. 1:30–2:30: Bill: issuer/reference/account/period/due date and 80.00. Explain PASS for executed checks and NOT_CHECKED for unsupported balance/payment/credit reconciliation. Receipt: merchant/date/time, evidenced Card method, items and 10.60 / PASS. Neither classification nor PASS proves payment or approval.
4. 2:30–3:30: Exception profile: incorrect invoice 99.00 / EX-005; show actual field, high severity and arithmetic explanation. Open the separate saved correction: original 99.00 retained, current 50.00, revision 3 after revalidation. Reload. Recorded two-tab stale save returned 409, retained draft 49.00 and prevented overwrite. Do not replay corrections against these preserved examples merely to recreate the screenshot.
5. 3:30–4:30: Main profile: show EX-007 related-document link and multiple EX-001 findings as distinct rows. Catalogue profile if prepared: show actual EX-008 candidate, similarity and method explicitly labelled as name matching. EX-001–EX-008 were independently browser-tested.
6. 4:30–5:00: Unknown: actual explanation, original retained, empty financial fields, blocked standardisation. Stop without approving or creating a standardised record.

## Executed acceptance and preservation

- `npx playwright test --config playwright.d4a.config.ts`: exit 0, **20 passed**, 0 failed/skipped, 4.3 minutes. Real Chrome UI password/TOTP in three contexts; real upload/Docling/API data, no injected cookies or mocked extraction. Do not rerun against the already-used fixture set without a newly isolated synthetic run.
- Six document workflows, EX-001–EX-008, distinct missing-field rows, receipt mismatch/missing tax, bill period error, saved correction/reload/real stale 409 and authenticated source-tab delivery passed. All 20 uploaded source PDFs matched their submitted SHA256.
- `npm test`: exit 0, **15 passed**, 0 failed/skipped (12 contract/mock-fetch tests and 3 live read-only checks; these are not extraction proof).
- `npm run typecheck` and `npm run lint`: exit 0. `NEXT_BUILD_DIR=.next-d22-build; npm run build` (PowerShell environment assignment as below): exit 0, **40/40 pages**. Existing session 97552 completion recovered; no duplicate build required.
- Separate production build: `$env:NEXT_BUILD_DIR='.next-d22-build'; npm run build`. Existing prebuild cleanup is confined to this repository's selected build directory; keep dev output separate. Committed next-env.d.ts/tsconfig.json contain local build-path references; clean CI/default-build portability remains a pre-integration check.
- Screenshots: **71** in `test-results/d4a/2026-10-19T12-46-30-864Z/`; sanitized responses, IDs and diagnostics in `evidence.json`. Includes 1440×900, 1366×768 and 390×844. No body horizontal overflow; mobile content pane exceeds 370 px.
- Zero page errors or unexpected console messages. Expected stale 409 and observed Next development warnings (sticky auto-scroll, smooth-scroll guidance, logo aspect ratio) are recorded separately, not concealed.
- Post-browser read-only check: from Backend_V2 run the WSL Python command above with `runs/d4a-after.py`. Inspected script/helpers use SELECTs plus Redis PING and local report writes; no schema/data mutation. Exit 0: **68 protected documents unchanged**, 20 D4-A synthetic documents, **0 approvals / 0 standardised records** in D4-A tenants. Evidence: Backend_V2 `runs/d4a/post-browser-database-check.json`.

## Limits and recovery

Only tested labelled English digital PDFs/simple tables are supported here. No arbitrary scan/OCR/layout, Qwen inference, production login or deployed-backend compatibility claim. Source blocks can be broader than individual field spans; absent values stay null. List pages show stored intake kind; detail uses verified classification. Bills retain unsupported reconciliation checks; receipt PASS applies to supported evidenced arithmetic, not payment status. Vendor/PO checks remain NOT_CHECKED when authorised reference data is absent.

On exact-file 409 open the saved document. On uncertain upload/save failure inspect current document/revision before retrying. Stale 409 requires reviewing refreshed values; never force overwrite. If private source is unavailable, inspect the authenticated file response; do not draw a fake preview. Preserve all screenshots and private ignored run resources. Do not migrate/reset/reseed, approve records, change shared services, or merge/deploy for recovery.

D4-A is complete for the stated local checks, with native PDF visual rendering still unverified. Production integration is **NO-GO pending compatibility review**: latest remote backend features contains a bank route absent from V2; Vercel production branch/environment and deployed backend contract are unverified. A laptop loopback backend is unavailable to Vercel. Do not push or merge automatically.
