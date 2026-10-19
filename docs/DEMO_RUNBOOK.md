# Five-minute lecturer demo — D2 (19 October 2026)

Verified: real browser password/TOTP sign-in, PDF upload, CPU Docling extraction,
classification, persisted fields/evidence, Decimal validation and revision-aware
correction. No mock routes, injected cookies, automatic approval or financial seeds.

## Start / verify
Frontend: http://127.0.0.1:3000 · Backend: http://127.0.0.1:8002
Health: http://127.0.0.1:3000/api/health should return `{"status":"ok"}`.
The frontend's ignored `.env.local` sets `BACKEND_URL=http://127.0.0.1:8002`
and `NEXT_PUBLIC_DEMO_DIGITAL_PDF_ONLY=true`. Browser API calls use the existing
same-origin Next.js proxy; never place secrets in NEXT_PUBLIC variables.

Services are running. If restarting, use separate terminals:
```powershell
docker start saic-v2-d1a-postgres18 saic-v2-d1a-redis
wsl -d Ubuntu --cd /mnt/c/Users/60103/Documents/GitHub/Accounting_Intelligence_Backend_V2 --exec /home/donut99/.venvs/accounting-intelligence/bin/python -B scripts/d1a.py api
wsl -d Ubuntu --cd /mnt/c/Users/60103/Documents/GitHub/Accounting_Intelligence_Backend_V2 --exec /home/donut99/.venvs/accounting-intelligence/bin/python -B scripts/d1a.py worker
```
From Frontend_V2:
```powershell
$env:NEXT_BUILD_DIR='.next-d2-dev'
npm run dev -- --port 3000 --hostname 127.0.0.1
```
Do not start duplicate instances or rerun database initialization/reset scripts.

## Accounts / synthetic PDFs
Use only the two **LOCAL_ADMIN** synthetic accounts in backend
`runs/d1a/accounts.json`: first for the complete invoice, second for the incorrect
invoice. Obtain password/TOTP privately from that ignored local file or the
configured authenticator. Never paste credentials or TOTP seeds into browser
console, source, screenshots or this runbook. Existing login and six-digit
authenticator UI are unchanged.

Fixtures in Backend_V2:
- `runs/d1a/demo-ready/complete.pdf`: supplier invoice, line/subtotal/total 50.00.
- `runs/d1a/demo-ready/incorrect.pdf`: deliberate total 99.00 with line/subtotal 50.00.
These are invented classroom transactions; extraction and processing are real.

## Demonstration sequence
1. **0:00–0:45** Sign in as the first account, complete TOTP, continue to workspace.
2. **0:45–1:30** Open Upload. Choose complete.pdf, Invoice and explicit Accounts
   Payable. Click **Upload and process**; watch actual job states. Click
   **Review extracted document** after processing.
3. **1:30–2:15** Show EXTRACTED / PASS / human review required, classification,
   supplier, invoice/date/currency, subtotal/tax/total and line items. Focus Total
   to show source page/reference/text/coordinates; **Open original source** opens
   the private original PDF. Null confidence says not provided; missing discount
   stays not provided. No payment/settlement status is inferred.
4. **2:15–3:15** In a separate browser profile/incognito context, sign in as the
   second account. Upload incorrect.pdf. Show EXCEPTION, EX-005 and the backend
   explanation: 50.00 does not match extracted 99.00. The Exceptions page shows
   the same persisted issue; return to the new document's Review page.
5. **3:15–4:15** As the synthetic reviewer, change Total to 50.00 and click its
   **Save field** button. Show saved revision 3 while extracted/raw 99.00 remains.
   Click **Save & revalidate**; result becomes EXTRACTED / PASS, still requiring review.
6. **4:15–5:00** Reload and show persisted 50.00 plus original 99.00. Optionally
   demonstrate a second tab opened at revision 2: stale save returns 409, keeps
   the draft and disables resubmission until the reviewer edits against refreshed
   data. Stop without approving or creating a standardized record.

## Checks / evidence
- `npm test`: 10 passed (7 focused contract checks + 3 real read-only backend checks).
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npx playwright test --config playwright.d2.config.ts`: one real Chrome
  workflow passed; 1440x900, 1366x768 and mobile screenshots captured.
- Latest browser IDs: complete `18b024e4-dbf0-4f50-85fc-0dcb24912357`;
  corrected incorrect `19c9a3cf-223b-47ca-95d3-286825621247`, revision 3.
- Screenshots: `test-results/d2-live/d2-live-real-website-login-5a789-rrection-and-stale-revision/`.
  Login/OTP traces/videos/screenshots are disabled; captures occur after sign-in.
- Two earlier browser attempts failed on test locators for the exceptions table;
  corrected locator and full final walkthrough passed. Legacy browser suites
  with unrelated hardcoded accounts were not run.

## Recovery / limits
A duplicate upload is 409: open the existing document instead of pretending a new
extraction succeeded. Queue dispatch failure or timeout is explicit; check the
dedicated worker and Documents before retrying. On session expiry sign in again;
do not replay an uncertain correction. On 409 review the refreshed saved value.
Original PDF embedding depends on browser PDF support; use Open original source
if an embedded viewer is blank. Authenticated source bytes/evidence were verified.
Only labelled digital PDF invoices are verified; camera/OCR/other kinds are
disabled for this demo. Approval, exports, P1 features and production crash
recovery/full C1-PG concurrency/immutability are not verified here. Backend's
known re-extraction carry-forward and immutable-record trigger risks remain:
do not re-extract corrected records or demonstrate amendments/approval on this
evidence. No backend source/configuration, schemas or shared services were changed; only the authorized synthetic workflow data and processing artifacts were created.
