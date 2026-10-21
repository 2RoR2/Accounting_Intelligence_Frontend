# Phase 4C-B: frontend retry extraction contract correction

Date: 21 October 2026. Both merges remain UNCOMMITTED. Original frontend Git index preserved byte-for-byte.

## Goal / root cause

The earlier Phase 3E adapter awaited POST /api/documents/{id}/retry and then unconditionally threw "Retry dispatch was not confirmed by a supported protocol". That was deliberately conservative before the backend attempt protocol existed, but rejected every legitimate HTTP 200 dispatch receipt after that protocol was implemented. The handler also did not refresh on successful responses and had no success receipt/identity state.

No backend route, schema, permissions, queue protocol, AI model or Docling classification code was changed.

## API assumptions checked: actual current backend source

Read docs/PHASE4B_CONNECTED_BROWSER_ACCEPTANCE.md, docs/PHASE4CA_REVIEW_HISTORY_REMEDIATION.md and docs/PHASE3E_PROCESSING_ATTEMPT_PROTOCOL.md, plus actual app.py and infrastructure/queue/attempts.py. Earlier Phase 3E frontend report is historical context, not the current retry contract.

Backend path: C:\Users\60103\Documents\GitHub\Accounting_Intelligence_Backend_V2_Integration_20261020
HEAD c65b41fb1c165f49b5bac791127d8f4838a33fab; MERGE_HEAD 39e68a1850daf6e875d7935dbb0138db55f3f170.

- app.py:843-862: POST /api/documents/{document_id}/retry, no body, default HTTP 200, no explicit Pydantic response_model. Requires authenticated accountant/local_admin, locks visible tenant-owned/assigned document, reserves a new eligible attempt and publishes after transaction commit.
- attempts.py:240-277: real RQ enqueue and post-enqueue DB read return jobId, queueJobId, status, jobStatus, dispatchAccepted=true. Route adds id (document UUID). The response uses id, not documentId. status is document state; jobStatus is observed DB attempt state. A fast worker can advance before the receipt is read; neither status implies accounting approval or settlement.
- Current publisher returns dispatch_token as queueJobId. The adapter permits null/omitted queueJobId per the requested nullable contract and does not infer dispatch failure from absence of a Redis ID. Null/omitted cases were tested offline/mocked; actual connected response had a non-null queue ID.
- app.py:832-840: processing errors carry code, documentId, dispatchAccepted=false, message and available jobId/jobStatus. DISPATCH_UNCONFIRMED is HTTP 503; deliberate attempt conflicts are 409. Existing authorization/state errors (403/404/409/422) remain server-owned. No new endpoint/field was invented.

## Files touched

Production edits, only in frontend integration worktree:

- src/lib/api/document.service.ts:55-77: RetryDispatchResponse; validate matching document identity, nonempty DB job identity, document/job status and explicit dispatchAccepted=true; optional nullable queue ID. Reject malformed/unconfirmed HTTP 2xx; preserve actual API errors.
- src/features/common/documents/document-review.tsx:119-120,157-168,222: synchronous in-flight ref guards repeated clicks, retain successful receipt/identities, explicit dispatch-only feedback and refresh authoritative document state after every outcome. Existing pending-state polling continues; no local processing success is invented and no mutation is automatically replayed.

New focused tests/harness/report:

- tests/retry-dispatch.test.ts
- tests/browser/phase4cb-retry.spec.ts
- playwright.phase4cb.config.ts
- tests/p4cb/runtime.py (read-only backend imports, fresh disposable fixtures, bounded API/one-job worker, identity checks and frontend-only evidence writes)
- tests/p4cb/browser.cjs (real login/MFA, frontend retry and reload checks)
- docs/FRONTEND_PHASE4CB_RETRY_CONTRACT.md

No existing Phase 3E/4B files were replaced. Next-generated next-env.d.ts and tsconfig.json changes were captured as evidence and restored from this run's exact byte snapshots. No index staging occurred.

## Tests PASS / FAIL / SKIP / BLOCKED

- PASS npm run typecheck.
- PASS targeted ESLint on the two production files, retry unit/browser test and Playwright config.
- PASS node --import tsx --test tests/retry-dispatch.test.ts: 9 passed, 0 failed, 0 skipped. Includes success, queue ID null/omitted, missing/wrong identities, malformed/unconfirmed dispatch, advanced worker statuses, 409 open/protected, 403, 422 and 503, without automatic replay.
- PASS npx playwright test --config playwright.phase4cb.config.ts: 7 passed (30.6s), 0 failed. Every API call mocked, dedicated frontend port 3118. Includes synchronous double activation producing one request, receipt/job identity, authoritative queued reload, refresh on rejection, and no success on 403/409/422/503/incomplete 2xx.
- PASS node --check tests/p4cb/browser.cjs; git diff --check; no unmerged entries.
- PASS 6 focused connected observations: fresh genuine email MFA; real button/200 receipt/single request; real open-job 409; corrected-document protection 409; queued reload; real worker-result reload. These are narrow retry cases, not the full 22-scenario matrix.
- Production build and unrelated suites intentionally NOT RERUN. No application changes beyond this targeted adapter/handler. Real Docling and Qwen inference NOT RUN.
- Actual connected nullable queue ID, forced Redis transport ambiguity, 403 and 422 were NOT exercised: covered by focused offline/mocked tests instead. No credentials, MFA bypass, API fulfillment/mocks or cookie injection in connected tests. Existing legitimate browser session from this run was retained for the reload phase.

## Real database and queue evidence

Fresh fail-closed preflight verified exact Docker container IDs, pinned image IDs, volume/network ownership labels and loopback ports using the existing Phase 4A manifest. PostgreSQL 18 at 127.0.0.1:55435, database saic_p4a_main_20261021a1, cluster saic_v2_p4a_20261021a1, system identifier 7698802587763585063. Runtime role saic_p4a_runtime has no superuser/CREATEDB/CREATEROLE/BYPASSRLS. Redis at 127.0.0.1:6383, run ID f6e40f8cced7747fe8a2babbdf6377b638402acb and marker p4a:acceptance:owner=p4a-20261021a1; queues initially empty and no other clients.

Fresh synthetic document f3c65c53-c737-4c6e-bcb2-cccf8dcc2cc0. Old failed attempt 08ffc83b-4534-48c9-ae95-9e8c5bec603d retained. New DB attempt aaba4f42-8dd6-4050-8e5f-d76cba624a52, RQ job a4b1fcc2-0c6f-44fd-ab49-28d438e2a380.

Real response: id=document UUID, jobId=new attempt UUID, queueJobId=RQ UUID, status=QUEUED, jobStatus=DISPATCHED, dispatchAccepted=true. UI recognized it, showed dispatch-only confirmation and DB identity, then reloaded QUEUED from API. The repeated authenticated request received JOB_ALREADY_OPEN rather than creating a duplicate.

Before worker: one CPU queue job; new row dispatched, dispatch_count=1, attempt_count=0; no current extraction. The worker asserted that the entire queue contained exactly this new RQ ID before consuming it. After worker: document EXTRACTED revision 2, job succeeded with dispatch_count=1/attempt_count=1, one current extraction bound to new pending_job_id and a new p4cb-synthetic service_run_id; CPU/GPU queues empty and owner marker retained. Page reload showed actual extracted line editor. Provider output was explicitly synthetic, with real RQ claim and PostgreSQL persistence; no Docling inference claim.

## Important observed harness side effect ? not hidden as a clean isolation PASS

RQ emitted: StartedJobRegistry cleanup moved pre-existing job 773c5b3b-fede-4af9-9e59-61470e143e7b to FailedJobRegistry due to AbandonedJobError. The large maintenance_interval did not prevent this startup cleanup. The fresh queue guard prevented consumption of other queued jobs, but did not protect retained abandoned registry metadata. This is an unintended test-harness side effect; it is not evidence of retry adapter or backend attempt failure.

No attempt was made to undo/restore/delete this Redis metadata. Further worker testing stopped. Diagnostic retained in rq-maintenance-diagnostic.json and the tool transcript. The prior 329 acceptance evidence files and tracked backend source were hash-verified unchanged. Do not claim all earlier Redis metadata remained unchanged. A fail-closed registry isolation strategy needs review/approval before further connected worker runs; do not simply disable production behavior to get green tests.

## Screenshot or browser evidence / preservation

New ignored evidence: frontend test-results/phase4cb-20261021/.
Key files: preflight.json, fixture.json, retry-response.json, database-queue-dispatched.json, database-queue-completed.json, retry-verification.json, connected-dispatch.json, connected-reload.json, connected-dispatch.png, connected-reload.png, rq-maintenance-diagnostic.json, preservation.json, source-before.json, original-index and historical-evidence-hashes.json. Synthetic passwords, MFA outbox and legitimate session remain only in private/, not Git or this report.

Only this run's API on 8019, frontend on 3119 and one-job worker were launched. All have stopped; test ports 3118/3119/8019 have no listeners. Disposable containers/evidence retained. No demonstration/native service, original repository, environment secret, model, schema/migration, deployment or remote branch was modified. Original frontend index verified byte-identical; all pre-existing frontend source except the two authorized production edits was hash-verified intact. No commit/push/merge completion.

## Remaining P0 / P1 / P2 and next smallest task

P0: no new retry/backend-protocol defect observed in this focused path. This does not grant merge/deployment readiness or replace existing acceptance gates.

P1: unintended retained RQ registry transition requires review before further worker-based connected testing. The known Docling Unknown/zero-field issue remains untouched and uninvestigated in this phase. Genuine transport ambiguity remains offline/mocked coverage here.

P2: nullable/omitted queue ID accepted but only tested offline/mocked; dispatch receipt intentionally reports a point-in-time job status, while document state is refreshed/polled. No broad layout/MFA/bank/export acceptance rerun.

Recommendation: retry adapter fix is ready for review, with real dispatch/claim/persistence evidence. GO for a separately authorized source-only Phase 4C-C Docling investigation. NO-GO for additional connected worker/inference runs until the RQ harness preservation issue is reviewed and the exact next target approved. No automatic continuation.
