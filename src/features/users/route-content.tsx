import { Dashboard } from "@/features/common/dashboard/dashboard";
import { DocumentReview } from "@/features/common/documents/document-review";
import { DocumentList, UploadPage } from "@/features/common/documents/documents";
import { ExceptionsPage } from "@/features/common/exceptions/exceptions";
import { RecordsPage } from "@/features/common/records/records";
import { ProfilePage } from "@/features/common/settings/profile-page";
import { ContactsPage } from "@/features/common/contacts/contacts";
import { AccountingReportsPage } from "@/features/common/reports/accounting-reports";
import { SettingsPage } from "@/features/common/settings/settings";
import { WorkspaceSectionPage } from "@/features/common/workspace/workspace-section-page";
import type { User } from "@/types";

export function UserRoutes({ path, user }: { path: string[]; user: User }) {
  const [, page, id] = path;
  if (id === "view-settings") return <SettingsPage user={user} />;
  if (id === "view-customers" || id === "view-suppliers" || id === "view-contact-matching") return <ContactsPage user={user} />;
  if (id?.startsWith("view-")) {
    return <WorkspaceSectionPage user={user} section={id.slice(5)} />;
  }
  switch (page) {
    case "dashboard": return <Dashboard user={user} />;
    case "documents": return id ? <DocumentReview user={user} documentId={id} /> : <DocumentList user={user} />;
    case "upload": return <UploadPage user={user} />;
    case "exceptions": return <ExceptionsPage user={user} />;
    case "contacts": return <ContactsPage user={user} />;
    case "records": return <RecordsPage user={user} />;
    case "reports": return <AccountingReportsPage user={user} />;
    case "profile": return <ProfilePage user={user} />;
    default: return <WorkspaceSectionPage user={user} section={page ?? "workspace"} />;
  }
}
