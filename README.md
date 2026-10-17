# Accounting Intelligence Frontend

Next.js App Router, React, strict TypeScript, and Lucide. The frontend uses the FastAPI backend as its source of truth through the typed service layer in `src/lib/api`. It does not provide database security or replace backend authorization.

## Run

```sh
cd Accounting_Intelligence_Frontend
npm install
npm run dev
```

Open http://localhost:3000. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

## Sample accounts

At `/login`, enter a company email below and any non-empty password. The app then opens `/verify-otp` for the six-digit email verification code. A successful verification opens `/welcome` before the user continues to their role dashboard. There is no account or role dropdown: the entered email determines the workspace. Passwords are never saved in this frontend package. Real OTP email delivery requires the backend integration marked in `auth.service.ts`.

| Account | Company | Role |
| --- | --- | --- |
| admin@saic.example | SAIC | Super Admin |
| alice@abc.example | ABC Sdn Bhd | Local Admin |
| rachel@abc.example | ABC Sdn Bhd | Accountant |
| david@xyz.example | XYZ Sdn Bhd | Local Admin |
| sarah@xyz.example | XYZ Sdn Bhd | Accountant |

## Walkthrough

1. Request company access from the landing page.
2. Log in as SAIC. Review the new request under Pending Approvals, approve it, and choose its seat limit.
3. Open its tenant → Users → View → Open activation. Activate the Local Admin with a password meeting the displayed checklist.
4. Sign in as that Local Admin. Invite an accountant from Users. Active users and pending invitations both reserve seats.
5. Open the accountant’s activation link and activate the account. Sign in as that accountant.
6. Upload a PDF/image/XLSX. The backend creates a processing job; the upload screen polls `GET /api/processing/jobs/{job_id}` and displays the real backend status. The browser does not advance document statuses locally.
7. Open the document. Save Total Amount as `848.00`. Save the reference `PO-2192` to confirm its low-confidence value. Enter a correction note and select Save & revalidate.
8. Open Validation, then Create standardised record. Open Standardised Record to review the immutable snapshot. Export CSV from the records list.
9. Switch to Local Admin to see company documents, records, account usage, and reports.
10. Switch to SAIC to inspect monitoring, metadata, and performance. Enter Support View with a reason to access a read-only financial record; the event is audited.
11. Switch to Sarah at XYZ. ABC documents and records are filtered out.

Development data comes from the backend PostgreSQL seed in `Accounting_Intelligence_Backend/database/mock_data.sql`. Do not use live customer data in local development.

## Architecture and integration

- `src/types`: shared domain contracts.
- `src/lib/api`: authenticated FastAPI service functions consumed by UI features.
- `src/lib/permissions`: role and tenant access checks for the UI layer.
- `src/features/superadmin`, `localadmin`, and `users`: role-owned route composition and role-specific workflows.
- `src/features/common`: reusable dashboard, document, exception, record, monitoring, settings, hooks, and user-management workflows.
- `src/features/auth`: unauthenticated onboarding and account-access pages.
- `src/components/common`: reusable tables, dialogs, layouts, charts, and document preview components.
- `src/hooks/use-resource.ts`: loading, error, reload, and cross-tab refresh handling.

Frontend filtering shapes the UI only. Real tenant isolation is enforced by the backend API. Frontend route guards and role checks are convenience boundaries, not security boundaries. Authentication cookies, authorization, workflow transitions, and audit logging are backend responsibilities.

SAIC record APIs return metadata by default. Financial detail is retrieved through `openSupportView(reason)` and displayed without editing controls. Audit metadata hides extracted financial values for SAIC.

Dashboard counts and processing data are loaded through backend services. Preferences are saved as workspace settings. The upload flow uses backend job polling with an absolute two-minute observation deadline; each request has its own 15-second timeout, transient failures use bounded retry, and polling never cancels the backend job.

The queue worker is responsible for extraction status and persistence. `SUCCEEDED` must only be reported after extraction and required database writes commit. Qwen/Ollama extraction and full provider/worker/database integration remain environment-dependent and are not claimed as fully verified here.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`tests/workflows.test.ts` runs backend API smoke checks against `API_BASE_URL` (default `http://127.0.0.1:8000`) and skips cleanly when the backend is not running. Browser smoke tests use installed Chrome (`npm run test:browser`) against a running app at http://localhost:3001. Set `PLAYWRIGHT_BASE_URL` to test another local port.

Run `npm run typecheck` and `npm run lint` before handoff. Backend integration tests require the backend test dependencies, PostgreSQL, Redis/RQ, and configured provider services; they are not replaced by frontend typechecking.

The interface uses navy `#061433`, blue `#022fa2`, white, and light blue `#eaf5ff`. Success indicators use blue; warning and error labels retain distinct text and semantic accents. Wide tables scroll within their panels and keep action columns visible.
