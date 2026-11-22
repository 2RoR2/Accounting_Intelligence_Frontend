import { EffortStudyPage } from "@/features/common/reports/effort-study";
import { DashboardPage } from "@/features/common/today/dashboard-page";
import { DocumentReview } from "@/features/common/documents/document-review";
import { DocumentList, UploadPage } from "@/features/common/documents/documents";
import { ExceptionsPage } from "@/features/common/exceptions/exceptions";
import { RecordsPage } from "@/features/common/records/records";
import { ProfilePage } from "@/features/common/settings/profile-page";
import { ContactsPage } from "@/features/common/contacts/contacts";
import { ErpDocumentsPage } from "@/features/common/erp/documents-page";
import { CatalogPage } from "@/features/common/erp/catalog-page";
import { AccountingReportsPage } from "@/features/common/reports/accounting-reports";
import { SettingsPage } from "@/features/common/settings/settings";
import { WorkspaceSectionPage } from "@/features/common/workspace/workspace-section-page";
import { MoneyFlowPage } from "@/features/common/money/money-flow";
import { LedgerPage } from "@/features/common/ledger/ledger-page";
import { ReconciliationPage } from "@/features/common/money/reconciliation-page";
import { BankAccountsPage } from "@/features/common/money/bank-accounts";
import { EvaluationPage } from "@/features/common/reports/evaluation-page";
import { UserManagement } from "@/features/common/users/user-management";
import { HelpCenter } from "@/features/common/help/help-center";
import type { User } from "@/types";
export function UserRoutes({ path, user }: { path: string[]; user: User }) {
  const [, page, id] = path;
  // Money pages must win even if the sidebar still appends /view-money-in
  if (page === "money-in" || page === "money-out") {
    return <MoneyFlowPage user={user} direction={page === "money-in" ? "money_in" : "money_out"} />;
  }
  if (page === "ledger") return <LedgerPage canPost={false} />;
  if (page === "reconciliation") return <ReconciliationPage user={user} />;
  if (page === "bank-accounts") return <BankAccountsPage user={user} />;
  if (page === "users") return <UserManagement user={user} />;
  if (page === "settings") return <SettingsPage user={user} />;
  if (page === "help") return <HelpCenter />;
  if (id === "view-settings") return <SettingsPage user={user} />;
  if (id === "view-customers" || id === "view-suppliers" || id === "view-contact-matching") return <ContactsPage user={user} />;
  if (id?.startsWith("view-")) {
    return <WorkspaceSectionPage user={user} section={id.slice(5)} />;
  }
  switch (page) {
    // Dashboard (plan v3 R0): the home page, with the Today figures (B3); /today redirects here.
    case "today":
    case "dashboard": return <DashboardPage user={user} />;
    case "documents": return id ? <DocumentReview user={user} documentId={id} /> : <DocumentList user={user} />;
    case "upload": return <UploadPage user={user} />;
    case "exceptions": return <ExceptionsPage user={user} />;
    case "contacts": return <ContactsPage user={user} contactId={id} />;
    // Plan L: sales/purchases documents (typed + approved scanned), bank entries and the catalog.
    case "sales":
    case "purchases":
    case "bank-entries": return <ErpDocumentsPage user={user} group={page} documentId={id} />;
    case "catalog": return <CatalogPage user={user} />;
    case "records": return <RecordsPage user={user} initialRecordId={id} />;
    case "reports": return <AccountingReportsPage user={user} />;
    // Reports › Performance Evaluation; the effort study keeps its own URL.
    case "evaluation": return id === "effort-study" ? <EffortStudyPage /> : <EvaluationPage />;
    case "profile": return <ProfilePage user={user} />;
    default: return <WorkspaceSectionPage user={user} section={page ?? "workspace"} />;
  }
}
