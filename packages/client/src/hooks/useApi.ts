import { useState, useCallback } from "react";

interface UseApiResult<T> {
  execute: (...args: any[]) => Promise<T | null>;
  loading: boolean;
  error: string | null;
}

export function useApi<T>(
  apiFn: (...args: any[]) => Promise<{ ok: boolean; data?: T; error?: string }>
): UseApiResult<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: any[]) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFn(...args);
        if (result.ok && result.data !== undefined) {
          return result.data;
        }
        setError(result.error ?? "Request failed");
        return null;
      } catch (e: any) {
        setError(e.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiFn]
  );

  return { execute, loading, error };
}
