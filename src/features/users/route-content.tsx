import { Dashboard } from "@/features/common/dashboard/dashboard";
import { DocumentReview } from "@/features/common/documents/document-review";
import { DocumentList, UploadPage } from "@/features/common/documents/documents";
import { ExceptionsPage } from "@/features/common/exceptions/exceptions";
import { RecordsPage } from "@/features/common/records/records";
import { ProfilePage } from "@/features/common/settings/profile-page";
import type { User } from "@/types";

export function UserRoutes({ path, user }: { path: string[]; user: User }) {
  const [, page, id] = path;
  switch (page) {
    case "dashboard": return <Dashboard user={user} />;
    case "documents": return id ? <DocumentReview user={user} documentId={id} /> : <DocumentList user={user} />;
    case "upload": return <UploadPage user={user} />;
    case "exceptions": return <ExceptionsPage user={user} />;
    case "records": return <RecordsPage user={user} />;
    default: return <ProfilePage user={user} />;
  }
}
