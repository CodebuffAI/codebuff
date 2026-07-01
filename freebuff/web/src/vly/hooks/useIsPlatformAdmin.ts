"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export interface UseIsPlatformAdminResult {
  /**
   * True if viewer has platform admin role ("god" or "admin").
   * Admins bypass feature gates and are granted all Scale Plan features.
   */
  isPlatformAdmin: boolean;

  /**
   * True only for the "god" role (strictly). Use for god-only surfaces like
   * Automations, whose server-side gate requires role === "god".
   */
  isGod: boolean;

  /**
   * True while the viewer query is still loading.
   */
  isLoading: boolean;
}

/**
 * Shared hook that reports whether the current viewer is a platform admin.
 *
 * Used throughout the app to grant admins full access to paid features
 * (matches the pattern used in convex/coding_agent/shared/triggerGates.ts
 * and hooks/useCreditCheck.ts).
 */
export function useIsPlatformAdmin(): UseIsPlatformAdminResult {
  const viewer = useQuery(api.users.viewer);
  const isLoading = viewer === undefined;
  const isPlatformAdmin = viewer?.role === "god" || viewer?.role === "admin";
  const isGod = viewer?.role === "god";

  return { isPlatformAdmin, isGod, isLoading };
}
