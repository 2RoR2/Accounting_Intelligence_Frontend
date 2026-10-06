import { Dashboard } from "@/features/common/dashboard/dashboard";
import { DocumentReview } from "@/features/common/documents/document-review";
import { DocumentList, UploadPage } from "@/features/common/documents/documents";
import { ExceptionsPage } from "@/features/common/exceptions/exceptions";
import { AuditPage, PerformancePage } from "@/features/common/monitoring/monitoring";
import { RecordsPage } from "@/features/common/records/records";
import { RulesPage, SettingsPage } from "@/features/common/settings/settings";
import { ProfilePage } from "@/features/common/settings/profile-page";
import { UserManagement } from "@/features/common/users/user-management";
import type { User } from "@/types";

export function LocalAdminRoutes({ path, user }: { path: string[]; user: User }) {
  const [, page, id] = path;
  switch (page) {
    case "dashboard": return <Dashboard user={user} />;
    case "documents": return id ? <DocumentReview user={user} documentId={id} /> : <DocumentList user={user} />;
    case "upload": return <UploadPage user={user} />;
    case "exceptions": return <ExceptionsPage user={user} />;
    case "records": return <RecordsPage user={user} />;
    case "users": return <UserManagement user={user} />;
    case "validation-rules": return <RulesPage user={user} />;
    case "reports": return <PerformancePage user={user} />;
    case "audit": return <AuditPage user={user} />;
    case "profile": return <ProfilePage user={user} />;
    default: return <SettingsPage user={user} />;
  }
}
