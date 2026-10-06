# Accounting Intelligence Frontend

The frontend is a Next.js App Router application for the Accounting Intelligence public site and role-based workspace. It owns the user interface, navigation, form behavior, MFA screens, dashboards, document review views, and browser fixture repositories.

## Features

- Public landing page and company access request flow.
- Login, account activation, forgot password, reset password, and welcome pages.
- Accountant flow: email/password -> email OTP -> new password -> accountant workspace.
- Privileged flow: email/password -> QR-based TOTP setup or authenticator verification.
- Six-box OTP entry with paste, backspace, delete, focus movement, and resend countdown.
- Invisible-ink manual TOTP setup key display.
- Session-aware protected routes and role-based navigation.
- Super Admin, Local Admin, and Accountant workspace layouts.
- Invoice upload, extraction review, validation, exception handling, and standardized records using fixture data.
- Tenant-aware UI filtering, user management, reports, monitoring, settings, and support view.
- Responsive styles for desktop, tablet, and mobile layouts.
- Browser and unit tests for layout, columns, workflows, and authentication screens.

## Project structure

```text
Accounting_Intelligence_Frontend/
+-- src/
¦   +-- app/                  # Next.js routes and layouts
¦   +-- components/           # Shared UI components
¦   +-- features/
¦   ¦   +-- auth/             # Public pages and authentication UI
¦   ¦   +-- common/           # Shared workspace screens and workflows
¦   ¦   +-- localadmin/       # Local Admin features
¦   ¦   +-- superadmin/       # Super Admin features
¦   ¦   +-- users/            # User and invitation management
¦   +-- lib/
¦   ¦   +-- api/              # Backend API clients
¦   ¦   +-- mock/              # Browser fixture repositories
¦   ¦   +-- permissions/       # Client-side role and tenant checks
¦   +-- hooks/                # Data and refresh hooks
¦   +-- styles/               # common.css and role-specific styles
¦   +-- types/                # Shared TypeScript contracts
¦   +-- middleware.ts         # Route/session handling where applicable
+-- tests/
¦   +-- browser/              # Playwright browser tests
¦   +-- *.test.ts             # Unit and workflow tests
+-- public/                   # Static assets
+-- next.config.mjs           # Next.js and API proxy configuration
+-- package.json              # Scripts and dependencies
+-- .env.example              # Frontend environment template
```

## Run locally

```powershell
cd Accounting_Intelligence_Frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend proxies `/api/*` to `BACKEND_URL`, normally `http://127.0.0.1:8000`. Start the backend separately for real authentication.

## Configuration

Set `BACKEND_URL` in `.env.local` when the API uses another address. Restart Next.js after changing environment values. For UI-only development, set `NEXT_PUBLIC_AUTH_MODE=mock`; remove it to use the real backend API.

## Authentication behavior

- Sign-in OTPs expire after 60 seconds.
- Password-reset OTPs expire after 10 minutes.
- Both flows show a 60-second resend countdown.
- Five failed verification attempts are allowed.
- Resending invalidates the previous OTP.
- Successful verification invalidates the OTP immediately.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
```



## Deploy to Vercel

Import this repository into Vercel with the project root set to `Accounting_Intelligence_Frontend`. Vercel detects Next.js automatically.

Set this environment variable in Vercel for Production, Preview, and Development:

```env
BACKEND_URL=https://your-public-backend.example.com
```

`BACKEND_URL` must be a public HTTPS URL for the deployed FastAPI service. Do not use `localhost` or `127.0.0.1` in Vercel. The Next.js rewrite forwards `/api/*` requests to that backend, keeping authentication requests on the frontend origin.

Configure the backend `FRONTEND_ORIGIN` to the exact Vercel URL, enable `COOKIE_SECURE=true`, and ensure the backend accepts HTTPS requests. Deploy the backend separately; Vercel hosts the frontend only.
