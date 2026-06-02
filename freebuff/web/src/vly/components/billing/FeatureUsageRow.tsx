/**
 * Reusable feature usage row component
 * Displays feature icon, balance, progress, and top-up button
 */

import { Progress } from "@/vly/components/ui/progress";
import {
  getFeatureConfig,
  formatFeatureValue,
  getPacksByFeatureId,
  type CustomerFeature,
} from "@/vly/lib/billing";
import { cn } from "@/vly/lib/utils";

interface TopUpButtonProps {
  packOptions: Array<{
    id: string;
    label: string;
    amount: string;
    price: string;
  }>;
  disabled?: boolean;
  checkoutDialog: any;
}

interface FeatureUsageRowProps {
  featureId: string;
  feature: CustomerFeature | undefined;
  TopUpButton: React.ComponentType<TopUpButtonProps>;
  checkoutDialog: any;
  isFirst?: boolean;
  isLast?: boolean;
}

export function FeatureUsageRow({
  featureId,
  feature,
  TopUpButton,
  checkoutDialog,
  isFirst = false,
  isLast = false,
}: FeatureUsageRowProps) {
  const config = getFeatureConfig(featureId);

  if (!config) {
    console.warn(`No configuration found for feature: ${featureId}`);
    return null;
  }

  const Icon = config.icon;
  const balance = feature?.balance || 0;
  const usage = feature?.usage || 0;
  const includedUsage =
    feature?.unlimited === true || feature?.included_usage === "inf"
      ? Number.MAX_SAFE_INTEGER
      : feature?.included_usage || 0;
  const nextResetAt = feature?.next_reset_at;

  // In Autumn's system:
  // - balance = total available (remaining after consumption, includes base plan + add-ons)
  // - included_usage = base plan quota
  // - usage = delta/change in usage (not total consumed)
  // Therefore, to get the consumed amount:
  // consumed = included_usage - balance (this works correctly with add-ons since balance reflects remaining)
  const usedAmount = Math.max(0, includedUsage - balance);

  const formattedBalance = formatFeatureValue(featureId, balance);
  const formattedUsage = formatFeatureValue(featureId, usedAmount);
  const unit = config.unitPlural || config.unit;

  // Check if formatted values already include units (e.g., "10.24 MB")
  const balanceHasUnit = formattedBalance.includes(" ");
  const usageHasUnit = formattedUsage.includes(" ");

  const usagePercentage =
    includedUsage > 0 ? (usedAmount / includedUsage) * 100 : 0;

  return (
    <div
      className={cn(
        "space-y-2 py-3",
        isFirst && "first:pt-0",
        isLast && "last:pb-0",
      )}
    >
      {/* Header with icon, name, balance, and top-up button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-purple-400/60" />
          <span className="text-sm font-medium">{config.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-gradient-to-r from-purple-600 to-purple-700 bg-clip-text text-sm font-bold text-transparent">
            {formattedBalance}
            {balanceHasUnit ? "" : ` ${unit}`}
          </span>
          <TopUpButton
            packOptions={getPacksByFeatureId(featureId)}
            checkoutDialog={checkoutDialog}
          />
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={usagePercentage} className="h-2" />

      {/* Usage stats and reset date */}
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span>
          Used: {formattedUsage}
          {usageHasUnit ? "" : ` ${unit}`}
        </span>
        {nextResetAt && (
          <span>
            Resets:{" "}
            {new Date(nextResetAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
