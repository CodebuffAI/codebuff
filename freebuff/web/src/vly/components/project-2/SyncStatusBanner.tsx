"use client";

import { useEffect, useState } from "react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Clock, GitBranch } from "lucide-react";

type SyncStatus = FunctionReturnType<
  typeof api.github.repositories.getProjectSyncStatus
>;

interface SyncStatusBannerProps {
  syncStatus: SyncStatus | undefined;
  activeView?: "default" | string;
  onFixConflictClick?: () => void;
}

export function SyncStatusBanner({
  syncStatus,
  activeView = "default",
  onFixConflictClick,
}: SyncStatusBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!syncStatus) {
      setIsVisible(false);
      return;
    }

    const status = syncStatus.sync_status;

    // Reset dismissed state when sync status changes to pending, error, or conflict
    if (status === "pending" || status === "error" || status === "conflict") {
      setIsDismissed(false);
      setIsVisible(true);
    } else if (status === "synced" && !isDismissed) {
      setIsVisible(true);
      // Auto-dismiss success message after 3 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [syncStatus?.sync_status, syncStatus?.error_message, isDismissed]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
  };

  if (!syncStatus) {
    return null;
  }

  const status = syncStatus.sync_status;

  const getStatusConfig = () => {
    switch (status) {
      case "pending":
        return {
          icon: <Clock className="h-4 w-4 animate-pulse" />,
          message: "Syncing with GitHub...",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          textColor: "text-yellow-800",
          iconColor: "text-yellow-600",
        };
      case "synced":
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          message: "Successfully synced with GitHub",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          textColor: "text-green-800",
          iconColor: "text-green-600",
        };
      case "error":
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          message: syncStatus.error_message
            ? `Sync failed: ${syncStatus.error_message}`
            : "Sync failed",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          textColor: "text-red-800",
          iconColor: "text-red-600",
        };
      case "conflict":
        return {
          icon: <GitBranch className="h-4 w-4" />,
          message: "Merge conflicts detected - manual resolution required",
          bgColor: "bg-orange-50",
          borderColor: "border-orange-200",
          textColor: "text-orange-800",
          iconColor: "text-orange-600",
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              type: "spring",
              stiffness: 300,
              damping: 30,
            },
          }}
          exit={{
            opacity: 0,
            y: -50,
            transition: {
              duration: 0.3,
              ease: [0.4, 0.0, 0.2, 1],
            },
          }}
          className={`fixed left-0 right-0 top-[36px] z-40 mx-4 mt-2 rounded-lg border ${config.bgColor} ${config.borderColor} p-3 shadow-sm backdrop-blur-sm`}
          style={{
            marginLeft: "204px", // Account for left sidebar width
            marginRight: activeView === "default" ? "504px" : "0px", // Account for chat sidebar width only in default view
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={config.iconColor}>{config.icon}</div>
              <span className={`text-sm font-medium ${config.textColor}`}>
                {config.message}
              </span>
              {(status === "conflict" || status === "error") &&
                onFixConflictClick && (
                  <button
                    type="button"
                    onClick={onFixConflictClick}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${config.borderColor} ${config.textColor} hover:bg-white/70`}
                  >
                    {status === "conflict"
                      ? "Click here to fix merge conflict"
                      : "Click here to fix GitHub sync"}
                  </button>
                )}
            </div>

            {status !== "pending" && (
              <motion.button
                onClick={handleDismiss}
                className={`${config.textColor} transition-opacity hover:opacity-70`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
