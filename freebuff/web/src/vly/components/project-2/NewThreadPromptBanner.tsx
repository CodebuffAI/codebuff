"use client";

import { MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/vly/components/ui/button";

interface NewThreadPromptBannerProps {
  onCreateThread: () => void;
  onDismiss: () => void;
}

/**
 * Compact banner that prompts users to create a new thread
 * to reduce costs when thread has many messages
 */
export function NewThreadPromptBanner({
  onCreateThread,
  onDismiss,
}: NewThreadPromptBannerProps) {
  return (
    <div className="mx-4 mb-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MessageSquarePlus className="h-3.5 w-3.5 text-gray-600" />
          <span className="text-xs font-medium text-gray-700">
            Start a new thread to reduce costs
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={onCreateThread}
            size="sm"
            variant="outline"
            className="h-6 border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-100"
          >
            New Thread
          </Button>
          <button
            onClick={onDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
