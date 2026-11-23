/** Proof attached to typed records (payments, refunds, money in/out, bank transfers, manual journals): files or https links. */
import { api, get, json } from "@/lib/api/client";

export type Attachment = {
  id: string; kind: "file" | "link"; name: string; mediaType: string | null; sizeBytes: number | null;
  /** Set for a link. */
  url: string | null;
  /** Same-site path that serves a file (inline, with safe headers); null for a link. */
  fileUrl: string | null;
  uploadedBy: string | null; createdAt: string;
};
export type AttachmentList = { items: Attachment[]; maxBytes: number; maxItems: number };
type Changed = { items: Attachment[]; id: string };

const seg = encodeURIComponent;
const base = (type: string, id: string) => `/api/erp/documents/${seg(type)}/${seg(id)}/attachments`;

export const listAttachments = (type: string, id: string) => get<AttachmentList>(base(type, id));
export const uploadAttachment = (type: string, id: string, file: File) => {
  const form = new FormData();
  form.append("file", file, file.name);
  return api<Changed>(base(type, id), { method: "POST", body: form });
};
export const addAttachmentLink = (type: string, id: string, input: { url: string; name?: string }) =>
  api<Changed>(`${base(type, id)}/link`, json("POST", input));
export const removeAttachment = (attachmentId: string) => api<Changed>(`/api/erp/attachments/${seg(attachmentId)}`, json("DELETE"));
