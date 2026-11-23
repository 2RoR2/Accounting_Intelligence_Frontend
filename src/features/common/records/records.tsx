"use client";
import Link from "next/link";
import { documentDisplayName } from "@/lib/document-display-name";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Download, ShieldCheck } from "lucide-react";
import type { StandardisedRecord, User } from "@/types";
import { useResource } from "@/features/common/hooks/use-resource";
import { BulkControls, useBulkSelection } from "@/features/common/bulk-actions";
import { bulkResultSummary } from "@/features/common/bulk-selection";
import { postScannedRecords } from "@/lib/api/erp.service";
import { JournalPostingPreview } from "./journal-preview";
import { postingSelectionTotals } from "./posting-logic";
import {
  getRecordMetadata,
  getStandardisedRecord,
  getStandardisedRecords,
  openSupportView,
} from "@/lib/api/record.service";
import { decimalDisplay as money, fieldLabel, MONEY_KEYS, type SupportViewRecord } from "@/lib/api/document-contract";
import { getTenants } from "@/lib/api/tenant.service";
import { getDocuments, getExceptions } from "@/lib/api/document.service";
import { createExport, downloadExport, getExports } from "@/lib/api/workflow.service";
import {
  Badge,
  DataTable,
  ErrorState,
  Field,
  Filter,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  formatDate,
  money as rmMoney,
  StatusBadge,
} from "@/components/common/ui";
import { isDueWindow, lockedCategory, recordFilterLabel } from "@/lib/today";

export function RecordDetail({
  record,
  support = false,
}: {
  record: StandardisedRecord | SupportViewRecord;
  support?: boolean;
}) {
  return (
    <>
      <div className={support ? "support-banner" : "record-banner"}>
        <ShieldCheck size={19} />
        <span>
          {support
            ? "READ-ONLY SUPPORT VIEW"
            : "STANDARDISED ACCOUNTING RECORD"}
        </span>
        {"category" in record && <Badge>
          {record.category === "ACCOUNTS_RECEIVABLE"
            ? "ACCOUNTS RECEIVABLE"
            : "ACCOUNTS PAYABLE"}
        </Badge>}
        {"validation" in record && <Badge>{record.validation}</Badge>}
      </div>
      <Panel
        title={record.id}
        subtitle={"createdAt" in record ? `Processed ${formatDate(record.createdAt)}` : "Standardised fields only"}
      >
        <div className="record-fields">
          {Object.entries(record.extraction.fields).map(([key, f]) => (
            <div key={key}>
              <small>{fieldLabel("", key, f.label)}</small>
              <strong>
                {MONEY_KEYS.has(key) ? money(f.value) : (f.value || "—")}
              </strong>
            </div>
          ))}
        </div>
        <DataTable
          rows={record.extraction.lineItems}
          rowKey={(r) => `${r.id ?? ""}|${r.description ?? ""}|${r.quantity ?? ""}|${r.amount ?? ""}`}
          columns={[
            { label: "Description", render: (r) => r.description },
            { label: "Quantity", render: (r) => r.quantity },
            { label: "Unit price", render: (r) => money(r.unitPrice) },
            { label: "Amount", render: (r) => money(r.amount) },
          ]}
        />
      </Panel>
    </>
  );
}

export function RecordsPage({
  user,
  tenantId,
  initialRecordId,
}: {
  user: User;
  tenantId?: string;
  initialRecordId?: string;
}) {
  const admin = user.role === "SUPER_ADMIN";
  // Opened from a Today tile (?due= with ?category=, or ?posting=to-post): the backend applies the tile's rule.
  const params = useSearchParams();
  const requestedDue = params.get("due");
  const requestedAsOf = params.get("asOf");
  const todayFilter = {
    category: params.get("category") ?? undefined,
    due: isDueWindow(requestedDue) ? requestedDue : undefined,
    posting: params.get("posting") === "to-post" ? "to-post" : undefined,
    // The Today tile's date (backend sends asOf with the due links); only a plain YYYY-MM-DD is passed on.
    asOf: requestedAsOf && /^\d{4}-\d{2}-\d{2}$/.test(requestedAsOf) ? requestedAsOf : undefined,
  };
  const todayLabel = admin ? null : recordFilterLabel(todayFilter.category ?? null, todayFilter.due ?? null, todayFilter.posting ?? null);
  const toPost = !admin && todayFilter.posting === "to-post";
  const canPost = toPost && user.role === "LOCAL_ADMIN";
  const queryKey = JSON.stringify([user.id, tenantId, todayFilter]);
  // The server already returns only this category: the Categories selector is shown fixed, not filtered locally.
  const fixedCategory = admin ? null : lockedCategory(todayFilter.category);
  const { data, error, loading, refresh, setData } = useResource(
    async () => ({
      queryKey,
      tenants: await getTenants(user),
      docs: await getDocuments(user),
      exceptions: await getExceptions(user),
      records: admin ? [] : await getStandardisedRecords(user, todayFilter),
      metadata: admin ? await getRecordMetadata(user, tenantId) : [],
    }),
    queryKey,
  );
  const [selectedTenant, setSelectedTenant] = useState(tenantId ?? "");
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  // Purchases and Sales in the menu open this list already filtered (?category=ACCOUNTS_PAYABLE|ACCOUNTS_RECEIVABLE).
  const requestedCategory = useSearchParams().get("category");
  const [category, setCategory] = useState(requestedCategory === "ACCOUNTS_PAYABLE" || requestedCategory === "ACCOUNTS_RECEIVABLE" ? requestedCategory : "");
  useEffect(() => {
    if (requestedCategory === "ACCOUNTS_PAYABLE" || requestedCategory === "ACCOUNTS_RECEIVABLE") setCategory(requestedCategory);
  }, [requestedCategory]);
  const [date, setDate] = useState("");
  const [validation, setValidation] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<StandardisedRecord | SupportViewRecord>();
  const [support, setSupport] = useState("");
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const [exports, setExports] = useState<Array<{ id: string; resource: string; format: string; status: string; rowCount: number; createdAt: string }>>([]);
  const [exportsLoaded, setExportsLoaded] = useState(false);
  const [exportError, setExportError] = useState("");
  const [metadataId, setMetadataId] = useState("");
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const [previewRecordId, setPreviewRecordId] = useState("");
  const [confirmRecords, setConfirmRecords] = useState<StandardisedRecord[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [postSummary, setPostSummary] = useState("");
  useEffect(() => {
    if (!initialRecordId || admin) return;
    let cancelled = false;
    void getStandardisedRecord(user, initialRecordId)
      .then((matched) => {
        if (!cancelled && matched) setDetail(matched);
      })
      .catch(() => {
        if (!cancelled) {
          const matched = data?.records.find((record) => record.id === initialRecordId || record.code === initialRecordId);
          if (matched) setDetail(matched);
        }
      });
    return () => { cancelled = true; };
  }, [admin, data, initialRecordId, user]);
  const linkedRecord = initialRecordId
    ? data?.records.find((record) => record.id === initialRecordId || record.code === initialRecordId)
    : undefined;
  const visibleDetail = detail ?? (!deepLinkDismissed ? linkedRecord : undefined);
  const records = (data?.records ?? []).filter(
    (r) =>
      `${documentDisplayName(r, "")} ${r.code ?? ""} ${r.id} ${(r.extraction.fields.invoice?.value ?? "")} ${(r.extraction.fields.supplier?.value ?? "")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!supplier || (r.extraction.fields.supplier?.value ?? "") === supplier) &&
      (fixedCategory !== null || !category || r.category === category) &&
      (!date || (r.extraction.fields.date?.value ?? "") === date) &&
      (!validation || r.validation === validation) &&
      (!status || r.status === status),
  );
  const currentList = data?.queryKey === queryKey;
  const eligible = canPost && currentList ? records : [];
  const selection = useBulkSelection(eligible.map((record) => record.id), JSON.stringify([queryKey, search, supplier, category, date, validation, status]));
  const confirmTotals = postingSelectionTotals(confirmRecords.map((record) => ({
    amount: record.totalAmount ?? record.extraction.fields.total?.value,
    currency: record.currency ?? record.extraction.fields.currency?.value,
  })));

  function removePostedRecords(ids: string[]) {
    const posted = new Set(ids);
    setData((current) => current?.queryKey === queryKey
      ? { ...current, records: current.records.filter((record) => !posted.has(record.id)) }
      : current);
  }

  async function postSelected() {
    if (!canPost || posting || !confirmRecords.length) return;
    setPosting(true);
    setPostError("");
    setPostSummary("");
    try {
      const { results } = await postScannedRecords(confirmRecords.map((record) => record.id));
      const names = new Map(confirmRecords.map((record) => [record.id, record.code || record.id]));
      setPostSummary(bulkResultSummary("posted", results, (item) => names.get(item.recordId) ?? item.recordId));
      removePostedRecords(results.filter((item) => item.ok).map((item) => item.recordId));
      setConfirmRecords([]);
      selection.clear();
      await refresh();
    } catch (e) {
      setPostError(e instanceof Error ? e.message : "Unable to post the selected journals.");
    } finally {
      setPosting(false);
    }
  }

  if (loading) return <LoadingState variant="table" />;
  if (error || !data) return <ErrorState message={error} retry={refresh} />;
  const metadata = data.metadata.find((r) => r.id === metadataId);
  const createBackendExport = async () => {
    setExportError("");
    try {
      // Export exactly the records the search and filters show (Codex H2).
      const created = await createExport("records", { recordIds: records.map((record) => record.id) }, "csv") as { id: string };
      window.open(downloadExport(created.id), "_blank", "noopener,noreferrer");
      const history = await getExports();
      setExports(history); setExportsLoaded(true);
    } catch (e) { setExportError(e instanceof Error ? e.message : "Unable to create the export."); }
  };
  const loadExportHistory = async () => {
    setExportError("");
    try { setExports(await getExports()); setExportsLoaded(true); }
    catch (e) { setExportError(e instanceof Error ? e.message : "Unable to load export history."); }
  };
  return (
    <>
      <PageHeader
        eyebrow={admin ? "PLATFORM MONITORING" : undefined}
        title={admin ? "Standardised records" : "Approved records"}
        description={
          admin
            ? "Tenant-level monitoring. Detailed accounting data is available only through Support View."
            : "One record for each approved document. Open a record to see its details; the original document opens only when you choose View original document."
        }
        actions={
          !admin && (
            <div className="page-header-actions" style={{ display: "flex", gap: 12 }}>
              <button className="btn primary" type="button" disabled={!records.length} onClick={() => void createBackendExport()}><Download size={16} /> Export</button>
              <button className="btn" type="button" onClick={() => void loadExportHistory()}>Export history</button>
            </div>
          )
        }
      />
      {exportError && <p className="error-text" role="alert">{exportError}</p>}
      {toPost && postSummary && <p className="notice" role="status">{postSummary}</p>}
      {exportsLoaded && <Panel title="Export history" subtitle="Download a previous export or check when it was created.">
        {exports.length ? <DataTable rows={exports} rowKey={(row) => row.id} columns={[{ label: "Resource", render: (row) => row.resource }, { label: "Format", render: (row) => row.format.toUpperCase() }, { label: "Rows", render: (row) => row.rowCount }, { label: "Status", render: (row) => <Badge>{row.status}</Badge> }, { label: "Created", render: (row) => formatDate(row.createdAt) }, { label: "Action", render: (row) => <a className="btn small" href={downloadExport(row.id)} target="_blank" rel="noreferrer">Download</a> }]} /> : <div className="empty-state"><strong>No exports yet</strong><p>Create an export to see it here.</p></div>}
      </Panel>}
      {admin && !selectedTenant ? (
        <Panel title="Records by tenant">
          <DataTable
            rows={data.tenants}
            rowKey={(t) => t.id}
            columns={[
              { label: "Tenant", render: (t) => <strong>{t.name}</strong> },
              {
                label: "Total records",
                render: (t) =>
                  data.metadata.filter((r) => r.tenantId === t.id).length,
              },
              {
                label: "Validated",
                render: (t) =>
                  data.metadata.filter((r) => r.tenantId === t.id).length,
              },
              {
                label: "Exceptions",
                render: (t) =>
                  data.exceptions.filter(
                    (e) => e.tenantId === t.id && e.status !== "RESOLVED",
                  ).length,
              },
              {
                label: "Last processed",
                render: (t) => {
                  const r = data.metadata.find((r) => r.tenantId === t.id);
                  return r ? formatDate(r.createdAt) : "—";
                },
              },
              {
                label: "Action",
                render: (t) => (
                  <button
                    className="text-link"
                    onClick={() => setSelectedTenant(t.id)}
                  >
                    View records <ArrowRight size={14} />
                  </button>
                ),
              },
            ]}
          />
        </Panel>
      ) : admin ? (
        <Panel
          title={`${data.tenants.find((t) => t.id === selectedTenant)?.name ?? ""} · Record metadata`}
          action={
            !tenantId && (
              <button
                className="text-link"
                onClick={() => setSelectedTenant("")}
              >
                All tenants
              </button>
            )
          }
        >
          <DataTable
            rows={data.metadata.filter((r) => r.tenantId === selectedTenant)}
            rowKey={(r) => r.id}
            columns={[
              { label: "Record ID", render: (r) => <strong>{r.id}</strong> },
              { label: "Document", render: (r) => r.document?.name },
              { label: "Document type", render: (r) => r.document?.type },
              {
                label: "Category",
                render: (r) =>
                  r.category === "ACCOUNTS_RECEIVABLE"
                    ? "Accounts Receivable"
                    : "Accounts Payable",
              },
              {
                label: "Validation",
                render: (r) => <Badge>{r.validation}</Badge>,
              },
              {
                label: "Processing",
                render: (r) => `${r.document?.seconds} sec`,
              },
              { label: "Processed at", render: (r) => formatDate(r.createdAt) },
              {
                label: "Actions",
                render: (r) => (
                  <div className="row-actions">
                    <button
                      className="text-link"
                      onClick={() => setMetadataId(r.id)}
                    >
                      View metadata
                    </button>
                    <button
                      className="text-link"
                      onClick={() => {
                        setSupport(r.id);
                        setReason("");
                        setFailure("");
                      }}
                    >
                      Support View
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      ) : (
        <Panel>
          {(todayLabel || fixedCategory) && (
            <p className="today-filter-note" role="status">
              Showing: <strong>{todayLabel ?? (fixedCategory === "ACCOUNTS_RECEIVABLE" ? "Customer invoices only" : "Supplier bills only")}</strong> ({data.records.length}).{" "}
              <Link href={`/${user.role === "LOCAL_ADMIN" ? "company" : "workspace"}/records`}>Show all approved records</Link>
            </p>
          )}
          <div className="filter-bar">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search records…"
            />
            <Filter
              label="Categories"
              value={fixedCategory ?? category}
              onChange={setCategory}
              options={["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"]}
              disabled={fixedCategory !== null}
              title={fixedCategory ? "Fixed by the link you opened. Use \"Show all approved records\" to change it." : undefined}
            />
            <Filter
              label="Suppliers"
              value={supplier}
              onChange={setSupplier}
              options={Array.from(
                new Set(
                  data.records.map((r) => (r.extraction.fields.supplier?.value ?? "")),
                ),
              )}
            />
            <input
              aria-label="Invoice date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Filter
              label="Validation"
              value={validation}
              onChange={setValidation}
              options={["PASSED"]}
            />
            <Filter
              label="Statuses"
              value={status}
              onChange={setStatus}
              options={["COMPLETED"]}
            />
          </div>
          {canPost && <BulkControls selection={selection} eligibleCount={eligible.length} busy={posting}>
            <button className="btn primary" type="button" disabled={posting || !selection.ids.length} onClick={() => {
              setPostError("");
              setConfirmRecords(eligible.filter((record) => selection.checked.has(record.id)));
            }}>Post selected</button>
          </BulkControls>}
          <DataTable
            rows={records}
            rowKey={(r) => r.id}
            columns={[
              ...(canPost ? [{
                label: "Select",
                render: (record: StandardisedRecord) => {
                  const checked = selection.checked.has(record.id);
                  return <input type="checkbox" aria-label={`Select ${record.code || record.id}`} checked={checked}
                    disabled={posting || !currentList || (selection.atLimit && !checked)} onChange={() => selection.toggle(record.id)} />;
                },
              }] : []),
              {
                label: "Record / invoice",
                render: (r) => (
                  <div>
                    <strong title={r.id}>{documentDisplayName(r, r.code ?? r.id)}</strong>
                    <small>{(r.extraction.fields.invoice?.value ?? "")}</small>
                  </div>
                ),
              },
              {
                label: "Category",
                render: (r) => (
                  <Badge>
                    {r.category === "ACCOUNTS_RECEIVABLE" ? "AR" : "AP"}
                  </Badge>
                ),
              },
              {
                label: "Supplier",
                render: (r) => (r.extraction.fields.supplier?.value ?? ""),
              },
              {
                label: "Invoice date",
                render: (r) => (r.extraction.fields.date?.value ?? ""),
              },
              {
                label: "Total",
                render: (r) => (
                  <strong>{money((r.extraction.fields.total?.value ?? ""))}</strong>
                ),
              },
              {
                label: "Currency",
                render: (r) => (r.extraction.fields.currency?.value ?? ""),
              },
              {
                label: "Validation",
                render: (r) => <Badge>{r.validation}</Badge>,
              },
              { label: "Status", render: (r) => <StatusBadge status={r.status} /> },
              {
                label: "Action",
                render: (r) => (
                  <div className="row-actions">
                    <button className="text-link" type="button" onClick={() => setDetail(r)}>View <ArrowRight size={14} /></button>
                    {toPost && <button className="btn small" type="button" disabled={posting || !currentList}
                      onClick={() => setPreviewRecordId(r.id)}>Preview journal</button>}
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      )}
      {toPost && previewRecordId && <JournalPostingPreview key={previewRecordId} recordId={previewRecordId} canPost={canPost}
        onClose={() => setPreviewRecordId("")} onPosted={() => {
          setPreviewRecordId("");
          setPostSummary("1 posted, 0 not");
          removePostedRecords([previewRecordId]);
          void refresh();
        }} />}
      {canPost && confirmRecords.length > 0 && (
        <Modal title="Post selected journals" onClose={() => setConfirmRecords([])} closeDisabled={posting}>
          <div className="panel-body">
            <p>Post {confirmRecords.length} {confirmRecords.length === 1 ? "journal" : "journals"}?</p>
            <p>Document total {confirmTotals.totals.length
              ? confirmTotals.totals.map(({ amount, currency }) => currency === "MYR" ? rmMoney(amount) : money(amount, currency)).join(" + ")
              : "unavailable"}</p>
            {confirmTotals.missing > 0 && <p>{confirmTotals.missing} {confirmTotals.missing === 1 ? "record has" : "records have"} no amount.</p>}
            {postError && <p className="notice danger" role="alert">{postError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" disabled={posting} onClick={() => setConfirmRecords([])}>Cancel</button>
              <button type="button" className="btn primary" disabled={posting} onClick={() => void postSelected()}>{posting ? "Posting…" : "Post selected"}</button>
            </div>
          </div>
        </Modal>
      )}
      {metadata && (
        <Modal title="Record metadata" onClose={() => setMetadataId("")}>
          <div className="panel-body detail-list">
            <div>
              <span>Record ID</span>
              <strong>{metadata.id}</strong>
            </div>
            <div>
              <span>Document</span>
              <strong>{metadata.document?.name}</strong>
            </div>
            <div>
              <span>Type</span>
              <strong>{metadata.document?.type}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>
                {metadata.category === "ACCOUNTS_RECEIVABLE"
                  ? "Accounts Receivable"
                  : "Accounts Payable"}
              </strong>
            </div>
            <div>
              <span>Validation</span>
              <Badge>{metadata.validation}</Badge>
            </div>
            <div>
              <span>Processed</span>
              <strong>{formatDate(metadata.createdAt)}</strong>
            </div>
          </div>
        </Modal>
      )}
      {support && (
        <Modal title="Authorised support access" onClose={() => setSupport("")}>
          <form
            className="panel-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setDetail(await openSupportView(user, support, reason));
                setSupport("");
              } catch (e) {
                setFailure((e as Error).message);
              }
            }}
          >
            <div className="info-box">
              <ShieldCheck size={23} />
              <p>
                Accessing detailed tenant accounting information should only be
                used for authorised support or troubleshooting.
              </p>
            </div>
            <p>
              This read-only access and your reason will appear in the audit
              log.
            </p>
            {failure && <ErrorState message={failure} />}
            <Field label="Support reason *">
              <textarea
                required
                minLength={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setSupport("")}
              >
                Cancel
              </button>
              <button className="btn primary">Continue</button>
            </div>
          </form>
        </Modal>
      )}
      {visibleDetail && (
        <Modal
          title={admin ? "Read-only support record" : "Standardised record"}
          onClose={() => { setDetail(undefined); setDeepLinkDismissed(true); }}
        >
          <div className="panel-body">
            <RecordDetail record={visibleDetail} support={admin} />
            {!admin && (
              <Link
                className="btn"
                href={`/${user.role === "LOCAL_ADMIN" ? "company" : "workspace"}/documents/${visibleDetail.documentId}`}
              >
                View original document
              </Link>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
