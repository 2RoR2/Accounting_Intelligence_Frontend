import { ApiError, get } from "./client";

export const latestBenchmarkPath = "/api/evaluation/latest";

type LiteBenchmark = {
  benchmark: "lite-extraction";
  created_at: string;
  settings: { manifest_dir: string };
  documents: unknown[];
  models?: Record<string, number>;
  overall: { accuracy: number | null };
  seconds_per_document?: { total: { median: number; p90: number } | null };
  exception_rate?: number | null;
  stopped?: string | null;
};

/** The API may expose a completed runs/lite-benchmark-*.json result as its latest result. */
export async function getLatestBenchmark(): Promise<LiteBenchmark | null> {
  try {
    const result = await get<LiteBenchmark | null>(latestBenchmarkPath);
    if (result?.benchmark !== "lite-extraction" || result.stopped || !result.created_at || !result.overall ||
        !Array.isArray(result.documents) || !result.documents.length ||
        !/(?:^|[\\/])hold[-_]?out(?:[\\/]|$)/i.test(result.settings?.manifest_dir ?? "")) return null;
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
