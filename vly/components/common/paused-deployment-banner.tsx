/* eslint-disable react-hooks/preserve-manual-memoization */
"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, X } from "lucide-react";
import { useCustomer } from "autumn-js/react";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import CheckoutDialog from "@/components/autumn/checkout-dialog";

// Map pause reasons to human-readable messages
const PAUSE_REASON_LABELS: Record<string, string> = {
  db_bandwidth_depleted: "Database bandwidth limit reached",
  compute_depleted: "Compute limit reached",
  db_storage_depleted: "Database storage limit reached",
  file_bandwidth_depleted: "File bandwidth limit reached",
  function_calls_depleted: "Function calls limit reached",
  manual_admin: "Manually paused by administrator",
};

// Map pause reasons to product pack options
const PAUSE_REASON_PACKS: Record<
  string,
  Array<{ id: string; label: string; amount: string; price: string }>
> = {
  db_bandwidth_depleted: [
    {
      id: "convex_database_bw_pack_small",
      label: "Small",
      amount: "10 GB",
      price: "$2",
    },
    {
      id: "convex_database_bw_pack_medium",
      label: "Medium",
      amount: "25 GB",
      price: "$4",
    },
    {
      id: "convex_database_bw_pack_large",
      label: "Large",
      amount: "50 GB",
      price: "$7",
    },
  ],
  compute_depleted: [
    {
      id: "convex_compute_pack_small",
      label: "Small",
      amount: "10 GB-h",
      price: "$3",
    },
    {
      id: "convex_compute_pack_medium",
      label: "Medium",
      amount: "25 GB-h",
      price: "$6",
    },
    {
      id: "convex_compute_pack_large",
      label: "Large",
      amount: "50 GB-h",
      price: "$10",
    },
  ],
  file_bandwidth_depleted: [
    {
      id: "convex_file_bw_pack_small",
      label: "Small",
      amount: "10 GB",
      price: "$3",
    },
    {
      id: "convex_file_bw_pack_medium",
      label: "Medium",
      amount: "25 GB",
      price: "$6",
    },
    {
      id: "convex_file_bw_pack_large",
      label: "Large",
      amount: "50 GB",
      price: "$10",
    },
  ],
  function_calls_depleted: [
    {
      id: "convex_function_calls_pack_small",
      label: "Small",
      amount: "1M calls",
      price: "$2",
    },
    {
      id: "convex_function_calls_pack_medium",
      label: "Medium",
      amount: "5M calls",
      price: "$8",
    },
    {
      id: "convex_function_calls_pack_large",
      label: "Large",
      amount: "10M calls",
      price: "$15",
    },
  ],
};

export function PausedDeploymentBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const viewer = useQuery(api.users.viewer);
  const pauseRecord = useQuery(
    api.deployment_queries.getCurrentUserPauseStatus,
  );
  const { checkout, customer } = useCustomer();
  const viewerLoading = viewer === undefined;
  const isPlatformAdmin = viewer?.role === "god" || viewer?.role === "admin";

  // Use state for current time to avoid calling impure Date.now() during render
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Update current time periodically for time ago display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Format time ago with special handling for very recent pauses
  const timeAgo = useMemo(() => {
    if (!pauseRecord?.pausedAt) return "";

    const pausedTime = new Date(pauseRecord.pausedAt).getTime();
    const diffInSeconds = (currentTime - pausedTime) / 1000;

    // If less than 60 seconds, show "Less than a minute ago"
    if (diffInSeconds < 60) {
      return "Less than a minute ago";
    }

    return formatDistanceToNow(new Date(pauseRecord.pausedAt), {
      addSuffix: true,
    });
  }, [pauseRecord?.pausedAt, currentTime]);

  // Don't show if dismissed, no pause record, or still loading
  if (
    dismissed ||
    viewerLoading ||
    isPlatformAdmin ||
    pauseRecord === null ||
    pauseRecord === undefined
  ) {
    return null;
  }

  const pauseReasonLabel =
    PAUSE_REASON_LABELS[pauseRecord.pauseReason] || "Resource limit reached";

  // Get reset time for resource-based pauses
  const getResetInfo = () => {
    if (!customer?.features || pauseRecord.pauseReason === "manual_admin") {
      return null;
    }

    // Map pause reasons to feature IDs
    const featureMap: Record<string, string> = {
      db_bandwidth_depleted: "convex_database_bw",
      compute_depleted: "convex_compute",
      db_storage_depleted: "convex_database_storage",
      file_bandwidth_depleted: "convex_file_bw",
      function_calls_depleted: "convex_function_calls",
    };

    const featureId = featureMap[pauseRecord.pauseReason];
    if (!featureId) return null;

    const feature = (customer.features as any)?.[featureId];
    if (!feature?.next_reset_at) return null;

    const resetDate = new Date(feature.next_reset_at);
    return resetDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const resetInfo = getResetInfo();

  const handleAddCredits = async (productId: string) => {
    setPopoverOpen(false);
    try {
      await checkout({
        productId,
        dialog: CheckoutDialog,
        successUrl: `${window.location.origin}/dashboard`,
      });
      // Note: Unpause logic now happens in CheckoutDialog after payment confirmation
    } catch (error) {
      console.error("Checkout error:", error);
    }
  };

  // Get available packs for the current pause reason
  const availablePacks =
    PAUSE_REASON_PACKS[pauseRecord?.pauseReason || ""] || [];

  return (
    <div className="duration-300 animate-in slide-in-from-top-5">
      <Alert variant="warning" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <button
          className="absolute right-3 top-3 text-amber-600 transition-colors hover:text-amber-800"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
        <AlertTitle className="pr-6">Your deployments are paused</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-amber-800">
            <span className="font-medium">{pauseReasonLabel}</span>
            {timeAgo && (
              <span className="ml-2 text-xs text-amber-700">({timeAgo})</span>
            )}
            <p className="mt-1 text-xs text-amber-700">
              Add credits to restore your services in under a minute
            </p>
            {resetInfo && (
              <p className="mt-1 text-xs text-amber-600">
                Limit resets: {resetInfo}
              </p>
            )}
          </div>
          {availablePacks.length > 0 ? (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  className="whitespace-nowrap border-purple-700 bg-purple-600 text-white hover:bg-purple-700"
                >
                  Add Credits
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-zinc-900">
                    Choose Pack Size
                  </h4>
                  <div className="space-y-2">
                    {availablePacks.map((pack) => (
                      <button
                        key={pack.id}
                        onClick={() => handleAddCredits(pack.id)}
                        className="group flex w-full items-center justify-between rounded-lg border border-purple-200/40 bg-gradient-to-r from-purple-50/60 to-white/60 p-3 text-left transition-all hover:border-purple-300/60 hover:from-purple-100/80 hover:to-purple-50/80 hover:shadow-sm active:scale-[0.98]"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-zinc-900">
                            {pack.label}
                          </div>
                          <div className="text-xs text-zinc-600">
                            {pack.amount}
                          </div>
                        </div>
                        <div className="ml-3 text-sm font-bold text-purple-700">
                          {pack.price}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              size="sm"
              className="whitespace-nowrap border-purple-700 bg-purple-600 text-white hover:bg-purple-700"
              disabled={true}
            >
              Contact Support
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
