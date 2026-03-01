import { useState, useEffect, useCallback, useRef } from "react";

interface UsePollingOptions<T> {
  fetcher: () => Promise<{ ok: boolean; data?: T; error?: string }>;
  interval?: number;
  delay?: number;
  enabled?: boolean;
}

interface UsePollingResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function usePolling<T>({
  fetcher,
  interval = 30000,
  delay = 0,
  enabled = true,
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      setLoading((prev) => prev || data === null);
      const result = await fetcher();
      if (!mountedRef.current) return;
      if (result.ok && result.data !== undefined) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error ?? "Unknown error");
      }
      setLastUpdated(new Date());
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e.message ?? "Fetch failed");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) return;

    const startPolling = () => {
      doFetch();
      intervalRef.current = setInterval(doFetch, interval);
    };

    if (delay > 0) {
      const timeout = setTimeout(startPolling, delay);
      return () => {
        mountedRef.current = false;
        clearTimeout(timeout);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      startPolling();
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [doFetch, interval, delay, enabled]);

  // Pause when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        doFetch();
        intervalRef.current = setInterval(doFetch, interval);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [doFetch, interval]);

  return { data, error, loading, lastUpdated, refresh: doFetch };
}
