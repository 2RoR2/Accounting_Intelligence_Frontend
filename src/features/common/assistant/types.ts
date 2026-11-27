/** The Ask AccordAI contract (backend `POST /api/assistant/ask`, `GET /api/assistant/suggestions`). */

/** One figure the answer cites. Every value is formatted by the server from the database, never by the model. */
export type AssistantFact = {
  id: string;
  label: string;
  value: string;
  unit: string | null;
  /** An in-app path from the server (for example `/company/reports/...`). Never built in the browser. */
  href: string | null;
};

export type AssistantCitation = { label: string; href: string | null };

export type AssistantAnswer = {
  /** Plain text. May hold `{{f1}}` markers that stand for facts; nothing in it is ever treated as markup. */
  answer: string;
  facts: AssistantFact[];
  citations: AssistantCitation[];
  /** The assistant declined (no tool fits, or the request would post, pay, delete or reach other companies). */
  refused: boolean;
  /** A rule-based answer: the AI model was unavailable, rate-limited or rejected. */
  fallback: boolean;
  suggestions: string[];
  auditId: string | null;
  /** Names of the read-only report tools the answer used, in order (shown under "How this was answered"). */
  toolsUsed: string[];
  /** The model that wrote the answer; null for a rule-based answer or a refusal made without the model. */
  model: string | null;
};

/** What the backend accepts as page context (it rejects any other key with 422). */
export type AssistantContext = {
  page?: string;
  documentId?: string;
  recordId?: string;
  reportType?: string;
  period?: string;
};

/** The context an "Explain this" button passes; `label` is only shown in the panel ("About: Invoice INV-104"). */
export type AssistantContextInput = AssistantContext & { label?: string };

export type OpenAssistantOptions = {
  context?: AssistantContextInput;
  /** When set, the question is sent as soon as the panel opens. */
  question?: string;
};

/** The assistant is off, or not offered to this role: `AI_ASSIST` is off on the backend (403). */
export type Availability = "checking" | "on" | "off";

export type TurnState = "pending" | "done" | "error";

export type Turn = {
  id: string;
  question: string;
  context: AssistantContext;
  /** Human label of the context the question was asked about. */
  label?: string;
  state: TurnState;
  answer?: AssistantAnswer;
  error?: string;
};

export const MAX_QUESTION_LENGTH = 500;
