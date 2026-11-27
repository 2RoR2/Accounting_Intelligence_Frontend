import { EvaluationPage } from "@/features/common/reports/evaluation-page";
import { EffortStudyPage } from "@/features/common/reports/effort-study";
import { DashboardPage } from "@/features/common/today/dashboard-page";
import { DocumentReview } from "@/features/common/documents/document-review";
import { DocumentList, UploadPage } from "@/features/common/documents/documents";
import { ExceptionsPage } from "@/features/common/exceptions/exceptions";
import { AuditPage, PerformancePage } from "@/features/common/monitoring/monitoring";
import { RecordsPage } from "@/features/common/records/records";
import { RulesPage, SettingsPage } from "@/features/common/settings/settings";
import { ProfilePage } from "@/features/common/settings/profile-page";
import { UserManagement } from "@/features/common/users/user-management";
import { ContactsPage } from "@/features/common/contacts/contacts";
import { ErpDocumentsPage } from "@/features/common/erp/documents-page";
import { CatalogPage } from "@/features/common/erp/catalog-page";
import { MyInvoisPage } from "@/features/common/erp/myinvois-page";
import { MoneyFlowPage } from "@/features/common/money/money-flow";
import { ReconciliationPage } from "@/features/common/money/reconciliation-page";
import { BankAccountsPage } from "@/features/common/money/bank-accounts";
import { ApprovalQueuePage } from "@/features/common/documents/approval-queue";
import { LedgerPage } from "@/features/common/ledger/ledger-page";
import { ValidationOverviewPage } from "@/features/common/validation/validation-overview";
import { AccountingReportsPage } from "@/features/common/reports/accounting-reports";
import { SystemPage } from "@/features/localadmin/system-page";
import { AiInboxPage } from "@/features/common/inbox/ai-inbox-page";
import "@/styles/ai-inbox.css";

import type { User } from "@/types";

export function LocalAdminRoutes({ path, user }: { path: string[]; user: User }) {
  const [, page, id] = path;
  switch (page) {
    // Dashboard (plan v3 R0): the home page, with the Today figures (B3); /today redirects here.
    case "today":
    case "dashboard": return <DashboardPage user={user} />;
    case "system": return <SystemPage user={user} />;
    case "performance": return <PerformancePage user={user} />;
    case "documents": return id ? <DocumentReview user={user} documentId={id} /> : <DocumentList user={user} />;
    case "upload": return <UploadPage user={user} />;
    case "exceptions": return <ExceptionsPage user={user} />;
    // AI Inbox (F3). The Insights pages (FE-3) add their own case.
    case "ai-inbox": return <AiInboxPage user={user} />;
    case "contacts": return <ContactsPage user={user} contactId={id} />;
    // Plan L: sales/purchases documents (typed + approved scanned), bank entries and the catalog.
    case "sales":
    case "purchases":
    case "bank-entries": return <ErpDocumentsPage user={user} group={page} documentId={id} />;
    case "catalog": return <CatalogPage user={user} />;
    case "myinvois": return <MyInvoisPage user={user} />;
    case "records": return <RecordsPage user={user} />;
    case "money-in": return <MoneyFlowPage user={user} direction="money_in" />;
    case "money-out": return <MoneyFlowPage user={user} direction="money_out" />;
    case "reconciliation": return <ReconciliationPage user={user} />;
    case "bank-accounts": return <BankAccountsPage user={user} />;
    case "users": return <UserManagement user={user} />;
    case "validation-overview": return <ValidationOverviewPage user={user} />;
    case "validation-rules": return <RulesPage user={user} />;
    // Reports are accounting reports; processing performance moved to /company/performance (linked from System).
    case "reports": return <AccountingReportsPage />;
    case "evaluation": return id === "effort-study" ? <EffortStudyPage /> : <EvaluationPage />;
    case "approvals": return <ApprovalQueuePage user={user} />;
    case "ledger": return <LedgerPage canPost />;
    case "audit": return <AuditPage user={user} />;
    case "profile": return <ProfilePage user={user} />;
    default: return <SettingsPage user={user} />;
  }
}
