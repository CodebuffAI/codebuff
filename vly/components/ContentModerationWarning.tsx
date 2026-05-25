"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ModerationCategory } from "@/hooks/useContentModeration";

const CATEGORY_DESCRIPTIONS: Record<ModerationCategory, string> = {
  crypto: "Cryptocurrency, blockchain, or Web3 projects",
  stock_market: "Stock market or trading software",
  constant_monitoring:
    "Software requiring constant monitoring (bots, scrapers, automated systems)",
  high_resource: "High database bandwidth or compute-intensive applications",
};

const CATEGORY_ICONS: Record<ModerationCategory, string> = {
  crypto: "🪙",
  stock_market: "📈",
  constant_monitoring: "🔄",
  high_resource: "⚡",
};

interface ContentModerationWarningProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ModerationCategory[];
}

export default function ContentModerationWarning({
  isOpen,
  onClose,
  categories,
}: ContentModerationWarningProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md border-amber-200 bg-amber-50">
        <AlertDialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-xl text-amber-900">
              Project Type Not Supported
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-amber-800">
              <p>
                Your project description involves restricted categories that our
                platform doesn&apos;t support:
              </p>

              <ul className="space-y-2">
                {categories.map((category) => (
                  <li
                    key={category}
                    className="flex items-start gap-2 rounded-lg bg-amber-100/50 p-3"
                  >
                    <span className="text-lg">{CATEGORY_ICONS[category]}</span>
                    <span className="text-sm font-medium">
                      {CATEGORY_DESCRIPTIONS[category]}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="rounded-lg border border-amber-300 bg-white/50 p-3 text-sm">
                <p className="font-medium text-amber-900">
                  Why these restrictions?
                </p>
                <p className="mt-1 text-amber-700">
                  These project types require specialized infrastructure,
                  regulatory compliance, or continuous server resources that our
                  platform isn&apos;t designed to handle.
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel
            onClick={onClose}
            className="w-full border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
          >
            Modify Description
          </AlertDialogCancel>
        </AlertDialogFooter>

        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-amber-600 hover:bg-amber-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </AlertDialogContent>
    </AlertDialog>
  );
}
