# COS40005 — Integrated System Gap Audit Matrix
**Accounting Intelligence (ACCIA)**  
**Audit Target**: `Accounting_Intelligence_Frontend` (branch: `feature/frontend-integration`) & `Accounting_Intelligence_Backend` (branch: `feature/backend-integration`)  
**Audit Mode**: Read-Only Source Inspection  
**Date**: October 2026  

---

## 1. Executive Summary & Audit Methodology

This gap audit provides a source-level verification of the integrated Accounting Intelligence system against the approved COS40005 project architecture and functional specification. The audit assesses the end-to-end pipeline spanning the Next.js 14 frontend, FastAPI backend, Redis/RQ worker pool, Docling neural extraction engine, and PostgreSQL 18 relational persistence layer.

### Classification Taxonomy
- **REAL**: Fully operational against persistent backend data and PostgreSQL schema, verified by automated end-to-end integration tests.
- **PARTIAL**: Operational backend primitives or partial frontend UI exist, but the complete end-to-end accounting workflow is truncated, unlinked, or unmapped.
- **MOCK**: Frontend fixture, static hardcoded values, or simulated `localStorage` mutation masquerading as live functionality.
- **NOT IMPLEMENTED**: Feature declared in interface, documentation, or specifications with no functioning implementation in frontend or backend.
- **UNKNOWN**: Insufficient source code or architectural evidence to determine feasibility or state.

### Team Responsibilities Matrix
- **Jonathan**: Pipeline integration, Docling worker, queue architecture, M2-to-M3 adapter.
- **Rachel**: Authentication, session cookies, MFA, password reset, account management.
- **Angeline**: Frontend UI/UX, `accountant.css`, accessible components, document review & navigation.
- **Woon**: PO matching, validation rules, extraction scripts.
- **Aleeya**: PostgreSQL database schema, migrations, durable outbox table, triggers.

---

## 2. Comprehensive System-Wide Feature Inventory

| Area | Feature / Operation | Frontend Component & Path | Backend Service & Path | Database Artifacts | Status | Priority | Owner |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth** | Login & Token Issuance | `src/features/auth/login.tsx` | `app.py:login()` | `web_sessions`, `users` | **REAL** | P0 | Rachel |
| **Auth** | Multi-Factor Authentication | `src/features/auth/mfa.tsx` | `app.py:verify_mfa()` | `users.mfa_secret`, `password_challenges` | **REAL** | P0 | Rachel |
| **Auth** | First-Login Password Force | `src/features/users/force-password.tsx` | `app.py:change_password()` | `users.must_change_password` | **REAL** | P0 | Rachel |
| **Auth** | Active User Profile Edit | `src/features/common/settings/profile-page.tsx` | *None* | `readDb()` (localStorage) | **MOCK** | P1 | Rachel |
| **Auth** | Active User Password Change | `src/features/common/settings/profile-page.tsx` | `app.py:change_password()` (blocks active) | *None* | **PARTIAL** | P1 | Rachel |
| **Docs** | Synthetic PDF File Upload | `src/features/common/documents/documents.tsx` | `routers/documents.py:upload_document()` | `documents`, `pending_jobs` | **REAL** | P0 | Jonathan / Aleeya |
| **Docs** | Non-PDF Formats (PNG/XLSX/CSV) | `src/features/common/documents/documents.tsx` | `services/documents/manager.py` | *None* | **MOCK** | P1 | Jonathan |
| **Docs** | Outbox Job Dispatch & Worker | `src/lib/api/document.service.ts` | `infrastructure/queue/dispatcher.py` | `pending_jobs` | **REAL** | P0 | Jonathan / Aleeya |
| **Docs** | Docling Neural Extraction | *N/A (Background Worker)* | `infrastructure/queue/jobs.py` | `raw_extractions`, `field_predictions` | **REAL** | P0 | Jonathan |
| **Docs** | Document Status Polling | `src/features/common/documents/documents.tsx` | `routers/documents.py:list_documents()` | `documents.status` | **REAL** | P0 | Angeline / Jonathan |
| **Docs** | Processing Duration Metrics | `src/lib/api/document.service.ts` | `routers/documents.py:list_documents()` | `documents.processing_seconds` | **PARTIAL** | P1 | Jonathan / Aleeya |
| **Review** | Original PDF Inline Viewer | `src/components/common/documents/document-viewer.tsx` | `routers/documents.py:download_document()` | `documents.storage_path` | **REAL** | P0 | Angeline / Jonathan |
| **Review** | Structured Preview Card | `src/components/common/documents/document-viewer.tsx` | `routers/documents.py:get_document_result()` | `field_predictions` | **PARTIAL** | P0 | Angeline |
| **Review** | Confidence Score Display | `src/lib/api/document.service.ts` | `services/extraction/persistence.py` | `field_predictions.confidence` | **PARTIAL** | P0 | Angeline / Jonathan |
| **Review** | Bounding Box Coordinate Overlay | `src/components/common/documents/document-viewer.tsx` | `routers/documents.py:get_document_result()` | `field_predictions.evidence` | **PARTIAL** | P1 | Angeline / Jonathan |
| **Review** | Field Patch & Audit Trail | `src/lib/api/document.service.ts` | `routers/documents.py:correct_fields()` | `field_predictions`, `field_corrections` | **REAL** | P0 | Jonathan / Aleeya |
| **Validation** | Cross-Field & Vendor Rules | `src/lib/api/document.service.ts` | `services/validation/workflow.py` | `exceptions`, `vendors` | **REAL** | P0 | Woon / Jonathan |
| **Validation** | Revalidation Workflow | `src/lib/api/document.service.ts` | `routers/documents.py:revalidate_document()`| `documents.status`, `exceptions` | **REAL** | P0 | Jonathan / Woon |
| **Validation** | Bill / Receipt Specific Rules | *None* | `services/extraction/adapter.py` | *None* | **NOT IMPLEMENTED** | P1 | Woon / Jonathan |
| **Exceptions** | Per-Document Exception Display | `src/features/common/documents/document-detail.tsx` | `routers/documents.py:get_document_result()` | `exceptions` | **REAL** | P0 | Angeline / Jonathan |
| **Exceptions** | Global Tenant Exception Inbox | `src/features/common/exceptions/exceptions.tsx` | *None (`getExceptions` returns `[]`)* | `exceptions` | **MOCK** | P1 | Angeline / Jonathan |
| **Exceptions** | Exception Assignment & Workflow | `src/features/common/exceptions/exceptions.tsx` | *None* | `exceptions.assigned_to` | **NOT IMPLEMENTED** | P1 | Jonathan / Rachel |
| **Approval** | Document Approval & Snapshot | `src/features/common/documents/document-detail.tsx` | `routers/documents.py:approve_document()` | `standardised_records` | **REAL** | P0 | Jonathan / Aleeya |
| **Approval** | Duplicate Invoice Idempotency | `src/features/common/documents/document-detail.tsx` | `routers/documents.py:approve_document()` | `uq_records_duplicate_lookup` | **PARTIAL** | P0 | Aleeya / Jonathan |
| **Records** | Standardised Records Query | `src/features/common/records/records.tsx` | `routers/documents.py:list_records()` | `standardised_records` | **REAL** | P0 | Angeline / Jonathan |
| **Records** | Client-Side CSV Export | `src/features/common/records/records.tsx` | *None (Browser Blob)* | *None* | **PARTIAL** | P1 | Angeline |
| **Records** | Canonical JSON/XLSX Export | *None* | *None* | `canonical_accounting_record_schema_v1` | **NOT IMPLEMENTED** | P1 | Jonathan / Aleeya |
| **Metrics** | Dashboard KPI Calculations | `src/lib/api/processing.service.ts` | *None* | *None* | **MOCK** | P1 | Jonathan / Angeline |
| **Metrics** | Performance & Throughput Chart | `src/lib/api/processing.service.ts` | *None* | *None* | **MOCK** | P1 | Jonathan / Angeline |
| **Matching** | PO Import & 3-Way Matching | *None* | `validation/po_matching.py` (orphan) | *None* | **NOT IMPLEMENTED** | P1 | Woon / Aleeya |
| **Coding** | Chart of Accounts (COA) & GL | *None* | *None* | `canonical_schema (nullable)` | **NOT IMPLEMENTED** | P1 | Woon / Aleeya |
| **Reconcile** | Bank CSV Feeds & Money-In/Out | *None* | *None* | *None* | **NOT IMPLEMENTED** | P1 | Jonathan / Woon |
| **Layout** | Responsive Sidebar & Rail Mode | `src/components/common/layout/app-shell.tsx` | *None* | *None* | **REAL** | P0 | Angeline |

---

## 3. Deep-Dive Investigations of Audit Items

### Item 1: Incorrect Structured Preview Total `RMNaN`
- **Classification**: **PARTIAL**
- **Priority**: **P0** (Financial Data Display Integrity)
- **Responsible**: Angeline (Frontend Lead)
- **Exact File Paths & Functions**:
  - `src/components/common/documents/document-viewer.tsx:64-65`, `177-178` (`DocumentViewer`)
  - `src/components/common/ui/index.tsx:406` (`money()`)
  - `routers/documents.py:375-380` (`get_document_result()`)
- **Root Cause & Evidence**:
  In `document-viewer.tsx` line 64, the helper `value(key)` evaluates `f[key]?.original || f[key]?.value`. In line 178, it renders `money(Number(value("total", "0")))`. In `field_predictions`, Docling stores the unstripped string `"Total amount: MYR 50.00"` in `raw_value` and the cleaned numeric string `"50.00"` in `current_value`. Because `original` (`raw_value`) is truthy, `value("total")` resolves to `"Total amount: MYR 50.00"`. Passing this to `Number(...)` yields `NaN`. In `ui/index.tsx`, `money(NaN)` formats as `"RMNaN"`.
- **Proposed Fix**:
  In `document-viewer.tsx`, priority must be reversed to prefer verified current values over raw unparsed OCR text:
  `const value = (key: string, fallback = "—") => f[key]?.value || f[key]?.original || fallback;`
  For monetary formatting, extract clean numerical digits via regex before calling `money()`.
- **Acceptance Test**:
  Verify structured preview renders `RM 50.00` for invoice `SYN-001`, and that user field corrections immediately update the structured preview card.

---

### Item 2: 100% Confidence Displayed Despite Nullable Docling Confidence
- **Classification**: **PARTIAL**
- **Priority**: **P0** (Compliance with P0-04 Metric Fidelity)
- **Responsible**: Angeline (Frontend) & Jonathan (Backend Pipeline)
- **Exact File Paths & Functions**:
  - `src/lib/api/document.service.ts:158` (`mapToField()`)
  - `services/extraction/persistence.py:155-165` (`persist_extraction_run()`)
  - `database/migrations/0001_initial_schema.sql:233` (`field_predictions.confidence`)
- **Root Cause & Evidence**:
  The database schema defines `confidence NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1)` as nullable. In accordance with architectural rule P0-04, Docling rule-based extractions leave `confidence` as `NULL` rather than fabricating synthetic scores. In `routers/documents.py:445`, backend outputs `"confidence": f["confidence"]` (which is `null`).
  However, in `document.service.ts` line 158, the frontend applies an illegitimate fallback:
  `confidence: f.confidence != null ? Math.round(f.confidence * 100) : 100`
  This artificially displays `100%` confidence for uncalibrated heuristics.
- **Proposed Fix**:
  Update `ExtractedField` type in `src/types/extraction.ts` to `confidence: number | null`. When `null`, the UI badge must display `"Uncalibrated"` or `"Rule-based"` rather than `100%`.
- **Acceptance Test**:
  Synthetic invoice fields with null confidence must show `N/A` or `Rule-based` chip; only models providing probabilistic log-likelihoods may display percentage badges.

---

### Item 3: Dashboard Extraction Accuracy & Manual-Entry Reduction Calculations
- **Classification**: **MOCK**
- **Priority**: **P1** (Platform Observability)
- **Responsible**: Jonathan (Backend Metrics) & Angeline (Frontend UI)
- **Exact File Paths & Functions**:
  - `src/lib/api/processing.service.ts:26-105` (`getPerformanceMetrics()`, `getTrends()`)
  - `src/features/common/dashboard/accountant-dashboard.tsx:35-85`
- **Root Cause & Evidence**:
  `processing.service.ts` contains hardcoded static mocks:
  ```ts
  return {
    accuracy: "96.4%",
    entryReduction: "74.1%",
    avgProcessingSeconds: "8.7s",
    exceptionRate: "7.6%",
  };
  ```
  The monthly trends chart in lines 90–105 returns static dates from September 2026. None of these cards query PostgreSQL `documents`, `audit_logs`, or `field_corrections`.
- **Proposed Backend API**:
  `GET /api/metrics/summary`: Computes real aggregated metrics across `standardised_records` and `field_corrections`:
  - `accuracy`: $1 - \frac{\text{corrected\_fields}}{\text{total\_extracted\_fields}}$
  - `entryReduction`: $\frac{\text{untouched\_fields}}{\text{total\_fields}}$
  - `exceptionRate`: $\frac{\text{documents\_with\_exceptions}}{\text{total\_documents}}$
- **Acceptance Test**:
  Correcting 2 fields on an invoice must dynamically decrease extraction accuracy and increase correction count on dashboard refresh.

---

### Item 4: Incorrect or Missing Processing Durations
- **Classification**: **PARTIAL**
- **Priority**: **P1** (Performance Tracking)
- **Responsible**: Jonathan (Backend) & Aleeya (Database)
- **Exact File Paths & Functions**:
  - `routers/documents.py:170-195` (`list_documents()`)
  - `routers/documents.py:220-235` (`get_document()`)
  - `src/lib/api/document.service.ts:112, 132` (`mapToDocument()`)
  - `database/migrations/0001_initial_schema.sql:167-172`
- **Root Cause & Evidence**:
  PostgreSQL `documents` table has `uploaded_at`, `processing_started_at`, `processing_completed_at`, and `processing_seconds NUMERIC(8,2)`.
  When a document finishes extraction, `jobs.py:315` sets `processing_completed_at = now()` and calculates `processing_seconds`.
  However, `routers/documents.py:170` (`list_documents()`) omits `processing_seconds` from its `SELECT` statement:
  `SELECT id, document_code, original_filename, kind, category, status, file_size_bytes, uploaded_at, updated_at FROM documents`
  Because `processing_seconds` is missing from the list payload, `document.service.ts` line 112 defaults it to:
  `seconds: d.processing_seconds || 0`
  Consequently, all documents in the documents table and dashboard show `0.0s`. Only the single-document endpoint `GET /api/documents/{id}` includes the column.
- **Proposed Fix**:
  Add `processing_seconds` to `list_documents()` SQL query in `routers/documents.py:174, 186`.
- **Acceptance Test**:
  Document list table must display genuine elapsed worker execution duration (e.g., `3.4s`).

---

### Item 5: Repeated Approval of the Same Supplier Invoice
- **Classification**: **PARTIAL**
- **Priority**: **P0** (Accounting Control & Double-Payment Prevention)
- **Responsible**: Aleeya (Database Schema) & Jonathan (Backend Approval)
- **Exact File Paths & Functions**:
  - `routers/documents.py:586-640` (`approve_document()`)
  - `database/migrations/0001_initial_schema.sql:408` (`uq_records_duplicate_lookup`)
  - `validation/duplicate.py:25-50` (`find_duplicate_invoices()`)
- **Root Cause & Evidence**:
  In `database/migrations/0001_initial_schema.sql:408`, the database defines a partial unique index:
  `CREATE UNIQUE INDEX uq_records_duplicate_lookup ON standardised_records (tenant_id, lower(supplier_name), lower(invoice_number)) WHERE status = 'active';`
  Furthermore, `standardised_records` enforces `document_id UUID UNIQUE`.
  When approving Document A, a row is inserted into `standardised_records`. If a user uploads Document B with identical `supplier_name` and `invoice_number`, `approve_document()` in `routers/documents.py` checks:
  `SELECT count(*) FROM exceptions WHERE document_id = %s AND status = 'open'`
  If Document B was re-validated without passing `existing_invoices` to the validator, no duplicate exception is opened. When the accountant clicks "Approve", the `INSERT INTO standardised_records` violates `uq_records_duplicate_lookup`, throwing an unhandled database unique constraint violation and returning an opaque `500 Internal Server Error`.
- **Proposed Fix**:
  1. Catch `psycopg2.errors.UniqueViolation` on `uq_records_duplicate_lookup` in `approve_document()` and return HTTP `409 Conflict` with clear detail: `"A standardised record for supplier '{supplier}' and invoice '{invoice_number}' has already been approved."`
  2. Wire `existing_invoices` into `services/validation/workflow.py` so duplicate detection creates an open `EX-007` exception prior to approval.
- **Acceptance Test**:
  Attempting to approve a second document with duplicate invoice number must be blocked with HTTP 409 and display user-facing alert in UI.

---

### Item 6: Upload Format Claims vs Actual Supported File Types
- **Classification**: **PARTIAL**
- **Priority**: **P1** (Input Validation & User Guidance)
- **Responsible**: Jonathan (Backend Parser) & Angeline (Frontend Form)
- **Exact File Paths & Functions**:
  - `src/features/common/documents/documents.tsx:244, 254` (`DocumentsPage`)
  - `services/documents/manager.py:49-51` (`validate_pdf_content()`)
  - `services/documents/manager.py:117` (`save_uploaded_document()`)
- **Root Cause & Evidence**:
  In `documents.tsx:244-254`, the frontend UI explicitly advertises:
  `<small>PDF, PNG, JPG/JPEG, TIFF/TIF, XLSX, CSV · Maximum 20 MB per file</small>`
  `accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.xlsx,.csv"`
  However, the backend validation in `services/documents/manager.py:49` enforces strict PDF magic bytes:
  ```python
  if not content.startswith(b"%PDF-"):
      raise ValueError("Invalid document format: Only PDF documents are supported.")
  ```
  And line 117 hardcodes `'application/pdf'` into the database insert. Uploading any valid PNG, JPG, XLSX, or CSV file is immediately rejected with HTTP `400 Bad Request`.
- **Proposed Resolution**:
  Align frontend accept attributes and copy to the genuine supported formats (`.pdf` only for synthetic baseline, or implement image OCR conversion workers).
- **Acceptance Test**:
  Uploading a `.png` or `.xlsx` must either be handled by an active OCR/table worker or disallowed client-side with clear explanation.

---

### Item 7: Extraction Scenario Selector & Obsolete Simulated Text
- **Classification**: **MOCK / RESIDUAL**
- **Priority**: **P1** (UI Modernization)
- **Responsible**: Angeline (Frontend UI)
- **Exact File Paths & Functions**:
  - `src/features/common/documents/documents.tsx:305-323` (`Extraction scenario selector`)
  - `src/lib/api/document.service.ts:501, 540` (`uploadDocument()`)
- **Root Cause & Evidence**:
  In `documents.tsx:306-323`, the upload form renders a dropdown titled `"Extraction scenario"` with hint:
  `"The selected scenario generates sample extraction data; no OCR or AI is performed."`
  Options include `"Total mismatch"`, `"Successful invoice"`, `"Low-confidence reference"`, etc.
  In `document.service.ts:501`, when `!isFrontendMockEnabled`, the uploaded file is sent to `/api/documents/upload`. The `scenario` parameter is completely omitted from the payload and ignored by the backend, which runs genuine Docling neural extraction.
  The UI hint text directly contradicts the live system reality where Docling neural inference is executing.
- **Proposed Resolution**:
  Remove the obsolete scenario selector and simulated processing banner when running in API mode (`!isFrontendMockEnabled`).
- **Acceptance Test**:
  Upload form shows only live upload parameters (Document Category, Document Kind); mock scenario dropdown is unrendered.

---

### Item 8: Invoice / Bill / Receipt Handling & Automatic Document Classification
- **Classification**: **PARTIAL**
- **Priority**: **P1** (Classification Pipeline)
- **Responsible**: Jonathan (Backend) & Woon (Classifier)
- **Exact File Paths & Functions**:
  - `services/extraction/classify_document.py:25-60` (`classify_document()`)
  - `services/extraction/adapter.py:87-93` (`adapt_m2_to_m3()`)
  - `routers/documents.py:51, 83` (`parse_upload_payload()`)
- **Root Cause & Evidence**:
  A heading-based document classifier exists in `services/extraction/classify_document.py` and detects `"invoice"`, `"bill"`, and `"receipt"`.
  However, in `services/extraction/adapter.py:87-93`, the pipeline adapter explicitly halts on any document that is not an invoice:
  ```python
  doc_type = public_result.get("document_type")
  if not isinstance(doc_type, dict) or doc_type.get("value") != "invoice" or doc_type.get("status") != "classified":
      structural_issues.append({
          "field": "document_type",
          "code": "M2-STRUCTURAL-007",
          "message": "Missing or unsupported document_type"
      })
  ```
  Any document classified as a `bill` or `receipt` is blocked with structural code `M2-STRUCTURAL-007`, aborting validation and routing the document to `exception` status. There is no automated reclassification or routing.
- **Proposed Resolution**:
  Extend `adapt_m2_to_m3` and downstream validation to recognize `bill` and `receipt` schemas without raising `M2-STRUCTURAL-007`.
- **Acceptance Test**:
  Uploading a utility bill or retail receipt must classify correctly and route to appropriate bill/receipt processing flows.

---

### Item 9: Invoice-Specific Validation Wrongly Applied to Receipts or Bills
- **Classification**: **NOT IMPLEMENTED**
- **Priority**: **P1** (Domain Rules Engine)
- **Responsible**: Woon (Validation Rules)
- **Exact File Paths & Functions**:
  - `validation/models.py:44-61` (`Invoice`)
  - `validation/engine.py:22-48` (`validate_invoice_document()`)
  - `services/extraction/adapter.py:208-222` (`adapt_m2_to_m3()`)
- **Root Cause & Evidence**:
  The entire validation module (`validation/models.py`) defines a single Pydantic model: `Invoice`. It mandates:
  - `invoice_number: str = Field(min_length=1)`
  - `vendor_name: str = Field(min_length=1)`
  - `line_items: List[LineItem] = Field(min_length=1)`
  - Cross-field calculation: $\text{subtotal} + \text{tax\_amount} == \text{total\_amount}$
  Receipts typically lack an invoice number, separate line items, or customer tax identifiers. When a receipt enters validation, it fails with missing field `EX-001` (`invoice_number`) or `M2-STRUCTURAL-001` (`line_items`). There are no distinct `Receipt` or `Bill` validation models.
- **Proposed Resolution**:
  Introduce `Receipt` and `Bill` validation models in `validation/models.py` with tailored mandatory field sets (e.g., receipt requires `merchant_name`, `transaction_date`, `total_amount`, but optional `receipt_number`).
- **Acceptance Test**:
  A valid retail receipt without an invoice number must achieve `status = 'validated'` when classified as a receipt.

---

### Item 10: Real Exception Creation, Assignment, and Resolution
- **Classification**: **PARTIAL** (Backend Storage/Resolution: REAL; Tenant Inbox & Assignment: MOCK/NOT IMPLEMENTED)
- **Priority**: **P0** (Core Accountant Review Workflow)
- **Responsible**: Jonathan (Backend Router) & Angeline (Frontend UI)
- **Exact File Paths & Functions**:
  - `src/lib/api/document.service.ts:452-455` (`getExceptions()`)
  - `src/features/common/exceptions/exceptions.tsx:1-150` (`ExceptionsPage`)
  - `services/validation/workflow.py:102-111, 221-230` (`run_document_validation()`)
  - `database/migrations/0001_initial_schema.sql:280-310` (`exceptions` table)
- **Root Cause & Evidence**:
  - Backend exception persistence is real: `workflow.py` inserts validation failures into `exceptions` with codes `EX-002`, `EX-005`, etc. Re-validation updates them to `status = 'resolved'`. `GET /api/documents/{id}/result` returns exceptions for that specific document.
  - However, in `src/lib/api/document.service.ts:452`:
    ```ts
    export async function getExceptions(user: User): Promise<Exception[]> {
      if (!isFrontendMockEnabled) {
        return [];
      }
    ```
    The frontend returns an empty array `[]` in API mode!
  - Furthermore, there is no `GET /api/exceptions` endpoint in `routers/documents.py` or `app.py`, and no endpoints exist to assign (`PATCH /api/exceptions/{id}/assign`) or resolve individual exceptions.
- **Proposed Additions**:
  1. Add endpoint `GET /api/exceptions` in `routers/documents.py` supporting tenant scoping and status filtering.
  2. Add endpoint `PATCH /api/exceptions/{id}` to support assignment (`assigned_to`) and manual disposition (`status = 'acknowledged'`).
- **Acceptance Test**:
  The Exceptions page (`/workspace/exceptions`) must display live open exceptions across tenant documents, with clickable links leading to the document review drawer.

---

### Item 11: Original PDF Evidence & Field Coordinates
- **Classification**: **PARTIAL**
- **Priority**: **P1** (Visual Verification)
- **Responsible**: Angeline (Canvas Rendering) & Jonathan (Data Contract)
- **Exact File Paths & Functions**:
  - `services/extraction/map_invoice.py:23-45` (`location()`)
  - `database/migrations/0001_initial_schema.sql:234` (`field_predictions.evidence`)
  - `routers/documents.py:446` (`get_document_result()`)
  - `src/types/extraction.ts:1` (`ExtractedField`)
  - `src/components/common/documents/document-viewer.tsx:118-130`
- **Root Cause & Evidence**:
  - Backend extracts genuine bounding box coordinates from Docling: `location()` normalizes boxes into `{"l": left, "t": top, "r": right, "b": bottom, "coord_origin": "TOPLEFT", "coordinate_units": "document_points"}`. PostgreSQL stores this in `field_predictions.evidence` JSONB, and `routers/documents.py` outputs it in `/result`.
  - Frontend ignores the data completely: `ExtractedField` in `src/types/extraction.ts` does not define an `evidence` or `bbox` field. `document.service.ts` omits evidence during mapping.
  - In `document-viewer.tsx`, the PDF view renders a plain `<iframe>` blob without an overlay canvas, preventing accountants from seeing highlighted bounding boxes over the source document.
- **Proposed Resolution**:
  Pass `evidence` through `document.service.ts` and overlay semi-transparent SVG/canvas bounding boxes on the PDF viewer synchronized with field focus.
- **Acceptance Test**:
  Clicking the "Invoice Number" field input must highlight the corresponding bounding box on the original PDF viewer canvas.

---

### Item 12: Profile Updates & Password-Change Integration
- **Classification**: **MOCK** (Profile Updates) / **PARTIAL** (Password Change)
- **Priority**: **P1** (User Account Management)
- **Responsible**: Rachel (Auth & User Domain)
- **Exact File Paths & Functions**:
  - `src/features/common/settings/profile-page.tsx:29-41, 83-102`
  - `src/lib/api/user.service.ts:8-19` (`updateOwnProfile()`)
  - `app.py:454-469` (`change_password()`)
- **Root Cause & Evidence**:
  - `updateOwnProfile()` in `src/lib/api/user.service.ts` mutates local mock `readDb()` in `localStorage`:
    `mutate((db) => { const target = db.users.find(...); target.name = name; })`
    There is no backend endpoint `PATCH /api/auth/profile` in `app.py`. Profile changes are lost upon clearing browser storage.
  - `POST /api/auth/change-password` in `app.py:460` enforces:
    `if not user["must_change_password"]: raise HTTPException(403, "Use the email reset flow to change your password.")`
    Active accountants who attempt to change their password from `/workspace/profile` are blocked with HTTP `403 Forbidden`.
- **Proposed Additions**:
  1. Add `PATCH /api/auth/profile` in `app.py` to persist `name` and `avatar` in `users` table.
  2. Extend `POST /api/auth/change-password` to accept an `old_password` parameter, allowing active authenticated users to update their credentials securely.
- **Acceptance Test**:
  Accountant changes their name on profile page; name persists across browser sessions and displays in top navigation.

---

### Item 13: Canonical JSON / CSV / XLSX Export
- **Classification**: **PARTIAL** (CSV: Client-Side; JSON & XLSX: NOT IMPLEMENTED)
- **Priority**: **P1** (ERP Integration & Downstream Ingestion)
- **Responsible**: Jonathan (Export Streaming) & Aleeya (Canonical Snapshot)
- **Exact File Paths & Functions**:
  - `src/features/common/records/records.tsx:125-157` (`exportRows()`)
  - `routers/documents.py:689-713` (`approve_document()`)
  - `canonical_accounting_record_schema_v1.json:1-682`
- **Root Cause & Evidence**:
  - `records.tsx` implements client-side CSV export via `downloadCsv()`, assembling strings from in-memory table rows.
  - There is no backend endpoint for exporting records.
  - There is no JSON export compliant with `canonical_accounting_record_schema_v1.json`.
  - There is no Excel (`.xlsx`) export capability in frontend or backend.
- **Proposed Additions**:
  1. Add `GET /api/documents/records/export?format=csv|json|xlsx` in `routers/documents.py`.
  2. Serialize approved records strictly matching `canonical_accounting_record_schema_v1.json` for JSON format, and standard financial layout for XLSX.
- **Acceptance Test**:
  Exporting approved records to JSON yields a payload that validates without errors against `canonical_accounting_record_schema_v1.json`.

---

### Item 14: Chart of Accounts (COA), GL Suggestions, Cost Centres & Accounting Coding
- **Classification**: **NOT IMPLEMENTED**
- **Priority**: **P1** (Accounting Coding Engine)
- **Responsible**: Woon (Accounting Rules) & Aleeya (Schema)
- **Exact File Paths & Functions**:
  - `canonical_accounting_record_schema_v1.json:28-32` (`suggested_gl_account_id`, `cost_centre_id`)
  - No database tables, APIs, or UI components exist.
- **Root Cause & Evidence**:
  While the canonical JSON schema reserves nullable fields for `suggested_gl_account_id` and `cost_centre_id`, there is no database table for Chart of Accounts (`gl_accounts`, `cost_centres`), no endpoint to manage or suggest account codes, and no UI in `Accounting_Intelligence_Frontend` to view or select GL codes during document review.
- **Proposed Additions**:
  1. Create tables `gl_accounts` and `cost_centres` with `tenant_id` foreign keys.
  2. In `field_predictions`, add `suggested_gl_account` predicted from vendor and item description.
  3. In document review drawer, display a searchable GL account selector.
- **Acceptance Test**:
  An invoice from a known telecommunications vendor automatically suggests GL code `6100 - Telephone & Internet`.

---

### Item 15: Purchase Order Reference Imports & Matching
- **Classification**: **NOT IMPLEMENTED** (Core Algorithm: Standalone Helper; Ingestion/DB/UI: NOT IMPLEMENTED)
- **Priority**: **P1** (3-Way Matching)
- **Responsible**: Woon (PO Matching) & Aleeya (PO Schema)
- **Exact File Paths & Functions**:
  - `validation/po_matching.py:1-134` (`match_invoice_to_po()`)
  - `services/validation/workflow.py:114` (`integrate_m2_with_m3()`)
- **Root Cause & Evidence**:
  `validation/po_matching.py` implements a clean 3-way matching algorithm evaluating line descriptions, quantities, unit prices, and variances.
  However, the docstring explicitly notes:
  `"This is a standalone PO matching component. It does not access the database because PO tables are not implemented yet."`
  There is no `purchase_orders` or `purchase_order_lines` table in `0001_initial_schema.sql`. In `workflow.py`, `purchase_order` is hardcoded to `None`. The frontend has no PO upload or reference linking interface.
- **Proposed Additions**:
  1. Add `purchase_orders` and `purchase_order_lines` database tables.
  2. Add `POST /api/purchase-orders/import` CSV/Excel ingestion endpoint.
  3. When an invoice references a `po_number`, fetch the PO and pass it to `validate_invoice_document()`.
- **Acceptance Test**:
  An invoice whose line price exceeds the PO by >0.01 triggers variance exception `EX-009`.

---

### Item 16: Bank CSV, Money-In / Money-Out & Bank Reconciliation
- **Classification**: **NOT IMPLEMENTED**
- **Priority**: **P1** (Cashbook Reconciliation)
- **Responsible**: Jonathan (Backend Pipeline) & Woon (Reconciliation Rules)
- **Exact File Paths & Functions**:
  - Backend references to "reconciliation" strictly refer to `reconcile_selective.py` (Docling parser vs Qwen VLM candidate arbitration).
  - No bank feed ingestion, bank statement tables, or cash matching exist.
- **Root Cause & Evidence**:
  Neither frontend nor backend has database tables, APIs, or UI for importing bank statements (MT940/CSV), classifying transactions into Money-In/Money-Out, or matching bank statement lines against approved standardised records.
- **Proposed Additions**:
  1. Add `bank_transactions` table with transaction date, description, debit, credit, balance.
  2. Implement statement parser for standard Malaysian bank CSV exports (Maybank, CIMB).
  3. Implement automated reconciliation against `standardised_records`.
- **Acceptance Test**:
  Importing a Maybank CSV matches payment reference against approved invoice `SYN-001` and marks transaction as reconciled.

---

### Item 17: Sidebar Layout & Responsive Usability
- **Classification**: **REAL**
- **Priority**: **P0** (Core Usability & Accessibility)
- **Responsible**: Angeline (Frontend UI/UX)
- **Exact File Paths & Functions**:
  - `src/components/common/layout/app-shell.tsx:110-180` (`AppShell`)
  - `src/styles/common.css:1449-1635, 4699-4720, 5797-5925`
  - `src/styles/accountant.css:14-97`
- **Verification Evidence**:
  The sidebar layout implements:
  - Extended mode (`252px`), unextended/rail mode (`76px`), and hover peek overlay.
  - Pinning state persisted in `localStorage` under `accia-sidebar-pinned`.
  - Accessible mobile drawer with focus trapping (`elements()[0]?.focus()`, Tab/Shift-Tab keydown interception, Escape dismiss).
  - High-contrast role branding (`data-role="accountant"`) and WCAG-compliant touch target sizes.
- **Acceptance Test**:
  Keyboard navigation traps focus inside mobile drawer when open; resizing browser to tablet viewport smoothly transitions into rail layout.

---

## 4. Proposed API & Database Schema Additions

### 4.1 Database Migrations (`0002_gap_resolution.sql`)

```sql
-- 1. Chart of Accounts & Cost Centres
CREATE TABLE IF NOT EXISTS gl_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_gl_account_per_tenant UNIQUE (tenant_id, account_code)
);

CREATE TABLE IF NOT EXISTS cost_centres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cost_centre_per_tenant UNIQUE (tenant_id, code)
);

-- 2. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    issue_date DATE NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_po_per_tenant UNIQUE (tenant_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 4) NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL
);

-- 3. Document Processing Metrics View
CREATE OR REPLACE VIEW v_tenant_processing_metrics AS
SELECT
    tenant_id,
    COUNT(*) AS total_documents,
    COUNT(*) FILTER (WHERE status = 'standardised') AS approved_documents,
    COUNT(*) FILTER (WHERE status = 'exception') AS exception_documents,
    ROUND(AVG(processing_seconds), 2) AS avg_processing_seconds
FROM documents
GROUP BY tenant_id;
```

### 4.2 Proposed API Endpoints

1. **`GET /api/exceptions`**
   - Returns tenant-wide exceptions with document metadata, severity, and assignment.
   - Query params: `status=open|resolved`, `severity=high|medium|low`, `assigned_to=<uuid>`.
2. **`PATCH /api/exceptions/{id}`**
   - Updates exception status (`acknowledged`, `resolved`, `ignored`) or reassigns accountant.
3. **`GET /api/documents/records/export`**
   - Query params: `format=csv|json|xlsx`, `start_date`, `end_date`, `category`.
   - Returns streaming file attachment conforming to `canonical_accounting_record_schema_v1.json`.
4. **`PATCH /api/auth/profile`**
   - Body: `{"name": "...", "avatar": "data:image/..."}`. Persists to `users` table.

---

## 5. Acceptance Test Specifications

```gherkin
Feature: Accountant Verification & System Gap Resolution

  Scenario: Structured Preview Monetary Rendering
    Given an uploaded invoice with raw total "Total amount: MYR 50.00"
    When the accountant views the document structured preview card
    Then the total amount must display "RM 50.00"
    And must not display "RMNaN"

  Scenario: Prevent Double-Approval of Identical Invoices
    Given an approved standardized record for vendor "Supplier Ltd" and invoice "INV-100"
    When another document with vendor "Supplier Ltd" and invoice "INV-100" is submitted for approval
    Then the approval request must be rejected with HTTP 409 Conflict
    And the UI must display a clear duplicate warning banner

  Scenario: Global Exception Inbox Displays Live Backend Exceptions
    Given an invoice has failed validation with rule "EX-002"
    When the accountant navigates to the Exceptions page
    Then the table must show the live exception with code "EX-002"
    And clicking the exception must open the corresponding document review drawer

  Scenario: Genuine Processing Duration Visibility
    Given an invoice has completed Docling extraction in 4.2 seconds
    When the accountant views the document in the documents list
    Then the duration column must display "4.2s"
    And must not display "0.0s"
```

---

## 6. Risk Analysis & Preservation of Current Working Demonstration

### Safeguarding the Live Prototype
1. **Preserve Current DB State & Tables**:
   Under no circumstances should existing database migrations (`0001_initial_schema.sql`) or active database tables (`documents`, `pending_jobs`, `field_predictions`, `standardised_records`) be dropped or recreated.
2. **Backward-Compatible API Contracts**:
   Any new router endpoints (`/api/exceptions`, `/api/documents/records/export`) must be additive. Existing endpoints (`POST /upload`, `GET /documents`, `GET /result`, `PATCH /fields`, `POST /revalidate`, `POST /approve`) must retain their exact request and response schemas.
3. **Isolate M2-to-M3 Adapter**:
   The current working demonstration relies on `integrate_m2_with_m3()` successfully validating `SYN-001`. Changes to support receipts or bills must be branched using `if doc_type == 'invoice'` guards to guarantee zero regressions for the working invoice demonstration.
4. **No Unplanned Background Tasks**:
   The local services (`uvicorn`, `redis-server`, `rq worker`, `outbox dispatcher`) are running smoothly in WSL. All gap fixes must be tested locally with unit test fixtures before interacting with the live process pool.
