import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiGet } from "@/lib/api";
import type { Dashboard, Me } from "@/lib/types";

/** The single source of truth for "who am I". A 401 resolves to null instead of
 *  throwing, so pages render their shell even with no backend behind them. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await apiGet<Me>("/auth/me");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
}

export function useDashboard() {
  return useQuery<Dashboard>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<Dashboard>("/dashboard"),
    retry: false,
  });
}

/** Invalidates the keys a mutation affects. Never refetch inside a useEffect. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
}

export function apiErrorMessage(err: unknown, fallback = "Algo não saiu como esperado. Tente novamente."): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  return fallback;
}

export { useMutation };
