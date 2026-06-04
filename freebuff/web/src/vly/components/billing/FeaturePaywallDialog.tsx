"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { UpgradePrompt } from "./FeatureGate";
import { BooleanFeatureId } from "@/vly/autumn/constants";

interface FeaturePaywallDialogProps {
  featureId: BooleanFeatureId;
  requiredPlan:
    | "Starter"
    | "Hobby"
    | "Business"
    | "Scale"
    | "Priority"
    | "Ultra"
    | "Max"
    | "Unlimited";
  message?: string;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Reusable paywall dialog component for feature gating
 * Similar to the chat bump paywall - shows upgrade button at the top
 */
export function FeaturePaywallDialog({
  featureId,
  requiredPlan,
  message,
  title,
  open,
  onOpenChange,
}: FeaturePaywallDialogProps) {
  const defaultTitle =
    title || `Unlock ${featureId.replace(/_/g, " ")} with ${requiredPlan} Plan`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{defaultTitle}</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <UpgradePrompt
            featureId={featureId}
            requiredPlan={requiredPlan}
            message={message}
            showUpgradeButton={true}
            hideTitle={true}
            borderless={true}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
