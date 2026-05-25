/**
 * Reusable usage accordion component
 * Wraps multiple feature usage rows with collapsible header
 */

import { InfoAccordion } from "./InfoAccordion";
import { FeatureUsageRow } from "./FeatureUsageRow";
import type { CustomerFeature } from "@/lib/billing/types";

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

interface FeatureData {
  featureId: string;
  feature: CustomerFeature | undefined;
}

interface UsageAccordionProps {
  /** Unique accordion value identifier */
  value: string;
  /** Display title */
  title: string;
  /** Description shown in accordion content */
  description: string;
  /** Icon component to show next to title */
  icon: React.ReactNode;
  /** Array of features to display */
  features: FeatureData[];
  /** Function to calculate total overage cost from features array */
  calculateCost: (features: FeatureData[]) => number;
  /** Function to calculate usage percentage - returns either a number or an object with percentage and feature name */
  calculateAverage: (
    features: FeatureData[],
  ) => number | { percentage: number; featureName: string };
  /** TopUpButton component to pass to feature rows */
  TopUpButton: React.ComponentType<TopUpButtonProps>;
  /** CheckoutDialog component to pass to TopUpButton */
  checkoutDialog: any;
}

export function UsageAccordion({
  value,
  title,
  description,
  icon,
  features,
  calculateCost,
  calculateAverage,
  TopUpButton,
  checkoutDialog,
}: UsageAccordionProps) {
  const totalCost = calculateCost(features);
  const usageResult = calculateAverage(features);

  // Handle both number and object return types
  const isUsageObject = typeof usageResult === "object" && usageResult !== null;
  const usagePercentage = isUsageObject ? usageResult.percentage : usageResult;
  const featureName = isUsageObject ? usageResult.featureName : undefined;

  const summary =
    totalCost > 0 ? (
      <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
        ${totalCost.toFixed(2)}
      </span>
    ) : (
      <span className="text-xs font-medium text-zinc-600">
        {featureName
          ? `${usagePercentage.toFixed(0)}% of ${featureName} used`
          : `${usagePercentage.toFixed(0)}% used`}
      </span>
    );

  return (
    <InfoAccordion
      value={value}
      title={title}
      description={description}
      icon={icon}
      summary={summary}
    >
      <div className="flex-1 space-y-0 divide-y divide-zinc-200/50">
        {features.map((featureData, idx) => (
          <FeatureUsageRow
            key={featureData.featureId}
            featureId={featureData.featureId}
            feature={featureData.feature}
            TopUpButton={TopUpButton}
            checkoutDialog={checkoutDialog}
            isFirst={idx === 0}
            isLast={idx === features.length - 1}
          />
        ))}
      </div>
    </InfoAccordion>
  );
}
