# AGENTS.md — COS40005 Accounting Intelligence | Frontend V2

> **Read at session start.** This file holds stable rules. Read only the linked docs relevant to the current task to conserve Codex context. Do not preload all docs or copy massive tool outputs into replies.

## Product mission
Create the most usable **accountant-first** interface for evidence-grounded invoice/bill/receipt intake, AI-assisted extraction review, validation and exceptions, immutable approved records, and later explainable GL/cost-centre coding, PO matching and bank CSV reconciliation. Automate repetitive work but never imply that an invoice was paid, reconciled, journal-posted or tax-filed without actual backing data and the relevant authorized decision. The user values accurate functionality over the number of screens.

## Repository and team safety
- This repo is `Accounting_Intelligence_Frontend_V2`, development branch `feature/accounting-v2`, **initial** team `features` baseline SHA `a21cc50b806bc3d0e91fda0f3849298296accf3b` (2026-10-18). Inspect live branch/HEAD every session; don't reset to this historical SHA.
- Preserve Rachel's team implementation and Angeline's design. Never mutate team `features`, `main`, old `feature/frontend-integration`, original frontend clone, Draft PR or production Vercel deployment without explicit authorization. **Do not auto-pull, merge unrelated histories, force push, commit or deploy.** Inspect dirty state before every task.
- UI owner: Angeline; API/workflow: Rachel; AI/evidence: Jonathan; validation: Aina; schema: Aleeya. Flag contract/schema/UX decisions for relevant owner review.
- Backend sibling `Accounting_Intelligence_Backend_V2` owns authorization, persistence, validation, audit and AI jobs. Frontend permission checks are usability, not security.

## Start with existing code, not imagined code
- Stack: Next.js App Router, React/TypeScript, `src/features/`, `src/components/`, `src/lib/api/`, styles; inspect real routes and current `src/types` rather than guessing file names. Do not introduce parallel API clients/state layers without proof they are needed.
- At baseline, source contains company and accountant pages, MFA, documents, extraction/correction, record lists, reports and review APIs. **Implementation presence is not proof of end-to-end processing.** Seeded `invoice_001.pdf`, `bill_002.pdf`, `receipt_003.jpg` are DEMO rows, not proven new Docling extractions.
- Read task-targeted files: `docs/CURRENT_BASELINE_V2.md` (known verified vs unverified), `docs/ARCHITECTURE_V2.md` (product), `docs/DOMAIN_AND_API_CONTRACTS_V2.md` (data/API), `docs/DELIVERY_ROADMAP_V2.md` (priority/acceptance). Don't load everything unless planning cross-cutting architecture.

## Accountant UX principles
- Prioritize a real daily workflow: Dashboard/Inboxes → Upload/Batches → Queued/Needs Review → pinned original page and editable field/line items → Evidence and Exceptions → Revalidate → permitted Review/Approval → immutable Standardised Record → Export; then P1 Coding, PO Matching, Bank Reconciliation.
- Keep source viewer visible beside form where screen permits. Keyboard/tab support, focus, explicit save feedback, long-document responsiveness, mobile and 125% zoom, row pagination, meaningful empty/loading/error/retry. No dead buttons, fake success, broken navigation, `NaN`, `undefined sec`, unseen overwrites, or abandoned unsaved edits. Validate responsive layout at 1366×768, 1440×900, and mobile.
- Every field distinguishes raw extraction, current corrected value, approved snapshot and confidence (nullable). Show method and true page/box evidence when available, otherwise `Not available`. Approval status ≠ AI certainty.
- Never render demo fixture values, invented trend/accuracy figures, simulated audit entries or fabricated record IDs as genuine API-backed data. Label demonstration data clearly and keep it isolated from real user journeys. Real measures come from defined backend metrics; show `Not measured` instead of zero/proxy when unavailable.
- Correct accountant concepts: document type != AP/AR category != bank Money-In/Out != payment settlement. Supplier bill is usually AP, customer sales invoice usually AR; either remains outstanding until supported settlement evidence. GL suggestions do not post journal entries.
- Show unsupported features as clearly disabled/labelled; don't advertise JPG, TIFF, CSV, camera, batch, GL auto-coding, bank payments, etc. unless the integrated backend verifies their behavior. Distinguish bank-statement CSV from financial-document file upload.
- Financial values: null-safe, decimal-safe display, explicit currency (never assume MYR), negative/refund/credit-note formatting; CSV and XLSX exports must be tested and resistant to spreadsheet formula injection without misrepresenting negative values.

## Coding/testing workflow
1. Confirm correct V2 path/branch and clean/dirty state; inspect relevant component, API service, types and backend contract before proposing change. Give a concise plan.
2. Favor smallest consistent changes, reuse existing components/styles, and preserve Angeline's visual language. No broad redesign without a screenshot-supported need and owner approval.
3. Implement only server-backed behavior with stable response mappings, explicit loading, null, error, permission-denied, retry and session-expiry handling. No browser-only mock mutation masquerading as persistence. Mutations should not replay after uncertain failures; preserve drafts.
4. After edits: run relevant unit tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and targeted Playwright tests. Identify actual commands, exact output and whether backend was real versus mocked.
5. For any complete accountant workflow, run isolated local integration against V2 FastAPI/PostgreSQL/Redis/RQ/Docling with **new synthetic documents**, not just seeded status rows. Browser tests with injected session cookies do not prove actual interactive MFA; test login separately. No shared/production DB mutations.
6. Use ECC skills when directly useful; avoid spinning multiple agents to solve trivial tasks. Stop at review; no spontaneous commit/push/deploy.

## Required completion contract
Respond with: `Goal` / `Files touched` / `API assumptions checked` / `Tests PASS/FAIL/SKIP/BLOCKED` / `Screenshot or browser evidence` / `Known limitations` / `Next smallest task`. Do not claim running a browser, integration test or backend if not actually run.

## Priority sequence
Safe V2 bootstrap → actual accountant auth & document workflow → honest data/conversions, review UX and seeded-versus-real clarity → multi-kind and image/batch integration → GL/cost-centre & PO → bank CSV/settlement/reconciliation → evaluation & accessibility. Detailed gates in `docs/DELIVERY_ROADMAP_V2.md`.
