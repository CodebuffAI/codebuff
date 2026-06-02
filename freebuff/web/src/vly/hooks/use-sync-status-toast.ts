"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

type SyncStatus = FunctionReturnType<
  typeof api.github.repositories.getProjectSyncStatus
>;

interface UseSyncStatusToastOptions {
  /**
   * Whether to show toasts for all status changes or only when explicitly triggered
   * @default "auto" - Shows toasts automatically for all status changes
   */
  mode?: "auto" | "manual";
  /**
   * Custom messages for different sync states
   */
  messages?: {
    pending?: string;
    synced?: string;
    error?: (errorMessage?: string) => string;
    conflict?: string;
  };
}

const TOAST_ID = "github-sync-status";

// Global state to prevent multiple instances - Sonner returns toast ID
let globalToastId: string | number | null = null;

const defaultMessages = {
  pending: "Syncing with GitHub...",
  synced: "Successfully synced with GitHub",
  error: (errorMessage?: string) =>
    errorMessage ? `Sync failed: ${errorMessage}` : "Sync failed",
  conflict: "Merge conflicts detected - manual resolution required",
};

/**
 * Custom hook to manage GitHub sync status toasts
 * Provides a non-spammy, user-friendly way to show sync status updates
 */
export function useSyncStatusToast(
  syncStatus: SyncStatus | undefined,
  options: UseSyncStatusToastOptions = {},
) {
  const { mode = "auto", messages = {} } = options;

  // Merge custom messages with defaults
  const finalMessages = { ...defaultMessages, ...messages };

  const previousStatusRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      // Clean up on unmount
      if (globalToastId) {
        toast.dismiss(globalToastId);
        globalToastId = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!syncStatus || mode === "manual" || !mountedRef.current) return;

    const currentStatus = syncStatus.sync_status;
    const previousStatus = previousStatusRef.current;

    console.log("🔄 Sync status:", { currentStatus, previousStatus });

    // Skip on initial mount if already synced (don't show success toast on page load)
    if (previousStatus === null && currentStatus === "synced") {
      previousStatusRef.current = currentStatus;
      return;
    }

    // Skip if status hasn't actually changed
    if (currentStatus === previousStatus) {
      return;
    }

    // Update previous status
    previousStatusRef.current = currentStatus;

    // Always dismiss existing toast first
    if (globalToastId) {
      toast.dismiss(globalToastId);
      globalToastId = null;
    }

    // React directly to the current status
    switch (currentStatus) {
      case "pending":
        globalToastId = toast.loading("🔄 " + finalMessages.pending, {
          duration: Infinity,
        });
        break;

      case "synced":
        globalToastId = toast.success("✅ " + finalMessages.synced, {
          duration: 3000,
        });
        // Clear reference after auto-dismiss
        setTimeout(() => {
          if (mountedRef.current) {
            globalToastId = null;
          }
        }, 3100);
        break;

      case "error":
        const errorMessage = finalMessages.error(syncStatus.error_message);
        globalToastId = toast.error("❌ " + errorMessage, {
          duration: Infinity,
        });
        break;

      case "conflict":
        globalToastId = toast.warning("⚠️ " + finalMessages.conflict, {
          duration: Infinity,
        });
        break;

      default:
        // No toast for unknown status
        break;
    }
  }, [syncStatus?.sync_status, syncStatus?.error_message, mode, finalMessages]);

  // Manual toast functions for when mode is "manual"
  const showSyncToast = (
    status: "pending" | "synced" | "error" | "conflict",
    errorMessage?: string,
  ) => {
    // Dismiss existing toast if any
    if (globalToastId) {
      toast.dismiss(globalToastId);
    }

    // Create new toast based on status
    switch (status) {
      case "pending":
        globalToastId = toast.loading("🔄 " + finalMessages.pending, {
          id: TOAST_ID,
          duration: Infinity,
        });
        break;
      case "synced":
        globalToastId = toast.success("✅ " + finalMessages.synced, {
          id: TOAST_ID,
          duration: 3000,
        });
        setTimeout(() => {
          globalToastId = null;
        }, 3100);
        break;
      case "error":
        globalToastId = toast.error("❌ " + finalMessages.error(errorMessage), {
          id: TOAST_ID,
          duration: Infinity,
        });
        break;
      case "conflict":
        globalToastId = toast.warning("⚠️ " + finalMessages.conflict, {
          id: TOAST_ID,
          duration: Infinity,
        });
        break;
    }
  };

  const dismissSyncToast = () => {
    if (globalToastId) {
      toast.dismiss(globalToastId);
      globalToastId = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (globalToastId) {
        toast.dismiss(globalToastId);
        globalToastId = null;
      }
    };
  }, []);

  return {
    showSyncToast,
    dismissSyncToast,
  };
}
