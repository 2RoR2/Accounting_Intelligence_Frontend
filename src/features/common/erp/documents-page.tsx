"use client";

import { useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/common/ui";
import type { User } from "@/types";
import { DocumentForm } from "./document-form";
import { DocumentList } from "./document-list";
import { resolveDocumentType, type DocumentGroup } from "./document-logic";

export function ErpDocumentsPage({ user, group, documentId }: { user: User; group: DocumentGroup; documentId?: string }) {
  const type = resolveDocumentType(group, useSearchParams().get("type"));
  if (!type) return <ErrorState message="This document type is unavailable in this section." />;

  const base = user.role === "LOCAL_ADMIN" ? "/company" : "/workspace";
  const key = `${user.id}:${group}:${type}`;
  return documentId
    ? <DocumentForm key={`${key}:${documentId}`} base={base} group={group} type={type} id={documentId} role={user.role} />
    : <DocumentList key={key} base={base} group={group} type={type} canPost={user.role === "LOCAL_ADMIN"} />;
}
