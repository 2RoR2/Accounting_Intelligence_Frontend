# Five-minute lecturer demo - D2.2 (19 October 2026)

Verified real Chrome password/TOTP login -> authenticated PDF upload -> RQ/CPU Docling -> persisted extraction/evidence -> backend validation -> correction/reload/stale revision. No mocked routes, injected cookies, fabricated extraction or automatic approvals. Frontend_V2 / feature/accounting-v2; backend source/schema unchanged.

## Start / verify

Frontend: http://127.0.0.1:3000 | Backend: http://127.0.0.1:8002
Both are left running. Frontend /api/health returns 200 through the same-origin proxy.
Ignored .env.local retains BACKEND_URL=http://127.0.0.1:8002 and NEXT_PUBLIC_DEMO_DIGITAL_PDF_ONLY=true. PDF-only now includes invoices, bills, receipts and review of unknown content; camera/other formats remain disabled. Never put authentication secrets in NEXT_PUBLIC settings.

If stopped, reuse the existing isolated services; do not initialize databases or start duplicates. In separate terminals:
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
The backend launcher checks its isolated database/server identity. CPU Docling requires the existing SSD model directory visible in WSL at /mnt/d/Jonathan Files/AccountingIntelligence_SSD_Starter/AccountingIntelligence/models/docling. Restore its existing mount if unavailable; do not download models or change shared services.

## Accounts and fixtures

Use the existing two synthetic LOCAL_ADMIN accounts, credentials/TOTP seeds privately in backend runs/d1a/accounts.json. First account: valid invoice and four new kinds/layouts. Second account: deliberately incorrect invoice. Use separate browser profiles/contexts, real password and six-digit TOTP. No credentials in this document, logs, screenshots or browser console.

Six fresh, unused synthetic PDFs are prepared in frontend test-results/demo-ready/:
SYN-001.pdf, SYN-BAD-001.pdf, invoice_b.pdf, utility_bill.pdf, retail_receipt.pdf, unknown.pdf.
These preserve the backend fixture bytes plus harmless unique PDF comments to avoid duplicate hashes. They have not been uploaded by this acceptance run. Use each once; a repeated exact file correctly returns 409.
Original fixtures remain in Backend_V2: tests/extraction/data/development/synthetic_invoice_001.pdf; runs/d1a/demo-ready/incorrect.pdf; tests/extraction/data/multidocument/{invoice_b,utility_bill,retail_receipt,unknown}.pdf.

## Five-minute walkthrough

Prepare a second signed-in browser context before presenting. For a strict five minutes, use the verified saved document links below for the four additional examples; all were uploaded through the real website during acceptance.

1. 0:00-0:45: Sign in as first synthetic reviewer with TOTP. Open Upload. Show Auto-detect / unsure, enabled Invoice/Bill/Receipt options and explicit AP/AR intake category. Type selection is a hint; source contents determine classification.
2. 0:45-1:30: Upload fresh SYN-001.pdf with explicit Accounts Payable. Watch real processing, open Review. Show invoice 50.00 / EXTRACTED / PASS, line 2 x 25.00, nullable confidence and human-review requirement. Focus Total for real page/ref/box evidence; Open original source retrieves the private PDF.
3. 1:30-2:20: Open the verified bill and receipt links. Bill shows issuer, bill/account reference, billing period, due date and 80.00; absent tax/subtotal/quantity/unit price say Not provided. Receipt shows merchant, reference, transaction date/time, evidenced Card payment method and total 10.60. Show Validation: REVIEW REQUIRED, NOT CHECKED rows and disabled standardisation; neither is labelled PASS or paid.
4. 2:20-3:00: Open Unknown: Unknown / Needs Review, actual classification explanation, retained original source, EX-002, empty accounting fields and blocked standardisation. Open Invoice B: customer/due date, subtotal 50.00 - discount 5.00 + tax 3.00 = 48.00 / PASS.
5. 3:00-4:15: In the second account upload fresh SYN-BAD-001.pdf. Show total 99.00 / EXCEPTION / EX-005 and actual backend arithmetic explanation. Change Total to 50.00, Save field, show new revision 3 and original extracted 99.00 retained. Save & revalidate; PASS still requires human review.
6. 4:15-5:00: Reload: saved 50.00/revision 3 persists. Explain or demonstrate a tab opened at revision 2: stale save returns 409, preserves draft and requires reviewing refreshed values. Stop without approving or creating a record.

## Final browser evidence

All six cases used new website uploads and real processing. Open /company/documents/{id} under the account indicated:

| PDF / account | ID | Actual result |
| --- | --- | --- |
| SYN-001 / first | b9412b3c-df41-4241-a197-d6fd59dc2332 | invoice, 50.00, EXTRACTED/PASS |
| SYN-BAD-001 / second | dfa56e13-4620-4ab8-be84-4b709ecbf37e | original 99.00, EXCEPTION/EX-005; now corrected 50.00, revision 3, PASS still review-required |
| invoice_b.pdf / first | e5663203-05ec-4a01-9bf1-67a97c7213f2 | invoice, 48.00, EXTRACTED/PASS |
| utility_bill.pdf / first | d6259a8c-20e4-431c-be63-411670d37d74 | bill, 80.00, EXTRACTED/REVIEW_REQUIRED, required-field/math NOT_CHECKED |
| retail_receipt.pdf / first | 96fcf2ff-97e3-40c6-9b65-7b7ca1be10bf | receipt, 10.60, EXTRACTED/REVIEW_REQUIRED, required-field/math NOT_CHECKED |
| unknown.pdf / first | 5e7c7ab9-1dc9-4ab1-9b1a-ca8c8a812c54 | unknown, EXCEPTION/REVIEW_REQUIRED, no financial fields/lines |

PATCH returned 200 with expectedContentRevision=2/new contentRevision=3; stale PATCH returned 409 and retained draft 49.00. Reloaded API values: normalizedValue=99.00/currentValue=50.00. All source-file HTTP requests returned authenticated 200/application/pdf. Zero page errors. No approval/record-creation mutation was used.

13 screenshots retained (no login/TOTP captures, traces or videos):
test-results/d2-live/d2-live-real-multi-documen-5600c-ion-and-revision-correction/
Key files: valid-1440.png, valid-1366.png, valid-mobile.png, incorrect.png, stale-revision.png, corrected-reloaded.png, invoice-review.png, bill-review.png, bill-not-checked.png, receipt-review.png, receipt-not-checked.png, receipt-mobile.png, unknown-review.png.
Screenshots inspected for invoice, bill NOT_CHECKED, unknown and mobile receipt. Main pane fills mobile viewport after correcting the existing mobile shell width; screenshots cover 1440x900, 1366x768 and 390x844.

## Executed checks

- npm run typecheck -> exit 0.
- npm run lint -> exit 0.
- npm test -> exit 0; 15 passed, 0 failed/skipped (12 contract tests, 3 real read-only backend checks). Contract tests use synthetic DTOs/mock fetch, not extraction proof.
- With NEXT_BUILD_DIR=.next-d22-build, npm run build -> exit 0, 40 pages generated. Build directory was verified inside Frontend_V2 before existing prebuild cleanup; dev build remained separate. Next-generated next-env.d.ts/tsconfig includes reflect these local build directories.
- npx playwright test --config playwright.d2.config.ts -> exit 0; 1 full six-PDF real Chrome workflow passed (1.5m), 0 failed/skipped; actual password/TOTP, no auth/parser mocks or injected sessions.
- git diff --check -> exit 0. Frontend/backend health endpoints -> 200.
- Earlier verification attempts exposed a test syntax/JSX-runner mismatch and a badge locator mismatch. Unit tests now exercise DTO contracts in the existing runner; real rendering is verified by Chrome. Final full browser run passed after the screenshot-confirmed mobile width fix.
- Legacy unrelated browser suites with hardcoded accounts were not run. Full backend concurrency/immutability and new bill/receipt validation are not claimed verified.

## Contract and recovery limits

Source classification (including unknown) takes precedence over stored kind in detail headings/labels. Original intake identifier, stored kind and category remain visible. The list API lacks source classification: its column explicitly says Stored kind; open Review for source classification. Unknowns retain the backend invoice intake placeholder without being displayed as invoices in detail.
Bill/receipt checks remain genuinely NOT_CHECKED until backend/Aina implements their policies; standardisation and approval controls require actual PASS and existing review state. Missing monetary values never become zero; no payment/settlement inference or confidence fabrication.
Digital PDFs with supported explicit English labels/simple tables only; OCR/scans/camera/arbitrary layouts remain unsupported. Source boxes may cover an entire merged block: UI retains text spans and labels that scope. Embedded PDF rendering depends on browser support (headless Chrome screenshots show a blank native viewer); Open original source works and source bytes were verified. No synthetic preview is drawn.
On duplicate 409 open the existing document. On uncertain upload/correction failure inspect Documents/current revision before retrying; do not replay mutations blindly. Backend's re-extraction-over-correction guard and existing immutable-record trigger limits remain backend concerns; do not demonstrate amendments or approval as verified.
Stop after D2.2. Next smallest task is lecturer review of the preserved local workflow; backend bill/receipt validation is a separate follow-up.
