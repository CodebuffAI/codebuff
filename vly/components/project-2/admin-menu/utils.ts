import { freePlan } from "@/autumn.config";
import { PAUSE_REASON_LABELS } from "./constants";

export function formatBalanceCompact(
  balance: number | string | undefined,
): string {
  if (typeof balance !== "number") return "0";
  if (balance >= 1000000) {
    return `${(balance / 1000000).toFixed(balance % 1000000 === 0 ? 0 : 2)}M`;
  }
  // For values < 1M, show as decimal of millions for agent credits
  // Keep "K" formatting only for very small values (< 1000)
  if (balance >= 1000) {
    const millions = balance / 1000000;
    const formatted = millions.toFixed(millions % 1 === 0 ? 0 : 3);
    return `${formatted.replace(/\.?0+$/, "")}M`;
  }
  return balance.toFixed(balance % 1 === 0 ? 0 : 2);
}

export function formatBalanceDetailed(
  balance: number | string | undefined,
): string {
  if (typeof balance !== "number") return "0";
  return balance.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

export function getFreePlanDefaults(): Record<string, number> {
  const defaults: Record<string, number> = {};
  freePlan.items.forEach((item) => {
    if (
      "feature_id" in item &&
      item.feature_id != null &&
      "included_usage" in item &&
      typeof item.included_usage === "number"
    ) {
      defaults[item.feature_id] = item.included_usage;
    }
  });
  return defaults;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatPauseReason(reason: string): string {
  return PAUSE_REASON_LABELS[reason] || reason;
}

export function calculatePlatformCostEstimate(stats: any): {
  monthlyCost: number;
  dailyCost: number;
} {
  // Placeholder for cost calculation logic
  // This would integrate with the billing cost calculation system
  return {
    monthlyCost: 0,
    dailyCost: 0,
  };
}
