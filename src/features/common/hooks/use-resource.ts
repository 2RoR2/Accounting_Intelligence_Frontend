"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useResource<T>(loader: () => Promise<T>, key: string) {
  const ref = useRef(loader);
  ref.current = loader;
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setError("");
      setData(await ref.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data.");
    } finally {
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
