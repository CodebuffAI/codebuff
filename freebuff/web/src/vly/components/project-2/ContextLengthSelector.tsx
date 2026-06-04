"use client";

import React, { useState } from "react";
import {
  CONTEXT_LENGTH_PRESETS,
  DEFAULT_CONTEXT_LENGTH,
  type ContextLength,
} from "@/vly/lib/coding-agent/contextLengthPresets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/vly/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { FeaturePaywallDialog } from "@/vly/components/billing/FeaturePaywallDialog";
import { useFeatureAccess } from "@/vly/hooks/useFeatureAccess";

export type { ContextLength };

interface ContextLengthConfig {
  id: ContextLength;
  label: string;
  description: string;
  requiresUpgrade?: boolean;
  badge?: string;
}

const CONTEXT_LENGTHS: ContextLengthConfig[] = [
  {
    id: "small",
    label: CONTEXT_LENGTH_PRESETS.small.label,
    description: CONTEXT_LENGTH_PRESETS.small.description,
  },
  {
    id: "medium",
    label: CONTEXT_LENGTH_PRESETS.medium.label,
    description: CONTEXT_LENGTH_PRESETS.medium.description,
  },
  {
    id: "long",
    label: CONTEXT_LENGTH_PRESETS.long.label,
    description: CONTEXT_LENGTH_PRESETS.long.description,
    requiresUpgrade: true,
    badge: "Hobby",
  },
];

interface ContextLengthSelectorProps {
  selectedLength: ContextLength;
  onLengthChange: (length: ContextLength) => void;
  disabled?: boolean;
}

export function ContextLengthSelector({
  selectedLength,
  onLengthChange,
  disabled = false,
}: ContextLengthSelectorProps) {
  const [showPaywall, setShowPaywall] = useState(false);
  const { hasAccess } = useFeatureAccess("agent_context_length");
  const currentLength =
    CONTEXT_LENGTHS.find((l) => l.id === selectedLength) ||
    CONTEXT_LENGTHS.find((l) => l.id === DEFAULT_CONTEXT_LENGTH) ||
    CONTEXT_LENGTHS[0];

  const handleLengthChange = (length: ContextLength) => {
    const lengthConfig = CONTEXT_LENGTHS.find((l) => l.id === length);

    // Check if this length requires upgrade and user doesn't have access
    if (lengthConfig?.requiresUpgrade && !hasAccess) {
      setShowPaywall(true);
      return;
    }

    onLengthChange(length);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-zinc-500 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <span>{currentLength.label}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[260px] border-gray-200 bg-white shadow-lg dark:border-[#575757] dark:bg-[#282828]"
        >
          <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-zinc-400">
            Context Length
            <span className="ml-1 text-[10px] text-gray-400 dark:text-zinc-500">
              (shorter is cheaper and compacts sooner)
            </span>
          </div>
          {CONTEXT_LENGTHS.map((length) => {
            const badge =
              length.id === DEFAULT_CONTEXT_LENGTH ? "Default" : length.badge;

            return (
              <DropdownMenuItem
                key={length.id}
                onClick={() => handleLengthChange(length.id)}
                className={`flex cursor-pointer flex-col items-start gap-1 p-3 ${
                  selectedLength === length.id
                    ? "bg-blue-50 text-blue-900 dark:bg-[#3c3c3c] dark:text-zinc-100"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-zinc-300 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100"
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="font-medium">{length.label} Context</span>
                  {badge && (
                    <span className="ml-auto rounded-full border border-blue-200 bg-blue-100 px-1.5 py-0 text-[10px] font-medium text-blue-700 dark:border-[#666666] dark:bg-[#3c3c3c] dark:text-zinc-200">
                      {badge}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-zinc-400">
                  {length.description}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <FeaturePaywallDialog
        featureId="agent_context_length"
        requiredPlan="Hobby"
        message="Long context is available on Hobby plan and above. Upgrade to unlock it."
        title="Unlock Extended Context Length"
        open={showPaywall}
        onOpenChange={setShowPaywall}
      />
    </>
  );
}
