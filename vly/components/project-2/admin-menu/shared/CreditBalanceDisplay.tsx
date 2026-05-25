import { Badge } from "@/components/ui/badge";
import { Infinity } from "lucide-react";
import { CreditBalance } from "../types";
import { formatBalanceCompact, formatBalanceDetailed } from "../utils";
import { CREDIT_NAME_ABBREVIATIONS, CREDIT_UNITS } from "../constants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { calculatePlatformCost, formatCost } from "@/lib/billing";

interface CreditBalanceDisplayProps {
  balance: CreditBalance;
  showCost?: boolean;
}

export function CreditBalanceDisplay({
  balance,
  showCost = false,
}: CreditBalanceDisplayProps) {
  const abbreviatedName =
    CREDIT_NAME_ABBREVIATIONS[balance.featureId] || balance.name;
  const unit = CREDIT_UNITS[balance.featureId];
  const isUnlimited = balance.unlimited || balance.balance === "unlimited";

  const cost =
    showCost && typeof balance.balance === "number"
      ? calculatePlatformCost(balance.featureId, balance.balance)
      : 0;

  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white p-2.5 transition-all hover:border-zinc-300 hover:shadow-sm">
      <div className="flex flex-col">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs font-medium text-zinc-700">
                {abbreviatedName}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{balance.name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {balance.used !== undefined && !isUnlimited && (
          <span className="text-[10px] text-zinc-500">
            Used: {formatBalanceCompact(balance.used)} {unit || ""}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {isUnlimited ? (
          <Badge className="flex items-center gap-1 border-purple-200 bg-purple-50 text-purple-700">
            <Infinity className="h-3 w-3" />
            Unlimited
          </Badge>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-sm font-semibold text-zinc-900">
                  {formatBalanceCompact(balance.balance)}
                  {unit && (
                    <span className="ml-1 text-xs font-normal text-zinc-500">
                      {unit}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono">
                  {formatBalanceDetailed(balance.balance)} {unit || ""}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {showCost && cost > 0 && (
          <span className="text-[10px] text-zinc-500">${formatCost(cost)}</span>
        )}
      </div>
    </div>
  );
}
