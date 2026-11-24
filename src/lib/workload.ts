import type { WorkloadEffortStudy, WorkloadStats } from "@/lib/api/workload";

export const NOT_MEASURED = "Not measured yet";

const number = (value: number) => new Intl.NumberFormat("en-MY", { maximumFractionDigits: 1 }).format(value);

/** "2 median (range 0–2, n = 14)", or plainly not measured when there is nothing to report. */
export function statsLabel(stats: WorkloadStats, unit = "") {
  if (!stats.n || stats.median == null || stats.min == null || stats.max == null) return NOT_MEASURED;
  const suffix = unit ? ` ${unit}` : "";
  return `${number(stats.median)}${suffix} median (range ${number(stats.min)}–${number(stats.max)}, n = ${stats.n})`;
}

/** "1 field edit", "2 field edits". */
export const countLabel = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

/** "1 of 14 (7.1%)", or not measured when the denominator is empty. */
export function rateLabel(part: number, whole: number, rate: number | null) {
  if (!whole || rate == null) return NOT_MEASURED;
  return `${part} of ${whole} (${number(rate)}%)`;
}

/** The SC2 line: only the effort study gives a reduction, and only when its own rule is satisfied. */
export function sc2Label(study: Pick<WorkloadEffortStudy, "status" | "valid" | "reduction" | "pairedParticipants">) {
  if (study.status === "NOT MEASURED" || !study.valid || study.reduction == null)
    return `${NOT_MEASURED}: ${study.pairedParticipants} paired participant${study.pairedParticipants === 1 ? "" : "s"} so far; at least 2 covering both orders are needed.`;
  return `${study.status === "MET" ? "Met" : "Not met"}: ${number(study.reduction)}% less active time across ${study.pairedParticipants} paired participants (target 70%).`;
}
