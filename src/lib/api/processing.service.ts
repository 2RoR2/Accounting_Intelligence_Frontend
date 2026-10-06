import type { KPI, User } from "@/types";
import { getDocuments } from "./document.service";
import { assertActive } from "../permissions";
import { readDb } from "../mock/repository";
export async function getProcessingJobs(user: User) {
  return (await getDocuments(user)).map((d) => ({
    id: `JOB-${d.id.slice(4)}`,
    documentId: d.id,
    tenantId: d.tenantId,
    status: ["UPLOADED", "QUEUED"].includes(d.status)
      ? "QUEUED"
      : d.status === "PROCESSING"
        ? "PROCESSING"
        : d.status === "FAILED"
          ? "FAILED"
          : "COMPLETED",
    seconds: d.seconds,
    startedAt: d.createdAt,
    completedAt: ["QUEUED", "UPLOADED", "PROCESSING"].includes(d.status)
      ? "—"
      : new Date(
          new Date(d.createdAt).getTime() + d.seconds * 1000,
        ).toISOString(),
  }));
}
export async function getPerformanceMetrics(user: User): Promise<KPI[]> {
  assertActive(readDb(), user);
  return [
    {
      label: "Extraction accuracy",
      value: "96.4%",
      target: "≥ 95%",
      met: true,
      change: "+1.2%",
    },
    {
      label: "Avg. processing time",
      value: "8.7s",
      target: "≤ 20 sec",
      met: true,
      change: "−2.1s",
    },
    {
      label: "Manual entry reduction",
      value: "74.1%",
      target: "≥ 70%",
      met: true,
      change: "+4.3%",
    },
    {
      label: "Exception rate",
      value: "7.6%",
      target: "< 10%",
      met: true,
      change: "−1.8%",
    },
  ];
}
export async function getTrends(period = "week") {
  if (period === "day")
    return [
      { day: "08:00", processed: 12, accuracy: 95.8, exceptions: 8.4 },
      { day: "10:00", processed: 24, accuracy: 96.1, exceptions: 8.1 },
      { day: "12:00", processed: 19, accuracy: 96.3, exceptions: 7.8 },
      { day: "14:00", processed: 28, accuracy: 96.7, exceptions: 7.2 },
      { day: "16:00", processed: 25, accuracy: 96.4, exceptions: 7.6 },
    ];
  if (period === "month")
    return [
      { day: "1–7 Sep", processed: 458, accuracy: 95.2, exceptions: 10.2 },
      { day: "8–14 Sep", processed: 572, accuracy: 95.9, exceptions: 9.4 },
      { day: "15–17 Sep", processed: 327, accuracy: 96.4, exceptions: 7.6 },
    ];
  if (period === "year")
    return [
      { day: "Jan", processed: 480, accuracy: 92.8, exceptions: 14.1 },
      { day: "Feb", processed: 570, accuracy: 93.1, exceptions: 12.6 },
      { day: "Mar", processed: 690, accuracy: 93.6, exceptions: 11.3 },
      { day: "Apr", processed: 830, accuracy: 94.2, exceptions: 10.8 },
      { day: "May", processed: 910, accuracy: 94.9, exceptions: 10.4 },
      { day: "Jun", processed: 1090, accuracy: 95.1, exceptions: 9.1 },
      { day: "Jul", processed: 1180, accuracy: 95.4, exceptions: 8.6 },
      { day: "Aug", processed: 1320, accuracy: 96.1, exceptions: 8.1 },
      { day: "Sep", processed: 1357, accuracy: 96.4, exceptions: 7.6 },
    ];
  if (period === "30")
    return [
      { day: "19 Aug", processed: 42, accuracy: 92.8, exceptions: 14.1 },
      { day: "24 Aug", processed: 57, accuracy: 94.1, exceptions: 12.6 },
      { day: "29 Aug", processed: 69, accuracy: 93.6, exceptions: 11.3 },
      { day: "3 Sep", processed: 83, accuracy: 95.2, exceptions: 10.2 },
      { day: "8 Sep", processed: 91, accuracy: 95.9, exceptions: 9.4 },
      { day: "13 Sep", processed: 109, accuracy: 96.1, exceptions: 8.1 },
      { day: "17 Sep", processed: 108, accuracy: 96.4, exceptions: 7.6 },
    ];
  return [
    { day: "11 Sep", processed: 62, accuracy: 94, exceptions: 12 },
    { day: "12 Sep", processed: 84, accuracy: 95, exceptions: 10 },
    { day: "13 Sep", processed: 73, accuracy: 94, exceptions: 11 },
    { day: "14 Sep", processed: 112, accuracy: 97, exceptions: 7 },
    { day: "15 Sep", processed: 95, accuracy: 96, exceptions: 8 },
    { day: "16 Sep", processed: 124, accuracy: 97, exceptions: 6 },
    { day: "17 Sep", processed: 108, accuracy: 96.4, exceptions: 7.6 },
  ];
}
