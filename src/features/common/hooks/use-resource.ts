"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useResource<T>(loader: () => Promise<T>, key: string) {
  const ref = useRef(loader);
  ref.current = loader;
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    let timeoutId: number | undefined;
    try {
      setError("");
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("This page took too long to load. Check the backend and database, then try again.")),
          15000,
        );
      });
      setData(await Promise.race([ref.current(), timeout]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data.");
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    setData(undefined);
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("ai:changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("ai:changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [key, refresh]);
  return { data, error, loading, refresh };
}
