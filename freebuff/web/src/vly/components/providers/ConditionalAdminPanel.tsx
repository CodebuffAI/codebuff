"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import dynamic from "next/dynamic";

// Lazy load admin panel - only imports when rendered (god users only)
const GlobalAdminQuickPanel = dynamic(() =>
  import("./GlobalAdminQuickPanel").then((mod) => ({
    default: mod.GlobalAdminQuickPanel,
  })),
);

/**
 * Conditional wrapper for the admin panel.
 * Only renders (and thus downloads) the admin panel code for god users.
 *
 * For non-god users: Returns null immediately, admin code never downloads.
 * For god users: Renders GlobalAdminQuickPanel, triggering lazy load.
 */
export function ConditionalAdminPanel() {
  const currentUser = useQuery(api.users.viewer);
  const isGodMode = currentUser?.role === "god";

  // Only render (and thus download) admin panel for god users
  if (!isGodMode) return null;

  return <GlobalAdminQuickPanel />;
}
