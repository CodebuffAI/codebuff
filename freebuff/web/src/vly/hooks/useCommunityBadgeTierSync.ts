"use client";

import { useEffect, useRef } from "react";
import { useCustomer } from "autumn-js/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Hook to sync community badge tier from Autumn billing to Convex database.
 * This ensures the badge tier is stored in Convex for use in community queries.
 */
export function useCommunityBadgeTierSync() {
  const { customer } = useCustomer();
  const updateBadgeTier = useMutation(api.community.updateCommunityBadgeTier);
  const lastSyncedTier = useRef<number | null>(null);

  useEffect(() => {
    if (!customer?.features) return;

    // Get the community badge tier from Autumn features
    const communityBadgeFeature = (
      customer.features as Record<string, { balance?: number | null }>
    )?.community_badge;
    const badgeTier = communityBadgeFeature?.balance ?? 0;

    // Only update if tier has changed since last sync
    if (lastSyncedTier.current !== badgeTier) {
      lastSyncedTier.current = badgeTier;
      updateBadgeTier({ communityBadgeTier: badgeTier }).catch(console.error);
    }
  }, [customer?.features, updateBadgeTier]);

  // Return the current tier for use in components
  const communityBadgeFeature = (
    customer?.features as Record<string, { balance?: number | null }>
  )?.community_badge;
  return communityBadgeFeature?.balance ?? 0;
}
