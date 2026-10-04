# Accounting Intelligence

Next.js App Router, React, strict TypeScript, Tailwind CSS, and Lucide. All project files live in `frontend/`. No backend, database, real OCR, email, or authentication server is implemented in this frontend package.

## Run

```sh
cd frontend
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
6. Upload a PDF/image/XLSX and choose **Total mismatch**. The workspace queues and extracts the document. File contents are not parsed or persisted; the preview is an explicitly labelled sample.
7. Open the document. Save Total Amount as `848.00`. Save the reference `PO-2192` to confirm its low-confidence value. Enter a correction note and select Save & revalidate.
8. Open Validation, then Create standardised record. Open Standardised Record to review the immutable snapshot. Export CSV from the records list.
9. Switch to Local Admin to see company documents, records, account usage, and reports.
10. Switch to SAIC to inspect monitoring, metadata, and performance. Enter Support View with a reason to access a read-only financial record; the event is audited.
11. Switch to Sarah at XYZ. ABC documents and records are filtered out.

Changes persist in this browser’s localStorage. Clear `accounting-intelligence-v1` and `ai:session` in browser storage to restore fixtures. Do not use live customer data in local development.

## Architecture and integration

- `src/types`: shared domain contracts.
- `src/lib/api`: promise-based service functions consumed by UI features. Replace these implementations with authenticated FastAPI calls; components need not depend on mock repositories.
- `src/lib/mock`: fixture generation and persistent browser repository.
- `src/lib/permissions`: role and tenant access checks for the UI layer.
- `src/features/superadmin`, `localadmin`, and `users`: role-owned route composition and role-specific workflows.
- `src/features/common`: reusable dashboard, document, exception, record, monitoring, settings, hooks, and user-management workflows.
- `src/features/auth`: unauthenticated onboarding and account-access pages.
- `src/components/common`: reusable tables, dialogs, layouts, charts, and document preview components.
- `src/hooks/use-resource.ts`: loading, error, reload, and cross-tab refresh handling.

Frontend filtering shapes the UI only. Real tenant isolation must be enforced by the backend API. Accounts and data are inspectable in browser storage; frontend route guards are not security boundaries. Replace `auth.service.ts` and permission checks with real authentication and backend authorization. The activation user ID is a mock account reference, not a token. No password or token appears in administrative data.

SAIC record APIs return metadata by default. Financial detail is retrieved through `openSupportView(reason)` and displayed without editing controls. Audit metadata hides extracted financial values for SAIC.

Dashboard counts reflect the local repository. Performance percentages and time-series charts are labelled illustrative benchmarks, not measured OCR performance. Preferences are saved as workspace settings. Real notifications, password resets, file storage, original-document rendering, job polling, and analytics require backend integrations.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`tests/workflows.test.ts` covers onboarding, reserved seats, correction and standardisation, tenant isolation, support audit, upload validation, and suspension. Browser smoke tests use installed Chrome (`npm run test:browser`) against a running app at http://localhost:3001. Set `PLAYWRIGHT_BASE_URL` to test another local port. The browser suite also checks email-only sign-in, separate administrative columns, brand colors, and mobile overflow.

The interface uses navy `#061433`, blue `#022fa2`, white, and light blue `#eaf5ff`. Success indicators use blue; warning and error labels retain distinct text and semantic accents. Wide tables scroll within their panels and keep action columns visible.
