import type { KPI, User } from "@/types";
import { get } from "./client";

export async function getProcessingJobs(user: User) {
  void user;
  return get<Array<{ id: string; documentId: string; tenantId: string; status: string; attempts: number; createdAt: string; startedAt: string; seconds: number; completedAt: string }>>("/api/processing/jobs");
}

export const getProcessingJob = (jobId: string) => get<{ id: string; documentId: string; tenantId: string; status: string; attempts: number; maxAttempts: number; lastError?: string | null; createdAt: string; finishedAt: string }>(`/api/processing/jobs/${jobId}`);
export const getProcessingWorkers = () => get<Array<{ name: string; queue: string; status: string; redis: string; tenantScope: string }>>("/api/processing/workers");

/** Admins only (the backend refuses accountants). `queueBackend`/`workers`/`busyWorkers` exist when the inline queue runs. */
export const getProcessingHealth = () => get<{ status: string; worker: boolean; redis: string; pendingJobs: number;
  queueBackend?: string; workers?: number; busyWorkers?: number }>("/api/processing/health");

export async function getPerformanceMetrics(user: User): Promise<KPI[]> {
  void user;
  return get<KPI[]>("/api/processing/metrics");
}

export async function getTrends(period = "week") {
  return get<Array<{ day: string; processed: number; succeeded?: number; failed?: number; accuracy: number; exceptions: number }>>(`/api/processing/trends?period=${encodeURIComponent(period)}`);
}
