/**
 * The Total shown in a document list. Once a record is saved, its total is shown as it is. Before that, the list shows
 * the total the AI read from the document, marked "read" so nobody takes it for an approved figure; the backend says
 * which one it is in `totalSource` ("record" or "read").
 */
export interface ListedTotal {
  totalAmount?: string | number | null;
  totalSource?: "record" | "read" | null;
}

export const READ_TOTAL_HINT = "Read from the document by the AI. Not yet approved, so not saved to records.";

/** A total with two decimals; the currency is on the document. */
export function registerAmount(value: string | number) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
}

export function listedTotal(doc: ListedTotal): { text: string; read: boolean } {
  if (doc.totalAmount == null || doc.totalAmount === "") return { text: "—", read: false };
  return { text: registerAmount(doc.totalAmount), read: doc.totalSource === "read" };
}
