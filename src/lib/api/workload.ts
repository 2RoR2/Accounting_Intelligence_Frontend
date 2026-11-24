import { get } from "./client";

/** Median and range over n documents; all null when nothing was recorded. */
export type WorkloadStats = { n: number; median: number | null; min: number | null; max: number | null };

export type WorkloadMetrics = {
  documents: number;
  touches: WorkloadStats;
  touchTotals: { fieldEdits: number; lineItemChanges: number; typeChoices: number; decisions: number };
  correctedFields: WorkloadStats;
  firstPass: { checked: number; exceptions: number; rate: number | null; excluded: number };
  readyWithoutCorrection: { ready: number; withoutCorrection: number; rate: number | null; notReady: number };
  reviewTime: WorkloadStats & { measured: boolean; documentsNotTimed: number };
};

export type WorkloadEffortStudy = {
  status: "MET" | "NOT MET" | "NOT MEASURED";
  valid: boolean;
  reduction: number | null;
  participants: number;
  pairedParticipants: number;
  sessions: number;
  rule: string;
  byMode: Record<"manual" | "ai_assisted", { sessions: number; activeSeconds: WorkloadStats; fieldsTyped: WorkloadStats }>;
};

/** GET /api/reports/workload: per-document workload read from what the system records, plus the effort study's result. */
export type WorkloadReport = {
  version: string;
  timezone: string;
  filters: { fromDate: string | null; toDate: string | null };
  definitions: Record<"touches" | "correctedFields" | "firstPass" | "readyWithoutCorrection" | "reviewTime" | "sc2", string>;
  overall: WorkloadMetrics;
  periods: Array<WorkloadMetrics & { period: string }>;
  correctedFieldKeys: Array<{ fieldKey: string; documents: number }>;
  documentsTotal: number;
  documentsShown: number;
  effortStudy: WorkloadEffortStudy;
  sc2: { status: WorkloadEffortStudy["status"]; reduction: number | null; source: "effort-study"; note: string };
};

export function workloadReportPath(fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const query = params.toString();
  return `/api/reports/workload${query ? `?${query}` : ""}`;
}

export function getWorkloadReport(fromDate?: string, toDate?: string) {
  return get<WorkloadReport>(workloadReportPath(fromDate, toDate));
}
