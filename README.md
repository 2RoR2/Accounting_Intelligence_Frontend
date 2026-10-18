# Accounting Intelligence — Frontend

A Next.js 15 web application designed for accountants and financial administrators to ingest, extract, validate, review, and approve business documents (invoices, receipts, and bills) powered by FastAPI, PostgreSQL 18, Redis 7 / RQ, and Docling OCR.

---

## Architecture & System Overview

- **Framework:** Next.js 15.5.25 (App Router, React 19, strict TypeScript 5.8).
- **Styling:** Custom design system built with CSS variables (`src/styles/accountant.css`) and Lucide React icons.
- **Backend API Integration:** Direct HTTP proxy via `next.config.mjs` routing `/api/*` to the FastAPI backend service (`http://127.0.0.1:8000`).
- **Data Persistence:** All uploaded documents, extracted fields, validation results, exceptions, and approved accounting records are stored in PostgreSQL (`documents`, `raw_extractions`, `field_predictions`, `field_corrections`, `exceptions`, `standardised_records`, `audit_logs`).
- **Processing Engine:** Redis 7 / RQ worker queue executing asynchronous Docling OCR parsing and M1–M4 accounting validation pipelines.

---

## Prerequisites & Backend Dependencies

The frontend expects the following local backend services to be active:
1. **PostgreSQL 18** (or PostgreSQL 14+): listening on port `5434` (or configured database port).
2. **Redis 7**: listening on `127.0.0.1:6379`.
3. **Outbox Dispatcher / Worker**: Python worker listening on Redis queue `cpu_tasks`.
4. **FastAPI Backend**: running on `http://127.0.0.1:8000` from `Accounting_Intelligence_Backend` (`feature/backend-integration` branch).

---

## Local Setup & Development

### 1. Repository & Branch
Ensure you are on the local integration branch:
```sh
git checkout feature/frontend-integration
```

### 2. Environment Configuration
Copy `.env.local.example` to `.env.local`:
```sh
cp .env.local.example .env.local
```

Default configuration:
```env
BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_AUTH_MODE=api
```
- `BACKEND_URL`: URL of the FastAPI backend service.
- `NEXT_PUBLIC_AUTH_MODE`: Set to `api` for genuine backend communication and cookie sessions, or `mock` for standalone browser fixture mode.

### 3. Install Dependencies
```sh
npm install
```

### 4. Running the Development Server
```sh
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Running the Production Build
```sh
npm run build
npm start
```

---

## Automated Quality Gates

Run all quality checks prior to staging commits:

```sh
# 1. Typecheck
npm run typecheck

# 2. Linting
npm run lint

# 3. Unit Tests (Financial Display, Permissions, Seat Management)
npm test

# 4. Production Build Verification (All 38 routes)
npm run build

# 5. Playwright Browser Acceptance Test
npm run test:browser
```

---

## Browser Acceptance & E2E Testing

The Playwright browser test suite (`tests/browser/accountant_integration.spec.ts`) verifies the complete accountant and administrator journey against live services:
- **Honest Dashboard KPIs:** Confirms extraction accuracy and manual-entry reduction display `Not measured` badges when unbenchmarked.
- **Upload Experience:** Verifies that only supported `.pdf` documents are advertised, and obsolete simulated selectors are hidden in API mode.
- **Asynchronous Document Extraction:** Dynamically generates a unique invoice fixture, uploads it to FastAPI, verifies Redis/RQ processing, and confirms PostgreSQL storage.
- **Review & Financial Integrity:** Verifies supplier name, currency, line items, and monetary totals without `RMNaN`. Unscored fields show `Confidence unavailable`.
- **Inline PDF Preview:** Confirms PDF rendering via authenticated blob URL iframe without forced download dialogs.
- **Field Correction & Provenance:** Simulates accountant field modification, triggers `Reviewed` status tag, and records an immutable audit record.
- **Approval & Standardisation:** Executes document revalidation and creates an immutable snapshot in `standardised_records`.
- **Duplicate Detection (`EX-007`):** Uploads the same PDF a second time, asserts worker detection of `EX-007` duplicate exception, and verifies that accountant approval is disabled.
- **Exceptions Workflow:** Demonstrates `LOCAL_ADMIN` exception assignment and resolution with mandatory audit notes.
- **Duplicate Override Authorization:** Demonstrates administrator duplicate override with mandatory justification recording.
- **Multi-Tenant Isolation:** Verifies that Tenant B users cannot inspect or access Tenant A's documents, records, or exceptions.

---

## Demo Accounts & Authentication

In API mode, authentication is managed via secure, HTTP-only session cookies issued by FastAPI (`ai_access`). Standard test accounts seeded in PostgreSQL:

| Account Email | Company (Tenant) | Role | Notes |
| :--- | :--- | :--- | :--- |
| `rachel@abc.example` | ACME (Tenant A) | `ACCOUNTANT` | Everyday document upload, review, and standardisation. |
| `alice@abc.example` | ACME (Tenant A) | `LOCAL_ADMIN` | Team management, exception resolution, duplicate overrides. |
| `david@xyz.example` | BetaCorp (Tenant B) | `LOCAL_ADMIN` | Used for cross-tenant isolation testing. |
| `sarah@xyz.example` | BetaCorp (Tenant B) | `ACCOUNTANT` | Tenant B accountant. |
| `admin@saic.example` | SAIC | `SUPER_ADMIN` | Platform oversight, support auditing. |

---

## Status of Features & Next Sprint Roadmap

| Feature / Capability | Status in Sprint A | Roadmap (Sprint B) |
| :--- | :--- | :--- |
| **PDF Ingestion & OCR** | **REAL** (Docling layout & text extraction) | Support multi-page TIFF and scanned image preprocessing. |
| **Validation Engine** | **REAL** (M1–M4 mathematical & vendor rules) | Dynamic company rule customization. |
| **Duplicate Detection** | **REAL** (`EX-007` SHA-256 + supplier/invoice matching) | Cross-document similarity scoring. |
| **Exceptions API** | **REAL** (Tenant-scoped, assignment & resolution) | Multi-assignee escalation alerts. |
| **Standardised Records** | **REAL** (PostgreSQL snapshots) | Canonical JSON, CSV, and XLSX export endpoints. |
| **Purchase Order Matching** | MOCK / Schema Ready | Connect backend PO reference import and 3-way matching. |
| **Chart of Accounts (COA)** | MOCK / Static Suggestions | Connect backend GL account predictions and cost centers. |
| **Bank Reconciliation** | MOCK / Illustrative | Bank statement CSV import and money-out reconciliation. |
| **Profile & Password Updates** | Pending dedicated endpoints | Connect self-service password reset & profile endpoints. |
