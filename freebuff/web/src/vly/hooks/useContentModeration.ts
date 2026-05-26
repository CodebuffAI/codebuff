"use client";

import { useCallback, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export type ModerationCategory =
  | "crypto"
  | "stock_market"
  | "constant_monitoring"
  | "high_resource";

/**
 * Hook for checking content against moderation rules.
 */
export function useContentModeration() {
  const checkContentAction = useAction(api.content_moderation.checkContent);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkContent = useCallback(
    async (content: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const result = await checkContentAction({ content });
        return {
          flagged: result.flagged,
          categories: result.categories as ModerationCategory[],
        };
      } catch {
        return { flagged: false, categories: [] as ModerationCategory[] };
      }
    },
    [checkContentAction],
  );

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return { checkContent, reset };
}
