/** Preserve unavailable resources as explicit errors, never sample accounting data. */
export async function loadReviewResource<T>(request: Promise<T>, label: string, empty: T, timeoutMs = 4000): Promise<{ data: T; error: string | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Request timed out. Retry to load this information.")), timeoutMs);
    })]);
    return { data, error: null };
  } catch (error) {
    return { data: empty, error: label + ": " + (error instanceof Error ? error.message : "Unable to load this information.") };
  } finally {
    clearTimeout(timer);
  }
}
