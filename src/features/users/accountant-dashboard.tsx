"use client";

import Link from "next/link";
import { documentDisplayName } from "@/lib/document-display-name";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Files, FileCheck2, Plus } from "lucide-react";
import type { Document, User } from "@/types";
import { SpinningCounter, StatusBadge, formatDate } from "@/components/common/ui";
import { documentKindLabel } from "@/lib/glossary";
import { useResource } from "@/features/common/hooks/use-resource";
import { TotalSalesChart } from "@/components/common/charts/total-sales-chart";
import { DocumentStackWidget } from "@/components/common/documents/document-stack-widget";
import { MalaysiaDayNight } from "@/components/common/dashboard/malaysia-day-night";
import { getMoneyTransactions } from "@/lib/api/money.service";

const approvedStatuses = ["COMPLETED", "STANDARDISED"];
const DASHBOARD_WIDGETS = ["attention", "metrics", "review-queue", "documents", "stacks", "review-activity", "finance", "bank", "actions"];
const totalApproved = (docs: Document[], type: string) => docs.filter((doc) => doc.type === type && approvedStatuses.includes(doc.status)).reduce((sum, doc) => sum + (Number(doc.totalAmount) || 0), 0);

const overdueCount = (docs: Document[], type: "INVOICE" | "BILL") => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return docs.filter((doc) => {
    if (doc.type !== type || !doc.dueDate || approvedStatuses.includes(doc.status)) return false;
    const dueDate = new Date(doc.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }).length;
};

const documentAction = (status: string) => {
  if (status === "FAILED") return "See problem";
  if (["EXTRACTED", "IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(status)) return "Review";
  if (["UPLOADED", "QUEUED", "PROCESSING"].includes(status)) return "Check progress";
  return "View record";
};

function DashboardWidget({ id, title, subtitle, onDragStart, onDrop, onKeyboardMove, children }: { id: string; title: string; subtitle?: string; onDragStart: (id: string) => void; onDrop: (id: string) => void; onKeyboardMove: (id: string, direction: -1 | 1) => void; children: ReactNode }) {
  return <section className={`dashboard-widget dashboard-widget-${id}`} draggable onDragStart={() => onDragStart(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(id)}>
    <div className="dashboard-widget-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="widget-drag-handle" type="button" draggable aria-label={`Reorder ${title}`} title="Drag this grip to reorder. Use Alt + Arrow keys to move" onDragStart={() => onDragStart(id)} onKeyDown={(event) => { if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); onKeyboardMove(id, event.key === "ArrowUp" ? -1 : 1); } }}><span className="drag-dots" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span></button></div>
    {children}
  </section>;
}

export function AccountantDashboard({ user, docs, exceptions, userName = "there", base = "/workspace" }: { user: User; docs: Document[]; exceptions: number | null; userName?: string; base?: string }) {
  const malaysiaHour = Number(new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = malaysiaHour < 5 ? "Good night" : malaysiaHour < 12 ? "Good morning" : malaysiaHour < 17 ? "Good afternoon" : malaysiaHour < 21 ? "Good evening" : "Good night";
  const { data: bankTransactions } = useResource(
    () => Promise.all([getMoneyTransactions(user, "money_in"), getMoneyTransactions(user, "money_out")]).then(([moneyIn, moneyOut]) => [...moneyIn, ...moneyOut]),
    `${user.id}:accountant-dashboard-bank`,
  );
  // Processing activity, processing health and bank amount anomalies now live on the admin-only System page.
  const [widgetOrder, setWidgetOrder] = useState(DASHBOARD_WIDGETS);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`accordai-dashboard-widgets-${base}`) || "null");
      if (Array.isArray(saved) && saved.every((value) => typeof value === "string")) {
        const defaults = DASHBOARD_WIDGETS;
        const savedOrder = saved.filter((value) => defaults.includes(value));
        setWidgetOrder([...savedOrder, ...defaults.filter((value) => !savedOrder.includes(value))]);
      }
    } catch { /* local storage is optional */ }
  }, []);

  const reorderWidget = (target: string) => {
    if (!draggedWidget || draggedWidget === target) return;
    const next = [...widgetOrder]; const from = next.indexOf(draggedWidget); const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1); next.splice(to, 0, draggedWidget); setWidgetOrder(next);
    window.localStorage.setItem(`accordai-dashboard-widgets-${base}`, JSON.stringify(next)); setDraggedWidget(null);
  };
  const moveWidget = (id: string, direction: -1 | 1) => {
    const index = widgetOrder.indexOf(id); const target = index + direction;
    if (index < 0 || target < 0 || target >= widgetOrder.length) return;
    const next = [...widgetOrder]; [next[index], next[target]] = [next[target], next[index]];
    setWidgetOrder(next); window.localStorage.setItem(`accordai-dashboard-widgets-${base}`, JSON.stringify(next));
  };

  const processing = docs.filter((doc) => ["UPLOADED", "QUEUED", "PROCESSING"].includes(doc.status)).length;
  const review = docs.filter((doc) => ["EXTRACTED", "IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(doc.status)).length;
  const failed = docs.filter((doc) => doc.status === "FAILED").length;
  const standardised = docs.filter((doc) => approvedStatuses.includes(doc.status)).length;
  const invoiceTotal = totalApproved(docs, "INVOICE");
  const billTotal = totalApproved(docs, "BILL");
  const receiptTotal = totalApproved(docs, "RECEIPT");
  const reviewDocs = docs.filter((doc) => ["EXTRACTED", "IN_REVIEW", "EXCEPTION", "CORRECTED"].includes(doc.status)).slice(0, 4);
  const overdueInvoices = overdueCount(docs, "INVOICE");
  const overdueBills = overdueCount(docs, "BILL");
  const approvedInvoices = docs.filter((doc) => doc.type === "INVOICE" && approvedStatuses.includes(doc.status)).length;
  const approvedBills = docs.filter((doc) => doc.type === "BILL" && approvedStatuses.includes(doc.status)).length;
  const salesByDay = docs.filter((doc) => doc.type === "INVOICE" && approvedStatuses.includes(doc.status)).reduce<Record<string, number>>((result, doc) => {
    const label = new Intl.DateTimeFormat("en-MY", { day: "2-digit", month: "short" }).format(new Date(doc.createdAt));
    result[label] = (result[label] ?? 0) + (Number(doc.totalAmount) || 0);
    return result;
  }, {});
  const salesChartData = Object.entries(salesByDay).slice(-7).map(([label, value]) => ({ label, value }));
  const widgetProps = { onDragStart: setDraggedWidget, onDrop: reorderWidget, onKeyboardMove: moveWidget };

  const widgets: Record<string, ReactNode> = {
    metrics: <DashboardWidget id="metrics" title="Document summary" subtitle="Select a metric to filter your workflow" {...widgetProps}><div className="widget-metric-grid"><Link href={`${base}/documents`}><strong>{docs.length}</strong><span>All documents</span><em className="metric-spark spark-blue" /></Link><Link href={`${base}/documents?status=PROCESSING`}><strong>{processing}</strong><span>Being read</span><em className="metric-spark spark-cyan" /></Link><Link href={`${base}/documents?status=IN_REVIEW`}><strong>{review}</strong><span>Needs review</span><em className="metric-spark spark-amber" /></Link><Link href={`${base}/records`}><strong>{standardised}</strong><span>Saved to records</span><em className="metric-spark spark-green" /></Link></div><div className="widget-overdue-row"><Link href={`${base}/documents?type=INVOICE&status=OVERDUE`}><strong>{overdueInvoices}</strong><span>Overdue invoices</span><ArrowRight size={14} /></Link><Link href={`${base}/documents?type=BILL&status=OVERDUE`}><strong>{overdueBills}</strong><span>Overdue bills</span><ArrowRight size={14} /></Link></div></DashboardWidget>,
    attention: <DashboardWidget id="attention" title="Needs your attention" subtitle="Start here" {...widgetProps}><div className="widget-attention-list"><Link className="widget-attention-row" href={`${base}/documents?status=FAILED`}><span><strong>{failed} document{failed === 1 ? "" : "s"} could not be read</strong><small>Open it to read it again, or upload a clearer copy.</small></span><ArrowRight size={18} /></Link><Link className="widget-attention-row" href={`${base}/documents`}><span><strong>{review} document{review === 1 ? "" : "s"} to review</strong><small>Check the details, then approve.</small></span><ArrowRight size={18} /></Link><Link className="widget-attention-row" href={`${base}/exceptions`}><span><strong>{exceptions === null ? "Checking open exceptions…" : `${exceptions} problem${exceptions === 1 ? "" : "s"} to fix`}</strong><small>Each one says what to do. One document can have several.</small></span><ArrowRight size={18} /></Link></div></DashboardWidget>,
    documents: <DashboardWidget id="documents" title="Recent documents" subtitle="Your latest uploads" {...widgetProps}><div className="widget-document-mini">{docs.slice(0, 4).map((doc) => <Link key={doc.id} href={`${base}/documents/${doc.id}`}><span><Files size={14} /><strong>{documentDisplayName(doc, doc.name)}</strong></span><StatusBadge status={doc.status} /></Link>)}{!docs.length && <div className="widget-empty">Upload an invoice, bill, or receipt to get started.</div>}</div></DashboardWidget>,
    stacks: <DashboardWidget id="stacks" title="Document types" subtitle="Your workspace at a glance" {...widgetProps}><DocumentStackWidget items={[{ label: "Invoices", count: docs.filter((doc) => doc.type === "INVOICE").length, href: "/workspace/documents?type=INVOICE", tone: "blue" }, { label: "Bills", count: docs.filter((doc) => doc.type === "BILL").length, href: "/workspace/documents?type=BILL", tone: "green" }, { label: "Receipts", count: docs.filter((doc) => doc.type === "RECEIPT").length, href: "/workspace/documents?type=RECEIPT", tone: "red" }]} /></DashboardWidget>,
    "review-queue": <DashboardWidget id="review-queue" title="Your review queue" subtitle="Documents that need your attention" {...widgetProps}><div className="widget-queue">{reviewDocs.map((doc) => <Link key={doc.id} href={`${base}/documents/${doc.id}`}><span><FileCheck2 size={15} /><strong>{documentDisplayName(doc, doc.name)}</strong></span><ArrowRight size={15} /></Link>)}{!reviewDocs.length && <div className="widget-empty"><FileCheck2 size={20} /> No review tasks waiting.</div>}</div></DashboardWidget>,
    finance: <DashboardWidget id="finance" title="Money position" subtitle="Approved document totals only" {...widgetProps}><div className="widget-finance-grid"><Link href={`${base}/money-in`}><strong><SpinningCounter value={invoiceTotal} /></strong><span>Sales invoices</span></Link><Link href={`${base}/money-out`}><strong><SpinningCounter value={billTotal} /></strong><span>Purchase bills</span></Link><Link href={`${base}/documents?type=RECEIPT`}><strong><SpinningCounter value={receiptTotal} /></strong><span>Receipts</span></Link><div><strong>{overdueInvoices + overdueBills}</strong><span>Overdue documents</span></div></div><TotalSalesChart data={salesChartData} /></DashboardWidget>,
    bank: <DashboardWidget id="bank" title="Bank reconciliation" subtitle="Match imported bank transactions to approved records" {...widgetProps}><div className="widget-bank-summary"><Link href={`${base}/money-in`}><strong>{approvedInvoices}</strong><span>Approved Money In</span><small>Incoming records</small></Link><Link href={`${base}/money-out`}><strong>{approvedBills}</strong><span>Approved Money Out</span><small>Outgoing records</small></Link><Link href={`${base}/money-in`}><strong>{bankTransactions ? bankTransactions.filter(row => row.status === "proposed").length : "Checking"}</strong><span>Suggested matches</span><small>Awaiting review</small></Link><Link href={`${base}/money-in`}><strong>{bankTransactions ? bankTransactions.filter(row => row.status === "needs_review").length : "Checking"}</strong><span>Needs review</span><small>Human confirmation</small></Link></div><Link className="widget-inline-link" href={`${base}/money-in`}>Review reconciliation <ArrowRight size={15} /></Link></DashboardWidget>,
    "review-activity": <DashboardWidget id="review-activity" title="Recent activity" subtitle="The latest events in your accounting workflow" {...widgetProps}><div className="widget-history-list"><div className="widget-history-item"><i className="history-blue" /><div><strong>{docs.length ? `Uploaded ${docs.length} document${docs.length === 1 ? "" : "s"}` : "No documents uploaded yet"}</strong><span>{docs[0] ? formatDate(docs[0].createdAt) : "Upload a document to begin"}</span></div></div><div className="widget-history-item"><i className="history-green" /><div><strong>{standardised ? `${standardised} record${standardised === 1 ? "" : "s"} approved` : "Approval activity"}</strong><span>{standardised ? "Saved to records" : "No approvals yet"}</span></div></div><div className="widget-history-item"><i className="history-red" /><div><strong>{failed ? `${failed} document${failed === 1 ? "" : "s"} could not be read` : "Every upload was read"}</strong><span>{failed ? "Open it to read it again" : `${processing} still being read`}</span></div></div></div></DashboardWidget>,
    actions: <DashboardWidget id="actions" title="Next actions" subtitle="Shortcuts for the accounting workflow" {...widgetProps}><div className="widget-actions"><Link href={`${base}/exceptions`}>Fix problems <ArrowRight size={16} /></Link><Link href={`${base}/records`}>Approved records <ArrowRight size={16} /></Link><Link href={`${base}/upload`}>Upload a new document <ArrowRight size={16} /></Link></div></DashboardWidget>,
  };

  return <div className="dashboard-page">
    <div className="workspace-dashboard-header dashboard-reference-header"><MalaysiaDayNight /><div><span className="workspace-dashboard-kicker">TODAY</span><h1>{greeting}, {userName}</h1></div><div className="workspace-dashboard-actions"><Link className="btn" href={`${base}/documents`}>Search documents</Link><Link className="btn primary" href={`${base}/upload`}><Plus size={15} /> Upload documents</Link></div></div>
    <section className="workspace-dashboard-layout"><section className="workspace-documents-card"><div className="workspace-documents-toolbar"><div><span className="workspace-dashboard-kicker">RECENT DOCUMENTS</span><h2>Recent document activity</h2><p>{docs.length} documents in this workspace</p></div><Link className="btn" href={`${base}/documents`}>View all <ArrowRight size={14} /></Link></div><div className="workspace-document-table"><div className="workspace-document-row workspace-document-head"><span>Document</span><span>Type</span><span>Uploaded</span><span>Status</span><span>Action</span></div>{docs.slice(0, 6).map((doc) => <Link className="workspace-document-row" key={doc.id} href={`${base}/documents/${doc.id}`}><strong><Files size={15} />{documentDisplayName(doc, doc.name)}</strong><span>{documentKindLabel(doc.type)}</span><span>{formatDate(doc.createdAt)}</span><StatusBadge status={doc.status} /><span className="document-row-action">{documentAction(doc.status)} <ArrowRight size={13} /></span></Link>)}{!docs.length && <div className="workspace-document-empty">No documents yet. Upload an invoice, bill, or receipt to begin.</div>}</div></section></section>
    <div className="dashboard-widget-grid">{widgetOrder.map((id) => <div className="dashboard-widget-slot" key={id}>{widgets[id]}</div>)}</div>
  </div>;
}
