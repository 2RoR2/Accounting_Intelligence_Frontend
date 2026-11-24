/**
 * Plain accounting words for everything the backend reports in system terms.
 *
 * One place for rule codes, document and job statuses, review signals and extraction states,
 * so every screen says "what do I do next?" the same way. Raw codes stay available behind a
 * "Details" toggle; nothing here changes a value, a status or a rule outcome.
 *
 * Rule codes are copied from the backend (read-only):
 *   validation/documents/engine.py              EX-001..EX-010
 *   validation/documents/financial_documents.py BR-CO-*, {BILL|RECEIPT|CREDIT_NOTE|DEBIT_NOTE}-<rule>, TAX-STATUS
 *   validation/documents/profiles.py            PROFILE-*, RCP-*, AP-*, NOTE-LINK
 *   validation/documents/document_validation.py MODEL-DISAGREEMENT, exception type "VALIDATION:<code>"
 *   services/extraction/contracts/reliability.py review signals
 */

type Rule = { title: string; action: string };

const EX_RULES: Record<string, Rule> = {
  "EX-001": { title: "Missing detail", action: "fill it in from the document." },
  "EX-002": { title: "Unclear value", action: "correct the date, amount or number so it matches the document." },
  "EX-003": { title: "Line does not add up", action: "check quantity × unit price against the line amount." },
  "EX-004": { title: "Lines do not add up to the subtotal", action: "check each line amount and the subtotal." },
  "EX-005": { title: "Total does not add up", action: "check the subtotal, tax and total against the document." },
  "EX-006": { title: "Due date is before the document date", action: "check both dates on the document." },
  "EX-007": { title: "Possible duplicate", action: "compare it with the earlier document before approving." },
  "EX-008": { title: "New supplier", action: "add it to Contacts." },
  "EX-009": { title: "Purchase order not matched", action: "check the PO number and amounts." },
  "EX-010": { title: "Unusual amount", action: "confirm the amount is right, then record why." },
};

const BR_RULES: Record<string, Rule> = {
  "BR-CO-10": { title: "Line amounts do not match the subtotal", action: "check each line amount." },
  "BR-CO-13": { title: "Amount before tax does not add up", action: "check discounts and charges." },
  "BR-CO-14": { title: "Tax breakdown does not match the tax total", action: "check each tax line." },
  "BR-CO-15": { title: "Total with tax does not add up", action: "check the amount before tax plus tax." },
  "BR-CO-16": { title: "Amount due does not add up", action: "check the total, any amount already paid and rounding." },
  "BR-CO-17": { title: "Tax rate and tax amount disagree", action: "check the tax lines on the document." },
};

const OTHER_RULES: Record<string, Rule> = {
  "PROFILE-001": { title: "Document type not set up", action: "choose the right type (invoice, bill, receipt or note)." },
  "PROFILE-REQUIRED": { title: "Missing detail", action: "fill it in from the document." },
  "RCP-TRANSACTION-TIME": { title: "Receipt time unclear", action: "enter the time as printed." },
  "RCP-PAYMENT-METHOD": { title: "Payment method not recognised", action: "choose how it was paid (cash, card or transfer)." },
  "RCP-005": { title: "Cash and change do not add up", action: "check the amount paid and the change given." },
  "AP-RECEIVED-DATE": { title: "Received date unclear", action: "enter the date you received the document." },
  "AP-009": { title: "Outstanding amount does not add up", action: "check the total less any amount already paid." },
  "NOTE-LINK": { title: "Note not linked", action: "link it to the original invoice." },
  "TAX-STATUS": { title: "Tax treatment unclear", action: "check whether tax is printed, then confirm it." },
  "MODEL-DISAGREEMENT": { title: "Second reading differs", action: "compare the value with the document." },
  "AMOUNT-PLAUSIBLE": { title: "Amounts do not fit together", action: "check tax, subtotal and total on the document; they may be swapped or misread." },
  "BUYER-NOT-COMPANY": { title: "Not addressed to this company", action: "if it isn't yours, set it aside." },
  "RCP-007": { title: "Refund receipt", action: "record it as a refund, not as an ordinary expense." },
  "SUBTOTAL-DERIVED": { title: "Subtotal not printed", action: "compare the total of the lines with the document." },
  "PRETAX-BASIS": { title: "Subtotal not printed", action: "check the amount before tax used for the checks." },
  "TOTAL-COMPONENTS": { title: "Total does not add up", action: "check the subtotal, tax and total against the document." },
  "ARITHMETIC-PREREQ": { title: "Amounts not compared", action: "check which currency the document prints." },
};

/** Document kinds whose rules are named "<KIND>-<RULE>" by the backend. */
export const FINANCIAL_KINDS = ["BILL", "RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"] as const;
const KIND_NOUN: Record<string, string> = { BILL: "bill", RECEIPT: "receipt", CREDIT_NOTE: "credit note", DEBIT_NOTE: "debit note" };
const SUFFIX_RULES: Record<string, (noun: string) => Rule> = {
  FORMAT: () => ({ title: "Unclear value", action: "correct it so it matches the document." }),
  REQUIRED: (noun) => ({ title: "Missing detail", action: `fill it in from the ${noun}.` }),
  DATES: () => ({ title: "Dates are in the wrong order", action: "check the dates on the document." }),
  LINE_MATH: () => ({ title: "Line does not add up", action: "check quantity × unit price against the line amount." }),
  SUBTOTAL: () => ({ title: "Lines do not add up to the subtotal", action: "check each line amount and the subtotal." }),
  AMOUNT_DUE: () => ({ title: "Amount due does not add up", action: "check the charges, payments and amount due." }),
  SIGN: (noun) => ({ title: "Negative amount", action: `enter the ${noun} amounts as positive numbers.` }),
  TOTAL: () => ({ title: "Total does not add up", action: "check the subtotal, tax and total against the document." }),
  FIELDS: () => ({ title: "Key details unclear", action: "check the number, date, currency and amounts against the document." }),
  DUE_DATE: (noun) => ({ title: "Due date unclear", action: `check the ${noun} date and due date on the document.` }),
  BILLING_PERIOD: () => ({ title: "Billing period unclear", action: "enter the period's start and end dates as printed." }),
  LINE_DETAILS: () => ({ title: "Item rows not read", action: "check the printed items and add any that are missing." }),
  RETURNS: () => ({ title: "Negative amount or return", action: "check whether this is a return or refund before approving." }),
  NOTE_LINK: () => ({ title: "Note not linked", action: "link it to the original invoice." }),
  NOTE_DIRECTION: () => ({ title: "Note direction unclear", action: "check whether it is a credit note or a debit note." }),
};

/** Every rule code the backend can emit today. Used by tests to prove each has a sentence. */
export const BACKEND_RULE_CODES: readonly string[] = [
  ...Object.keys(EX_RULES), ...Object.keys(BR_RULES), ...Object.keys(OTHER_RULES),
  ...FINANCIAL_KINDS.flatMap((kind) => Object.keys(SUFFIX_RULES).map((rule) => `${kind}-${rule}`)),
];

const FALLBACK_RULE: Rule = { title: "Needs a check", action: "compare this with the document before approving." };
const CUSTOMER_FIELDS = new Set(["customer", "buyer", "buyer_name", "customer_name"]);
/** EX-002 on the document type: the type is unknown, not detected, or disagrees with the stored type. */
const TYPE_NOT_CERTAIN: Rule = { title: "Type not certain", action: "choose the document type." };
const TYPE_PENDING: Rule = { title: "Runs after the type is chosen", action: "choose the document type first." };

/**
 * Checks the backend reports only because the type is unknown: "<KIND>_REQUIRED_FIELDS" and
 * "<KIND>_FINANCIAL_MATH" with the kind "unknown" (document_validation.evaluate_document). They run
 * once a type is chosen, so they are not a separate problem to fix.
 */
export function typePendingCheck(code: string | null | undefined) {
  return /^(UNKNOWN|NONE)_(REQUIRED_FIELDS|FINANCIAL_MATH)$/.test(ruleCode(code));
}

/** Strips the "VALIDATION:" prefix the exception queue stores in front of rule codes. */
export function ruleCode(code: string | null | undefined) {
  return String(code ?? "").trim().replace(/^VALIDATION:/i, "").toUpperCase();
}

function findRule(code: string | null | undefined, field?: string | null): Rule | null {
  const key = ruleCode(code);
  if (key === "EX-008" && field && CUSTOMER_FIELDS.has(field)) return { title: "New customer", action: "add it to Contacts." };
  if (key === "EX-002" && field === "document_type") return TYPE_NOT_CERTAIN;
  if (typePendingCheck(key)) return TYPE_PENDING;
  const known = EX_RULES[key] ?? BR_RULES[key] ?? OTHER_RULES[key];
  if (known) return known;
  const kind = FINANCIAL_KINDS.find((name) => key.startsWith(`${name}-`));
  const suffix = kind ? SUFFIX_RULES[key.slice(kind.length + 1)] : undefined;
  return kind && suffix ? suffix(KIND_NOUN[kind]) : null;
}

/** True when the glossary has a specific sentence for this code (not the generic fallback). */
export const isKnownRule = (code: string | null | undefined) => findRule(code) !== null;

/** Short heading for a finding, e.g. "New supplier". Never blank. */
export function ruleTitle(code: string | null | undefined, field?: string | null) {
  return (findRule(code, field) ?? FALLBACK_RULE).title;
}

/** One plain sentence saying what to do, e.g. "New supplier: add it to Contacts." Never blank. */
export function ruleSentence(code: string | null | undefined, field?: string | null) {
  const rule = findRule(code, field) ?? FALLBACK_RULE;
  return `${rule.title}: ${rule.action}`;
}

/* ---------- The duplicate check's three states (25 Nov review findings) ---------- */

/** The result fields the check sentences read. */
type CheckLike = { rule: string; field?: string | null; result?: string | null; checkStatus?: string | null; message?: string | null };

/**
 * EX-007 in one of three states: it could not run (a supplier or number is missing), it found a possible duplicate,
 * or it passed. A check that did not run must never read as "possible duplicate".
 */
export type DuplicateState = "not-run" | "found" | "passed" | "off";
export function duplicateState(item: CheckLike): DuplicateState | null {
  if (ruleCode(item.rule) !== "EX-007") return null;
  const result = String(item.result ?? "").toUpperCase();
  if (result === "FAIL" || result === "FAILED") return "found";
  if (result === "PASS" || result === "PASSED") return "passed";
  if (result === "NOT_APPLICABLE") return "off";
  return "not-run";
}

/** Older results said "A duplicate check needs both a supplier and an invoice number" without saying what to fill. */
const DUPLICATE_NOT_RUN = "Duplicate check can't run yet: fill the supplier and invoice number.";

/**
 * The sentence for one check, by its result. EX-007 and BUYER-NOT-COMPANY speak for themselves (the backend message
 * names the missing field, the other document, or the other company); every other rule uses ruleSentence.
 */
export function checkSentence(item: CheckLike): string {
  const message = (item.message ?? "").trim();
  const duplicate = duplicateState(item);
  if (duplicate === "not-run") return message.startsWith("Duplicate check can't run yet") ? message : DUPLICATE_NOT_RUN;
  if (duplicate === "found") return message.startsWith("Possible duplicate of") ? message : ruleSentence(item.rule, item.field);
  if (duplicate === "passed") return "No duplicate: no other invoice from this supplier has this number.";
  // "This document is addressed to …, not …" when it fails; "Addressed to this company." when it passes.
  if (ruleCode(item.rule) === "BUYER-NOT-COMPANY" && message) return message;
  // A check that does not apply says why ("Supplier matching is skipped: this document is addressed to another
  // company"), not the rule's instruction ("New supplier: add it to Contacts"), which would ask for something not needed.
  if (String(item.result ?? "").toUpperCase() === "NOT_APPLICABLE" && message) return message;
  return ruleSentence(item.rule, item.field);
}

/** True when checkSentence already said the backend message, so a screen need not repeat it beside the sentence. */
export const sentenceIsMessage = (item: CheckLike) => checkSentence(item) === (item.message ?? "").trim();

/* ---------- Why reading left the type or the details empty ---------- */

/** The parts of the stored reading result (raw extraction) that say how far reading got. */
export interface ReadingFacts {
  aiMode?: string | null; aiError?: string | null; issueCodes?: string[];
  typeStatus?: string | null; typeReason?: string | null; typeMethod?: string | null;
  isPdf?: boolean;
  /** At least one field was read from the document (not typed in by a person). */
  fieldsRead?: boolean;
}

type FieldReading = { value?: string | null; original?: string | null; correctedBy?: string | null };
/** True when reading put a value in at least one field. A person's own entries do not count. */
export function fieldsWereRead(fields?: Record<string, FieldReading> | null) {
  return Object.values(fields ?? {}).some(field => field.original != null || (field.value != null && !field.correctedBy));
}

/** True when reading looked for a printed heading. False when no type rules ran at all (nothing was mapped). */
export function typeWasLookedFor(facts: Pick<ReadingFacts, "typeReason" | "typeMethod">) {
  return !!facts.typeMethod && facts.typeMethod !== "none" && facts.typeReason !== "NO_AUTOMATIC_MAPPING";
}

/**
 * Nothing was read automatically: no type was detected and no field holds a read value. Decided from
 * the result, not from the classification method, which a successful reading may leave out.
 */
export function nothingWasRead(facts: Pick<ReadingFacts, "typeStatus" | "fieldsRead">) {
  return facts.typeStatus !== "classified" && !facts.fieldsRead;
}

/** The line under the type details when no printed heading is listed for it. */
export function typeHeadingNote(facts: Pick<ReadingFacts, "typeStatus" | "typeReason" | "typeMethod" | "fieldsRead">) {
  if (facts.typeStatus === "classified") return "The type was detected, but the heading it was read from is not listed. Check it against the original document.";
  if (nothingWasRead(facts) && !typeWasLookedFor(facts)) return "The type was not looked for: nothing was read from this document automatically.";
  return "No heading on the document names its type. Check the original document.";
}

/**
 * Plain sentences on why the type or the details are missing, from the stored reading result,
 * or null when reading settled the type. Never claims a step that did not run. "Read again" is
 * not suggested: the backend reads a document again only when it could not be read at all.
 */
export function readingReason(facts: ReadingFacts, { typeChosen = false } = {}): string | null {
  const codes = new Set(facts.issueCodes ?? []);
  const subject = facts.isPdf ? "this PDF" : "this document";
  const next = typeChosen ? "Enter the details from the document." : "Choose the type and enter the details from the document.";
  if (codes.has("OCR_NO_TEXT")) return `No text could be found in ${subject}. Upload a clearer copy, or a PDF that contains text.`;
  if (facts.typeStatus === "classified") return null;
  if (facts.aiError === "AI_RESULT_REJECTED_BY_CONTRACT" || codes.has("AI_RESULT_REJECTED"))
    return `Automatic reading returned details that did not fit the accounting fields, so none were used. ${next}`;
  if (facts.aiError || codes.has("AI_UNAVAILABLE"))
    return `Automatic reading could not be reached${facts.aiError ? ` (${facts.aiError})` : ""}, so ${subject} was only read with the basic rules. ${next} Ask your admin to check automatic reading.`;
  const off = facts.aiMode === "off";
  if (nothingWasRead(facts) && !typeWasLookedFor(facts))
    return off
      ? `Automatic reading is switched off on this installation, so ${subject} was not read. ${next} Ask your admin to turn reading on for new uploads.`
      : `${subject === "this PDF" ? "This PDF" : "This document"} was not read automatically. ${next}`;
  if (facts.typeReason === "RECEIPT_REQUIRES_REVIEW")
    return `${off ? "Automatic reading is switched off on this installation, so this photo was only checked with the basic receipt rules. They" : "The receipt rules"} could not confirm it is a receipt. ${next}`;
  return `No heading on the document names its type. ${next}`;
}

/** "Chosen by Aina on 2026-11-19." for a person's type decision. */
export function formatChosenBy(decision: { chosenBy?: string | null; chosenAt?: string | null }) {
  return `Chosen by ${decision.chosenBy || "a reviewer"}${decision.chosenAt ? ` on ${decision.chosenAt.slice(0, 10)}` : ""}.`;
}

/**
 * The reading facts held in a stored raw extraction (provenance.ai, issues). The type facts come from
 * `classification` when given: pass the normalised one from mapExtraction (the response's top-level
 * classification, else raw.document_type), so a type the API reports as classified is never called unread.
 */
export function readingFacts(raw: Record<string, unknown> | undefined, mimeType?: string | null,
  classification?: { status?: string | null; reason?: string | null; method?: string | null } | null,
  fields?: Record<string, FieldReading> | null): ReadingFacts {
  const record = (value: unknown) => (value && typeof value === "object" ? value as Record<string, unknown> : {});
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const ai = record(record(raw?.provenance).ai);
  const type = classification ? record(classification) : record(raw?.document_type);
  const issues = Array.isArray(raw?.issues) ? raw.issues : [];
  return {
    aiMode: text(ai.mode), aiError: text(ai.error),
    issueCodes: issues.map(issue => text(record(issue).code)).filter((code): code is string => !!code),
    typeStatus: text(type.status), typeReason: text(type.reason), typeMethod: text(type.method),
    isPdf: String(mimeType ?? "").toLowerCase() === "application/pdf",
    fieldsRead: fieldsWereRead(fields),
  };
}

/* ---------- Statuses ---------- */

const STATUS_LABELS: Record<string, string> = {
  // Documents
  UPLOADED: "Uploaded",
  QUEUED: "Waiting to be read",
  PROCESSING: "Reading document",
  EXTRACTED: "Read, to check",
  VALIDATING: "Checking",
  EXCEPTION: "Needs fixing",
  IN_REVIEW: "In review",
  CORRECTED: "Corrected, check again",
  VALIDATED: "Approved",
  STANDARDISED: "Saved to records",
  COMPLETED: "Saved to records",
  FAILED: "Could not read",
  // Exceptions
  OPEN: "To do",
  ASSIGNED: "Assigned",
  RESOLVED: "Resolved",
  // Processing jobs
  RUNNING: "Reading document",
  RETRYING: "Trying again",
  SUCCEEDED: "Done",
  DEAD_LETTER: "Stopped, ask your admin",
  CANCELLED: "Cancelled",
  // Validation report and results
  REVIEW_REQUIRED: "Needs your review",
  VALID: "Checks passed",
  PASS: "OK",
  WARNING: "Please check",
  FAIL: "Needs fixing",
  NOT_APPLICABLE: "Not needed",
  NOT_CHECKED: "Not checked",
  // Bank matching
  PROPOSED: "Suggested match",
  NEEDS_REVIEW: "Please check",
  CONFIRMED: "Matched",
  MATCHED: "Matched",
  UNMATCHED: "Not matched",
  IGNORED: "Ignored",
  REVERTED: "Unmatched",
};

/** Accountant words for a document, exception, job, check or bank-line status. Unknown values are tidied, never blank. */
export function statusLabel(status: string | null | undefined) {
  const raw = String(status ?? "").trim();
  if (!raw) return "Unknown";
  const key = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const words = raw.replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The word for a document that passed every check and has no open problem. An accountant submits it for approval;
 * a company admin approves it, so only the admin's word says "approve".
 */
export const readyLabel = (role: string | null | undefined) => (role === "LOCAL_ADMIN" ? "Ready to approve" : "Ready to submit");

/** Only a document still waiting for the accountant can be "ready": the backend sets `ready` from the same rule as the ready lane. */
export function documentStatusLabel(status: string | null | undefined, ready: boolean | null | undefined, role: string | null | undefined) {
  const key = String(status ?? "").toUpperCase();
  return ready && (key === "EXTRACTED" || key === "CORRECTED") ? readyLabel(role) : statusLabel(status);
}

/** Badge colour from the raw status, so relabelling never changes the meaning of a colour. */
export function statusTone(status: string | null | undefined): "green" | "red" | "amber" | "neutral" {
  const value = String(status ?? "").toUpperCase();
  if (/ACTIVE|PASS|COMPLETED|APPROVED|VALIDATED|STANDARDISED|RESOLVED|CONFIRMED|MATCHED|SUCCEEDED|^VALID$|^EXTRACTED$/.test(value) && !/UNMATCHED/.test(value)) return "green";
  if (/FAIL|REJECT|SUSPEND|DISABLED|DEAD_LETTER|HIGH$/.test(value)) return "red";
  if (/PENDING|INVITED|EXCEPTION|LOW|WARNING|REVIEW|CORRECTED|PROPOSED|RETRY/.test(value)) return "amber";
  return "neutral";
}

const DOCUMENT_KINDS: Record<string, string> = {
  INVOICE: "Invoice", BILL: "Bill", RECEIPT: "Receipt", CREDIT_NOTE: "Credit note", DEBIT_NOTE: "Debit note",
  // Uploaded without a type (Inbox) and not detected yet, or the reader could not tell.
  AUTO: "Type not detected",
};
/** The types a person can choose for a document, in menu order. AUTO is a state ("not detected yet"), not a type: the backend refuses it. */
export const CHOOSABLE_DOCUMENT_KINDS = Object.keys(DOCUMENT_KINDS).filter((kind) => kind !== "AUTO");
/** "CREDIT_NOTE" -> "Credit note". Unknown kinds are tidied, never blank. */
export function documentKindLabel(kind: string | null | undefined) {
  const key = String(kind ?? "").toUpperCase();
  return DOCUMENT_KINDS[key] ?? (key ? statusLabel(key) : "Document");
}

/* ---------- Review signals and extraction states ---------- */

export type ReviewSignal = "verified" | "check" | "suggestion" | "missing";
const REVIEW_SIGNALS: Record<ReviewSignal, string> = {
  verified: "Read from document",
  check: "Please check",
  suggestion: "Suggested",
  missing: "Not found",
};
export function reviewSignalLabel(signal: string | null | undefined) {
  return REVIEW_SIGNALS[signal as ReviewSignal] ?? "Please check";
}

const EVIDENCE_STATUS: Record<string, string> = {
  source_backed: "Read from document",
  ambiguous_candidate: "Found on document, not chosen",
  missing: "Not found",
  conflicting: "Two different values found",
  human_corrected: "Corrected by a reviewer",
  model_source_verified: "Suggested, printed on document",
  model_suggested: "Suggested, not confirmed",
  unsupported: "Please check",
};
export function evidenceLabel(status: string | null | undefined) {
  return EVIDENCE_STATUS[String(status ?? "")] ?? "Please check";
}

const EXTRACTION_STATES: Record<string, string> = {
  resolved: "Read from document",
  missing: "Not found",
  ambiguous: "Unclear, choose a value",
  conflict: "Two different values found",
  unsupported: "Please check",
  unreadable: "Could not read",
};
export function extractionStateLabel(state: string | null | undefined) {
  return EXTRACTION_STATES[String(state ?? "")] ?? "Please check";
}
