"use client";

/**
 * Credits Display Component
 * Displays agent credits with progress bar, handling overage and normal states
 */

import { Progress } from "@/vly/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/vly/components/ui/tooltip";
import { TokenIcon } from "./icons";
import { formatCredits } from "@/vly/autumn/helpers";
import { CreditPacksPopover } from "./CreditPacksPopover";

interface CreditsDisplayProps {
  actualCredits: number;
  actualCreditsRemaining: number;
  creditPercentage: number;
  isOrganizationContext: boolean;
}

export function CreditsDisplay({
  actualCredits,
  actualCreditsRemaining,
  creditPercentage,
  isOrganizationContext,
}: CreditsDisplayProps) {
  return (
    <div className="flex-1">
      <div className="mb-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <TokenIcon size="sm" />
          <span className="font-medium">
            {isOrganizationContext ? "Shared Agent Credits" : "Agent Credits"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-gradient-to-r from-purple-600 via-purple-500 to-purple-700 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            {formatCredits(actualCreditsRemaining)}
          </span>
          <CreditPacksPopover />
        </div>
      </div>
      {actualCreditsRemaining > actualCredits ? (
        <TooltipProvider>
          <div className="relative h-2 overflow-hidden rounded-full bg-zinc-200">
            {/* Base plan credits (available, unused state) */}
            <div className="absolute inset-0 h-full w-full bg-zinc-200" />
            {/* Extra credits above plan (pink overlay) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="absolute inset-0 h-full bg-pink-400"
                  style={{
                    width: `${Math.min(((actualCreditsRemaining - actualCredits) / actualCredits) * 100, 100)}%`,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                Extra credits:{" "}
                {formatCredits(actualCreditsRemaining - actualCredits)} above
                your plan limit
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ) : (
        <Progress value={creditPercentage} className="h-2" />
      )}
    </div>
  );
}
