/** Rules for the Attachments box. The server decides again from the file's bytes; these only give a quick, clear message. */

/** Typed supplier documents: keyed in from the supplier's paper, so the form shows that paper where sales documents
 * show their printed preview. */
export const SUPPLIER_COPY_TYPES: ReadonlySet<string> = new Set(["bill", "purchase-credit-note", "purchase-debit-note"]);
export const ATTACHABLE_TYPES: ReadonlySet<string> = new Set([
  "payment", "purchase-payment", "refund", "purchase-refund", "money-in", "money-out", "bank-transfer", "journal-entry",
  ...SUPPLIER_COPY_TYPES,
]);
export const showsSupplierCopy = (type: string) => SUPPLIER_COPY_TYPES.has(type);
/** Sent on window after an attachment is added or removed, so the supplier's copy and the Attachments box agree. */
export const ATTACHMENTS_CHANGED = "attachments:changed";
export type AttachmentsChanged = { type: string; id: string };

/** The files that can be shown beside the form (PDFs and images, oldest first, as attached). Links are listed instead. */
export function viewableCopies<T extends { kind: string; mediaType: string | null; fileUrl: string | null }>(items: T[]): T[] {
  return items.filter((item) => item.kind === "file" && !!item.fileUrl
    && (item.mediaType === "application/pdf" || isImage(item.mediaType)));
}
export const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const FILE_SUFFIX = /\.(pdf|png|jpe?g|webp)$/i;

export const canAttach = (type: string) => ATTACHABLE_TYPES.has(type);

/** A message when the file cannot be attached, or "" when it can be tried. */
export function fileProblem(file: { name: string; size: number; type: string }): string {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "This file is over the 10 MB limit. Choose a smaller file.";
  if (!FILE_TYPES.includes(file.type) && !FILE_SUFFIX.test(file.name)) {
    return "Attach a PDF, PNG, JPEG or WebP file, or paste a link instead.";
  }
  return "";
}

/** A message when the address cannot be attached, or "" when it can be tried. Only plain https:// links are kept. */
export function linkProblem(raw: string): string {
  const value = raw.trim();
  if (!value) return "Enter the link.";
  if (!/^https:\/\//i.test(value)) return "Only https:// links can be attached.";
  if (/\s/.test(value)) return "The link must not contain spaces.";
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password) return "That is not a valid web address.";
  } catch {
    return "That is not a valid web address.";
  }
  return value.length > 2000 ? "The link is too long." : "";
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const isImage = (mediaType: string | null | undefined) => !!mediaType && mediaType.startsWith("image/");
export const linkHost = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
