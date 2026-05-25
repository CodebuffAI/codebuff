import React, { useCallback, useRef } from "react";

import { useCustomer, usePricingTable, ProductDetails } from "autumn-js/react";
import { createContext, useContext, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import CheckoutDialog from "@/components/autumn/checkout-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignInButton } from "@/components/auth/AuthComponents";
import { getPricingTableContent } from "@/lib/autumn/pricing-table-content";
import type { Product, ProductItem } from "autumn-js";
import { Loader2, Crown, Coins, Check, Box, ChevronDown } from "lucide-react";
import { PricingTableSkeleton } from "@/components/billing/BillingSkeleton";
import { VlyCoin } from "@/components/ui/vly-coin";
import { CommunityBadge } from "@/components/community/CommunityBadge";
import {
  filterProductsByInterval,
  separateProductsByType,
  getActivePlan,
} from "@/lib/billing";
import { useDirectPlanCheckout } from "@/hooks/useDirectPlanCheckout";
import {
  createCheckoutHandler,
  createDirectPlanCheckoutHandler,
} from "@/lib/billing";
import { ConvexIcon } from "@/components/billing/icons";
import {
  DowngradeCancelDialog,
  type DowngradeCancelAction,
} from "@/components/billing/DowngradeCancelDialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import {
  getProductIcon,
  getProductColorClasses,
  getProductButtonHoverClasses,
} from "@/lib/billing";
import { formatCredits } from "@/autumn/helpers";
import {
  PLAN_PRICES,
  ORIGINAL_PRICES,
  PLAN_BASE_CREDITS,
  FREE_TIER_CREDITS,
  TIER_LIMITS,
  BOOLEAN_FEATURES,
  FEATURE_DISPLAY_NAMES,
  TIER_HIGHLIGHTS,
} from "@/autumn/constants";

/**
 * Maps base plan IDs to their legacy custom plan variants
 * Used to check if a user is on a legacy custom plan when showing the base plan card
 *
 * NOTE: The new tier system uses simple plan IDs (hobby_plan, business_plan, etc.)
 * This mapping is kept for backwards compatibility with users who subscribed
 * before the plan system was simplified.
 */
function getCustomPlanIdLocal(basePlanId: string): string | null {
  const planMapping: Record<string, string> = {
    // New plans map to legacy custom plan variants for backwards compatibility
    starter_plan: "starter_plan",
    hobby_plan: "hobby_custom_plan",
    business_plan: "pro_custom_plan",
    scale_plan: "scale_plan",
    priority_plan: "priority_plan",
    ultra_plan: "ultra_plan",
    max_plan: "max_plan",
    unlimited_plan: "unlimited_plan",
    // Legacy custom plans map to themselves
    hobby_custom_plan: "hobby_plan",
    pro_custom_plan: "business_plan",
    pro_plan: "business_plan",
    team_plan: "scale_plan",
    team_custom_plan: "scale_plan",
    enterprise_plan: "enterprise_plan",
    enterprise_custom_plan: "enterprise_plan",
  };
  return planMapping[basePlanId] || null;
}

/**
 * Checks if the customer has the given plan or its custom variant active
 */
function isCustomerOnPlan(customer: any, planId: string): boolean {
  if (!customer?.products) return false;

  const { planId: activePlanId } = getActivePlan(
    customer.products,
    customer,
    "free_plan",
  );

  const customPlanId = getCustomPlanIdLocal(planId);

  return (
    activePlanId === planId || !!(customPlanId && activePlanId === customPlanId)
  );
}

const PLAN_COMMUNITY_BADGE_TIERS: Record<string, number> = {
  free_plan: TIER_LIMITS.free.communityBadgeTier,
  starter_plan: TIER_LIMITS.starter.communityBadgeTier,
  hobby_plan: TIER_LIMITS.hobby.communityBadgeTier,
  business_plan: TIER_LIMITS.business.communityBadgeTier,
  scale_plan: TIER_LIMITS.scale.communityBadgeTier,
  priority_plan: TIER_LIMITS.priority.communityBadgeTier,
  ultra_plan: TIER_LIMITS.ultra.communityBadgeTier,
  max_plan: TIER_LIMITS.max.communityBadgeTier,
  unlimited_plan: TIER_LIMITS.unlimited.communityBadgeTier,
  enterprise_plan: TIER_LIMITS.enterprise.communityBadgeTier,
  // Legacy mappings
  hobby_custom_plan: TIER_LIMITS.hobby.communityBadgeTier,
  pro_custom_plan: TIER_LIMITS.business.communityBadgeTier,
  pro_plan: TIER_LIMITS.business.communityBadgeTier,
  team_plan: TIER_LIMITS.scale.communityBadgeTier,
  team_custom_plan: TIER_LIMITS.scale.communityBadgeTier,
  enterprise_custom_plan: TIER_LIMITS.enterprise.communityBadgeTier,
};

function getCommunityBadgeTierForPlan(planId: string): number {
  return PLAN_COMMUNITY_BADGE_TIERS[planId] ?? 0;
}

// Free Plan Banner Component
function FreePlanBanner({
  customer,
  isOnFreePlan,
  onDowngradeToFree,
}: {
  customer: any;
  isOnFreePlan: boolean;
  onDowngradeToFree: () => void;
}) {
  // Use useState with lazy initializer to store timestamp once, avoiding impure function call during render
  const [now] = useState(() => Date.now());

  // Check if user has a pending cancellation (scheduled downgrade to Free)
  const canceledProduct = (customer as any)?.products?.find(
    (p: any) =>
      p.canceled_at &&
      p.current_period_end &&
      !p.is_add_on &&
      now < p.current_period_end,
  );
  const hasPendingCancellation = !!canceledProduct;
  const downgradeDate = canceledProduct?.current_period_end
    ? new Date(canceledProduct.current_period_end).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="mb-6 w-full rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side - Plan info */}
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">Free Plan</h3>
              {isOnFreePlan && (
                <span className="rounded-full border border-[#4285F4]/60 bg-[#EAF2FF] px-2 py-0.5 text-xs font-semibold text-[#1557b0] shadow-sm">
                  Current Plan
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">
              Get started with basic features
            </p>
          </div>
        </div>

        {/* Center - Stats */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-1.5">
            <VlyCoin size="sm" />
            <span className="text-sm font-medium text-gray-700">
              {formatCredits(FREE_TIER_CREDITS.amount)} credits
            </span>
            <span className="text-xs text-gray-500">(one-time)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-sm text-gray-600">
              {TIER_LIMITS.free.maxProjects} projects
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-sm text-gray-600">Small sandboxes only</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-sm text-gray-600">No community badge</span>
          </div>
        </div>

        {/* Right side - Action */}
        <div className="flex flex-shrink-0 flex-col items-end">
          {isOnFreePlan ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500">
              Active
            </div>
          ) : hasPendingCancellation ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="cursor-not-allowed border-gray-200 text-gray-400"
              >
                Downgrade Scheduled
              </Button>
              {downgradeDate && (
                <p className="mt-1 text-xs text-gray-500">
                  Downgrading on {downgradeDate}
                </p>
              )}
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onDowngradeToFree}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Downgrade to Free
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PricingTable({
  productDetails,
  showOnlyPlans = false,
  showOnlyAddons = false,
}: {
  productDetails?: ProductDetails[];
  showOnlyPlans?: boolean;
  showOnlyAddons?: boolean;
}) {
  const { customer, checkout } = useCustomer({
    errorOnNotFound: false,
  });
  const { directPlanCheckout, isDirectPlanCheckoutLoading } =
    useDirectPlanCheckout();
  const { isSignedIn, isLoaded: isUserLoaded } = useUser();
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  // Get user's current plan ID
  let currentPlanId: string | undefined;
  if (customer?.products) {
    const { planId } = getActivePlan(customer.products, customer, "free_plan");
    currentPlanId = planId;
  }

  // No need for custom billing logic - Autumn handles this via product.scenario

  const [isAnnual, setIsAnnual] = useState(false);
  const [isHiddenPlansOpen, setIsHiddenPlansOpen] = useState(false);
  const { products, isLoading, error } = usePricingTable({ productDetails });

  // Downgrade/Cancel confirmation dialog state
  const [downgradeCancelDialogOpen, setDowngradeCancelDialogOpen] =
    useState(false);
  const [downgradeCancelAction, setDowngradeCancelAction] =
    useState<DowngradeCancelAction>("downgrade");
  const [downgradeCancelTargetPlan, setDowngradeCancelTargetPlan] = useState<
    string | undefined
  >(undefined);
  // Store the pending action to execute after confirmation
  const pendingActionRef = useRef<(() => void) | null>(null);

  const sendCancellationEmail = useAction(api.email.sendCancellationEmail);

  // Handler to wrap checkout actions and show dialog for downgrade/cancel
  const handleDowngradeCancelConfirm = useCallback(() => {
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
    if (downgradeCancelAction === "cancel") {
      sendCancellationEmail({}).catch((err) => {
        console.error("[PricingTable] Failed to send cancellation email:", err);
      });
    }
  }, [downgradeCancelAction, sendCancellationEmail]);

  // VLY integrations are always enabled
  const vlyIntegrationsEnabled = true;

  // Handler to show login dialog when user tries to checkout without being signed in
  const handleRequireLogin = useCallback(() => {
    setShowLoginDialog(true);
  }, []);

  // Determine if user is signed in (only check after user data is loaded)
  const userIsSignedIn = isUserLoaded ? isSignedIn : undefined;

  if (isLoading) {
    return <PricingTableSkeleton />;
  }

  if (error) {
    return <div> Something went wrong...</div>;
  }

  const intervals = Array.from(
    new Set(
      products?.map((p) => p.properties?.interval_group).filter((i) => !!i),
    ),
  );

  const multiInterval = intervals.length > 1;

  // Use utility functions for cleaner code
  const filteredProducts = filterProductsByInterval(
    products,
    isAnnual,
    multiInterval,
  );
  let { plans, addOns } = separateProductsByType(filteredProducts);

  // Deduplicate plans by product ID (take the first occurrence of each plan)
  // This prevents duplicate products from Autumn API causing issues
  plans = plans.filter(
    (plan, index, self) => self.findIndex((p) => p.id === plan.id) === index,
  );

  // Filter based on props
  if (showOnlyPlans) {
    addOns = [];
  }
  if (showOnlyAddons) {
    plans = [];
  }

  // If we're showing only addons, render them in a compact format
  if (showOnlyAddons && addOns.length > 0) {
    return (
      <div className="space-y-4 px-1 pb-2">
        {addOns.map((product, index) => {
          const mainPriceDisplay = product.items[0]?.display;
          const featureItems = product.items.slice(1);
          const { buttonText } = getPricingTableContent(product);
          const isActive = product.scenario === "active";

          return (
            <div
              key={index}
              className={cn(
                "group relative flex flex-col rounded-[12px] border border-white/50 bg-white/20 p-4 outline outline-1 outline-white/30 transition-all hover:border-white/60 hover:bg-white/30 hover:shadow-lg",
                isActive && "border-white/60 bg-white/30 shadow-md",
              )}
            >
              {/* Header with title and price */}
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Product icon based on configuration */}
                    {(() => {
                      const Icon = getProductIcon(product.id);
                      return <Icon size="sm" />;
                    })()}
                    <h4
                      className={cn(
                        "text-sm font-normal",
                        getProductColorClasses(product.id),
                      )}
                    >
                      {product.display?.name || product.name}
                    </h4>
                  </div>
                  {isActive && (
                    <span className="text-xs font-medium text-[#4285F4]">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  {/* 50% OFF for discounted plans in compact view */}
                  {(() => {
                    const originalPriceMap: Record<string, number | undefined> =
                      {
                        starter_plan: ORIGINAL_PRICES.starter,
                        hobby_plan: ORIGINAL_PRICES.hobby,
                        business_plan: ORIGINAL_PRICES.business,
                        scale_plan: ORIGINAL_PRICES.scale,
                        priority_plan: ORIGINAL_PRICES.priority,
                        hobby_custom_plan: ORIGINAL_PRICES.hobby,
                        pro_custom_plan: ORIGINAL_PRICES.business,
                      };
                    const originalPrice = originalPriceMap[product.id];
                    if (originalPrice) {
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-normal text-zinc-400 line-through">
                            ${originalPrice.toFixed(2)}
                          </span>
                          <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700">
                            50% off
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="text-base font-bold text-gray-800">
                    {mainPriceDisplay?.primary_text}
                    {mainPriceDisplay?.secondary_text && (
                      <span className="ml-1 text-xs font-normal text-zinc-600">
                        {mainPriceDisplay.secondary_text}
                      </span>
                    )}
                  </div>
                  {/* Early user pricing */}
                  {(() => {
                    const hasDiscount = [
                      "starter_plan",
                      "hobby_plan",
                      "business_plan",
                      "scale_plan",
                      "priority_plan",
                      "hobby_custom_plan",
                      "pro_custom_plan",
                    ].includes(product.id);
                    if (hasDiscount) {
                      return (
                        <span className="text-[9px] font-medium text-[#4285F4]">
                          Early user pricing
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Features list */}
              {featureItems.length > 0 && (
                <div className="mb-3 space-y-2">
                  {featureItems.slice(0, 2).map((item, idx) => (
                    <div
                      key={idx}
                      className="group -m-1.5 flex items-start gap-2 rounded-md p-1.5 text-xs transition-all duration-150 hover:bg-white/20"
                    >
                      <div className="mt-0.5 flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-[#4285F4]/20 bg-[#F9FBFD] shadow-sm">
                        <Check className="h-2 w-2 text-[#4285F4]" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium leading-tight text-gray-800">
                          {item.display?.primary_text}
                        </span>
                        {item.display?.secondary_text && (
                          <span className="leading-tight text-zinc-600">
                            {item.display.secondary_text}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action button */}
              <Button
                size="sm"
                disabled={product.scenario === "scheduled"}
                onClick={createCheckoutHandler({
                  product,
                  customer,
                  checkout,
                  checkoutDialog: CheckoutDialog,
                  isSignedIn: userIsSignedIn,
                  onRequireLogin: handleRequireLogin,
                })}
                className={cn(
                  "h-8 w-full rounded-[8px] border border-white/60 bg-white/40 text-xs font-medium text-gray-800 outline outline-1 outline-white/40 transition-all hover:border-white/80 hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50",
                  isActive && "border-white/70 bg-white/50",
                  getProductButtonHoverClasses(product.id),
                )}
              >
                {product.is_add_on
                  ? "Buy Pack"
                  : product.display?.button_text || buttonText}
              </Button>
            </div>
          );
        })}
      </div>
    );
  }

  // Filter plans based on new tier system
  // Public tiers: Free (small), Starter, Hobby, Business (main 3), Scale, Enterprise
  // Hidden tiers: Priority, Ultra, Max, Unlimited (shown in collapsible section)

  // Main public plans (excluding free and enterprise for separate display)
  const mainPlans = plans.filter((p) =>
    ["starter_plan", "hobby_plan", "business_plan", "scale_plan"].includes(
      p.id,
    ),
  );

  // Free plan (shown small at top)
  const freePlanProduct = plans.find((p) => p.id === "free_plan");

  // Hidden tiers (Priority, Ultra, Max, Unlimited) - shown in collapsible section
  const hiddenPlans = plans.filter((p) =>
    ["priority_plan", "ultra_plan", "max_plan", "unlimited_plan"].includes(
      p.id,
    ),
  );

  // Check if user is on Free plan
  const isOnFreePlan = !currentPlanId || currentPlanId === "free_plan";

  // Handler for downgrading to Free plan
  const handleDowngradeToFree = () => {
    if (freePlanProduct && customer) {
      const directHandler = createDirectPlanCheckoutHandler({
        product: freePlanProduct,
        customer,
        directPlanCheckout,
      });

      // Show downgrade confirmation dialog; on confirm, run direct attach (no popup)
      pendingActionRef.current = () => directHandler();
      setDowngradeCancelAction("downgrade");
      setDowngradeCancelTargetPlan("Free");
      setDowngradeCancelDialogOpen(true);
    }
  };

  return (
    <div className={cn("root")}>
      {plans.length > 0 &&
      addOns.length > 0 &&
      !showOnlyPlans &&
      !showOnlyAddons ? (
        // Side-by-side layout when both plans and add-ons exist
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Main Plans - 2/3 width */}
          <div className="flex-[2]">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-md border border-gray-200 bg-[#F9FBFD] p-2 shadow-sm">
                <Crown className="h-4 w-4 text-[#4285F4]" />
              </div>
              <h3 className="text-2xl font-normal text-gray-800">Plans</h3>
              <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent"></div>
            </div>

            {/* Main Plans Cards (Starter, Hobby, Business, Scale) */}
            {mainPlans.length > 0 && (
              <PricingTableContainer
                products={mainPlans}
                isAnnualToggle={isAnnual}
                setIsAnnualToggle={setIsAnnual}
                multiInterval={multiInterval}
              >
                {mainPlans.map((product, index) => {
                  const isCurrentPlan = currentPlanId === product.id;
                  const directHandler = createDirectPlanCheckoutHandler({
                    product,
                    customer,
                    directPlanCheckout,
                  });
                  const isDowngradeOrCancel =
                    product.scenario === "downgrade" ||
                    product.scenario === "cancel";
                  const wrappedHandler = () => {
                    if (isDowngradeOrCancel) {
                      pendingActionRef.current = () => directHandler();
                      setDowngradeCancelAction(
                        product.scenario === "cancel" ? "cancel" : "downgrade",
                      );
                      setDowngradeCancelTargetPlan(product.name);
                      setDowngradeCancelDialogOpen(true);
                    } else {
                      return directHandler();
                    }
                  };

                  return (
                    <PricingCard
                      key={index}
                      productId={product.id}
                      vlyIntegrationsEnabled={vlyIntegrationsEnabled}
                      isHighlighted={isCurrentPlan}
                      buttonProps={{
                        disabled:
                          product.scenario === "scheduled" ||
                          isDirectPlanCheckoutLoading,
                        onClick: wrappedHandler,
                      }}
                    />
                  );
                })}
              </PricingTableContainer>
            )}

            {/* Hidden Plans (Priority, Ultra, Max, Unlimited) - Collapsible Section */}
            {hiddenPlans.length > 0 && (
              <Collapsible
                open={isHiddenPlansOpen}
                onOpenChange={setIsHiddenPlansOpen}
                className="mt-8"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border-2 border-gray-300 bg-gray-50 px-6 py-4 text-left shadow-sm transition-all hover:border-[#4285F4] hover:bg-gray-100">
                  <span className="text-base font-semibold text-gray-800">
                    View additional plans ({hiddenPlans.length})
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 text-gray-600 transition-transform duration-200",
                      isHiddenPlansOpen && "rotate-180",
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-3">
                  {hiddenPlans.map((product, index) => {
                    const isCurrentPlan = currentPlanId === product.id;
                    return (
                      <CompactTierCard
                        key={index}
                        product={product}
                        isCurrentPlan={isCurrentPlan}
                        currentPlanId={currentPlanId}
                        customer={customer}
                        directPlanCheckout={directPlanCheckout}
                        vlyIntegrationsEnabled={vlyIntegrationsEnabled}
                        onActionClick={(action, planName, handler) => {
                          pendingActionRef.current = handler;
                          setDowngradeCancelAction(action);
                          setDowngradeCancelTargetPlan(planName);
                          setDowngradeCancelDialogOpen(true);
                        }}
                        isDirectPlanCheckoutLoading={
                          isDirectPlanCheckoutLoading
                        }
                      />
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {/* Add-ons - 1/3 width */}
          <div className="flex-[1]">
            <div className="mb-6 text-center">
              <div className="mb-3 flex items-center justify-center gap-3">
                <div className="rounded-[12px] border border-white/60 bg-white/40 p-3 shadow-lg outline outline-1 outline-white/40">
                  <Coins className="h-5 w-5 text-zinc-700" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                ⚡ Power-Up Credits
              </h3>
              <p className="mt-2 text-sm font-medium text-zinc-600">
                Instant boosts when you need them most
              </p>
            </div>
            <PricingTableContainer
              products={addOns}
              isAnnualToggle={isAnnual}
              setIsAnnualToggle={setIsAnnual}
              multiInterval={false} // Don't show interval toggle for add-ons
              className="grid-cols-1" // Force single column for add-ons
            >
              {addOns.map((product, index) => (
                <PricingCard
                  key={index}
                  productId={product.id}
                  vlyIntegrationsEnabled={vlyIntegrationsEnabled}
                  className="scale-95 border-zinc-200/60 bg-zinc-50/30 opacity-85"
                  buttonProps={{
                    disabled: product.scenario === "scheduled",
                    onClick: createCheckoutHandler({
                      product,
                      customer,
                      checkout,
                      checkoutDialog: CheckoutDialog,
                      isSignedIn: userIsSignedIn,
                      onRequireLogin: handleRequireLogin,
                    }),
                  }}
                />
              ))}
            </PricingTableContainer>
          </div>
        </div>
      ) : (
        // Stacked layout when only one type exists
        <div className="space-y-8">
          {/* Main Plans */}
          {plans.length > 0 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-md border border-gray-200 bg-[#F9FBFD] p-2 shadow-sm">
                  <Crown className="h-4 w-4 text-[#4285F4]" />
                </div>
                <h3 className="text-2xl font-normal text-gray-800">Plans</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent"></div>
              </div>

              {/* Founders message */}
              <div className="mb-4 rounded-lg border border-gray-200 bg-[#F9FBFD] p-4">
                <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                  <span className="text-2xl">💜</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      We don't profit from subscriptions—your support keeps vly
                      alive.
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Subscriptions are priced at original costs; we make no
                      profit. Without you, we can't continue.{" "}
                      <a
                        href="https://discord.gg/2gSmB9DxJW"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline hover:text-[#1557b0]"
                      >
                        Join Discord
                      </a>{" "}
                      to meet the founders!
                    </p>
                  </div>
                </div>
              </div>

              {/* Free Plan Banner - below founders message */}
              <FreePlanBanner
                customer={customer}
                isOnFreePlan={isOnFreePlan}
                onDowngradeToFree={handleDowngradeToFree}
              />

              {/* Main Plans Cards (Starter, Hobby, Business, Scale) */}
              {mainPlans.length > 0 && (
                <PricingTableContainer
                  products={mainPlans}
                  isAnnualToggle={isAnnual}
                  setIsAnnualToggle={setIsAnnual}
                  multiInterval={multiInterval}
                >
                  {mainPlans.map((product, index) => {
                    const isCurrentPlan = currentPlanId === product.id;
                    const directHandler = createDirectPlanCheckoutHandler({
                      product,
                      customer,
                      directPlanCheckout,
                    });
                    const isDowngradeOrCancel =
                      product.scenario === "downgrade" ||
                      product.scenario === "cancel";
                    const wrappedHandler = () => {
                      if (isDowngradeOrCancel) {
                        pendingActionRef.current = () => directHandler();
                        setDowngradeCancelAction(
                          product.scenario === "cancel"
                            ? "cancel"
                            : "downgrade",
                        );
                        setDowngradeCancelTargetPlan(product.name);
                        setDowngradeCancelDialogOpen(true);
                      } else {
                        return directHandler();
                      }
                    };

                    return (
                      <PricingCard
                        key={index}
                        productId={product.id}
                        vlyIntegrationsEnabled={vlyIntegrationsEnabled}
                        isHighlighted={isCurrentPlan}
                        buttonProps={{
                          disabled:
                            product.scenario === "scheduled" ||
                            isDirectPlanCheckoutLoading,
                          onClick: wrappedHandler,
                        }}
                      />
                    );
                  })}
                </PricingTableContainer>
              )}

              {/* Hidden Plans (Priority, Ultra, Max, Unlimited) - Collapsible Section */}
              {hiddenPlans.length > 0 && (
                <Collapsible
                  open={isHiddenPlansOpen}
                  onOpenChange={setIsHiddenPlansOpen}
                  className="mt-8"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border-2 border-gray-300 bg-gray-50 px-6 py-4 text-left shadow-sm transition-all hover:border-[#4285F4] hover:bg-gray-100">
                    <span className="text-base font-semibold text-gray-800">
                      View additional plans ({hiddenPlans.length})
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-5 w-5 text-gray-600 transition-transform duration-200",
                        isHiddenPlansOpen && "rotate-180",
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-3">
                    {hiddenPlans.map((product, index) => {
                      const isCurrentPlan = currentPlanId === product.id;
                      return (
                        <CompactTierCard
                          key={index}
                          product={product}
                          isCurrentPlan={isCurrentPlan}
                          currentPlanId={currentPlanId}
                          customer={customer}
                          directPlanCheckout={directPlanCheckout}
                          vlyIntegrationsEnabled={vlyIntegrationsEnabled}
                          onActionClick={(action, planName, handler) => {
                            pendingActionRef.current = handler;
                            setDowngradeCancelAction(action);
                            setDowngradeCancelTargetPlan(planName);
                            setDowngradeCancelDialogOpen(true);
                          }}
                          isDirectPlanCheckoutLoading={
                            isDirectPlanCheckoutLoading
                          }
                        />
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          {/* Add-ons */}
          {addOns.length > 0 && (
            <div>
              <div className="mb-6 text-center">
                <div className="mb-3 flex items-center justify-center gap-3">
                  <div className="rounded-[12px] border border-white/60 bg-white/40 p-3 shadow-lg outline outline-1 outline-white/40">
                    <Coins className="h-5 w-5 text-zinc-700" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-800">
                  ⚡ Power-Up Credits
                </h3>
                <p className="mt-2 text-sm font-medium text-zinc-600">
                  Instant boosts when you need them most
                </p>
              </div>
              <PricingTableContainer
                products={addOns}
                isAnnualToggle={isAnnual}
                setIsAnnualToggle={setIsAnnual}
                multiInterval={false} // Don't show interval toggle for add-ons
              >
                {addOns.map((product, index) => (
                  <PricingCard
                    key={index}
                    productId={product.id}
                    vlyIntegrationsEnabled={vlyIntegrationsEnabled}
                    className="scale-95 border-zinc-200/60 bg-zinc-50/30 opacity-85"
                    buttonProps={{
                      disabled:
                        (product.scenario === "active" &&
                          !product.properties.updateable) ||
                        product.scenario === "scheduled",
                      onClick: createCheckoutHandler({
                        product,
                        customer,
                        checkout,
                        checkoutDialog: CheckoutDialog,
                        isSignedIn: userIsSignedIn,
                        onRequireLogin: handleRequireLogin,
                      }),
                    }}
                  />
                ))}
              </PricingTableContainer>
            </div>
          )}
        </div>
      )}

      {/* Downgrade/Cancel Confirmation Dialog */}
      <DowngradeCancelDialog
        open={downgradeCancelDialogOpen}
        onOpenChange={setDowngradeCancelDialogOpen}
        action={downgradeCancelAction}
        onConfirm={handleDowngradeCancelConfirm}
        targetPlanName={downgradeCancelTargetPlan}
      />

      {/* Login Required Dialog */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in required</DialogTitle>
            <DialogDescription>
              Please sign in to upgrade or purchase a plan. You can view pricing
              without signing in, but authentication is required to complete
              your purchase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowLoginDialog(false)}>
              Cancel
            </Button>
            <SignInButton mode="modal" asChild>
              <Button>Sign In</Button>
            </SignInButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PricingTableContext = createContext<{
  isAnnualToggle: boolean;
  setIsAnnualToggle: (isAnnual: boolean) => void;
  products: Product[];
  showFeatures: boolean;
  customerData: any;
}>({
  isAnnualToggle: false,
  setIsAnnualToggle: () => {},
  products: [],
  showFeatures: true,
  customerData: null,
});

export const usePricingTableContext = (componentName: string) => {
  const context = useContext(PricingTableContext);

  if (context === undefined) {
    throw new Error(`${componentName} must be used within <PricingTable />`);
  }

  return context;
};

export const PricingTableContainer = ({
  children,
  products,
  showFeatures = true,
  className,
  isAnnualToggle,
  setIsAnnualToggle,
  multiInterval,
}: {
  children?: React.ReactNode;
  products?: Product[];
  showFeatures?: boolean;
  className?: string;
  isAnnualToggle: boolean;
  setIsAnnualToggle: (isAnnual: boolean) => void;
  multiInterval: boolean;
}) => {
  if (!products) {
    throw new Error("products is required in <PricingTable />");
  }

  if (products.length === 0) {
    return <></>;
  }

  const hasRecommended = products?.some((p) => p.display?.recommend_text);
  return (
    <PricingTableContext.Provider
      value={{
        isAnnualToggle,
        setIsAnnualToggle,
        products,
        showFeatures,
        customerData: null,
      }}
    >
      <div
        className={cn("flex flex-col items-center", hasRecommended && "!py-10")}
      >
        {multiInterval && (
          <div
            className={cn(
              products.some((p) => p.display?.recommend_text) && "mb-8",
            )}
          >
            <AnnualSwitch
              isAnnualToggle={isAnnualToggle}
              setIsAnnualToggle={setIsAnnualToggle}
            />
          </div>
        )}
        <div
          className={cn(
            "grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </PricingTableContext.Provider>
  );
};

interface PricingCardProps {
  productId: string;
  showFeatures?: boolean;
  className?: string;
  onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  buttonProps?: React.ComponentProps<"button">;
  vlyIntegrationsEnabled?: boolean;
  isHighlighted?: boolean; // Highlighted when this is the current plan
}

const PricingCardComponent = ({
  productId,
  className,
  buttonProps,
  vlyIntegrationsEnabled = false,
  isHighlighted = false,
}: PricingCardProps) => {
  const { products, showFeatures } = usePricingTableContext("PricingCard");
  const { customer } = useCustomer({
    errorOnNotFound: false,
    expand: ["payment_method"],
  });

  const product = products.find((p) => p.id === productId);

  if (!product) {
    throw new Error(`Product with id ${productId} not found`);
  }

  // Check if this plan is a scheduled downgrade target
  // A plan with scenario === "scheduled" means the user is scheduled to switch to it
  const isScheduledDowngrade = product.scenario === "scheduled";

  // Use useState with lazy initializer to store timestamp once, avoiding impure function call during render
  const [now] = useState(() => Date.now());

  // Get the scheduled date from the customer's current (canceled) plan
  const scheduledDowngradeDate = (() => {
    if (!isScheduledDowngrade || !customer?.products) return null;
    // Find the current plan that's been canceled (has canceled_at and current_period_end)
    const canceledPlan = (customer as any).products.find(
      (p: any) =>
        p.canceled_at &&
        p.current_period_end &&
        !p.is_add_on &&
        now < p.current_period_end,
    );
    if (!canceledPlan?.current_period_end) return null;
    return new Date(canceledPlan.current_period_end).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric", year: "numeric" },
    );
  })();

  const { name, display: productDisplay } = product;
  const communityBadgeTier = getCommunityBadgeTierForPlan(product.id);

  const { buttonText: defaultButtonText } = getPricingTableContent(product);

  const isRecommended = productDisplay?.recommend_text ? true : false;

  // Use Autumn's scenario directly for determining active status
  // For scheduled changes, we want to show the currently active plan as "Current Plan"
  // until the scheduled change takes effect
  const isActive = product.scenario === "active";

  // Check if this product is canceled but still within current period (meaning it's currently active)
  // This handles the case where a user has scheduled a downgrade but is still on their current plan
  // IMPORTANT: Also check if customer has the custom variant of this plan
  const customPlanId = getCustomPlanIdLocal(product.id);
  const customerProduct = (customer as any)?.products?.find(
    (p: any) => p.id === product.id || (customPlanId && p.id === customPlanId),
  );
  const isCanceledButActive =
    customerProduct?.canceled_at &&
    customerProduct?.current_period_end &&
    now < customerProduct.current_period_end;

  // Check if user is on this plan or its custom variant
  const isOnThisPlan = isCustomerOnPlan(customer, product.id);

  const isCurrentlyActive = isActive || isCanceledButActive || isOnThisPlan;

  // Determine button text based on plan scenario
  let buttonText = defaultButtonText;

  // If plan is cancelled but still active, show renew text
  if (isCanceledButActive) {
    buttonText = <p>Renew Plan</p>;
  } else if (isCurrentlyActive) {
    buttonText = <p>Current Plan</p>;
  } else if (product.scenario === "upgrade") {
    // Show "Confirm Upgrade" if user has billing attached, otherwise "Upgrade"
    const hasBillingAttached = !!customer?.payment_method;
    buttonText = <p>{hasBillingAttached ? "Confirm Upgrade" : "Upgrade"}</p>;
  } else if (product.scenario === "downgrade") {
    buttonText = <p>Downgrade</p>;
  } else if (product.scenario === "new") {
    buttonText = <p>Start Building</p>;
  }

  // Find the price item explicitly instead of assuming items[0]
  // Price items are those without a feature_id (pure price items)
  const priceItem = product.items.find((item) => !item.feature_id);

  // Fixed tier pricing - show the tier's fixed price
  const tierPriceMap: Record<string, { price: number; credits: number }> = {
    free_plan: { price: PLAN_PRICES.free, credits: PLAN_BASE_CREDITS.free },
    starter_plan: {
      price: PLAN_PRICES.starter,
      credits: PLAN_BASE_CREDITS.starter,
    },
    hobby_plan: { price: PLAN_PRICES.hobby, credits: PLAN_BASE_CREDITS.hobby },
    business_plan: {
      price: PLAN_PRICES.business,
      credits: PLAN_BASE_CREDITS.business,
    },
    scale_plan: { price: PLAN_PRICES.scale, credits: PLAN_BASE_CREDITS.scale },
    priority_plan: {
      price: PLAN_PRICES.priority,
      credits: PLAN_BASE_CREDITS.priority,
    },
    ultra_plan: {
      price: PLAN_PRICES.ultra,
      credits: PLAN_BASE_CREDITS.ultra,
    },
    max_plan: { price: PLAN_PRICES.max, credits: PLAN_BASE_CREDITS.max },
    unlimited_plan: {
      price: PLAN_PRICES.unlimited,
      credits: PLAN_BASE_CREDITS.unlimited,
    },
    enterprise_plan: { price: 0, credits: PLAN_BASE_CREDITS.enterprise },
    // Legacy mappings
    hobby_custom_plan: {
      price: PLAN_PRICES.hobby,
      credits: PLAN_BASE_CREDITS.hobby,
    },
    pro_custom_plan: {
      price: PLAN_PRICES.business,
      credits: PLAN_BASE_CREDITS.business,
    },
  };

  const tierPriceInfo = tierPriceMap[productId];

  let mainPriceDisplay;
  if (productId === "free_plan") {
    mainPriceDisplay = {
      primary_text: "Free",
      secondary_text: undefined,
    };
  } else if (productId === "enterprise_plan") {
    mainPriceDisplay = {
      primary_text: "Custom",
      secondary_text: undefined,
    };
  } else if (tierPriceInfo) {
    mainPriceDisplay = {
      primary_text: `$${tierPriceInfo.price}`,
      secondary_text: "/month",
    };
  } else {
    mainPriceDisplay = priceItem?.display || product.items[0]?.display;
  }

  // Extract agent credit items for separate display
  const tokenItems = product.items.filter(
    (item) => item.feature_id === "agent_credits" && item.included_usage,
  );

  // Extract email and AI items for display with tokens
  const integrationItems = product.items.filter(
    (item) =>
      (item.feature_id === "email_integration" ||
        item.feature_id === "llm_integration") &&
      item.included_usage,
  );

  // Extract Convex items for display in header
  const convexItems = product.items.filter(
    (item) =>
      (item.feature_id === "convex_function_calls" ||
        item.feature_id === "convex_compute" ||
        item.feature_id === "convex_database_bw" ||
        item.feature_id === "convex_file_bw") &&
      item.included_usage,
  );

  // Extract Sandbox items for display
  const sandboxItems = product.items.filter(
    (item) =>
      (item.feature_id === "sandbox_small" ||
        item.feature_id === "sandbox_medium" ||
        item.feature_id === "sandbox_large") &&
      item.included_usage,
  );

  // Check which sandbox sizes are NOT included
  const hasSandboxSmall = product.items.some(
    (item) => item.feature_id === "sandbox_small" && item.included_usage,
  );
  const hasSandboxMedium = product.items.some(
    (item) => item.feature_id === "sandbox_medium" && item.included_usage,
  );
  const hasSandboxLarge = product.items.some(
    (item) => item.feature_id === "sandbox_large" && item.included_usage,
  );

  // Get non-token, non-integration feature items
  // Explicitly exclude price items (items without feature_id) from the feature list
  const featureItems = product.items.filter((item) => {
    // Exclude price items (items without feature_id)
    if (!item.feature_id) return false;
    // Exclude agent_credits, email_integration, llm_integration, convex features, and sandbox features when they have included_usage
    if (item.feature_id === "agent_credits" && item.included_usage)
      return false;
    if (item.feature_id === "email_integration" && item.included_usage)
      return false;
    if (item.feature_id === "llm_integration" && item.included_usage)
      return false;
    if (item.feature_id === "convex_function_calls" && item.included_usage)
      return false;
    if (item.feature_id === "convex_compute" && item.included_usage)
      return false;
    if (item.feature_id === "convex_database_bw" && item.included_usage)
      return false;
    if (item.feature_id === "convex_file_bw" && item.included_usage)
      return false;
    if (item.feature_id === "sandbox_small" && item.included_usage)
      return false;
    if (item.feature_id === "sandbox_medium" && item.included_usage)
      return false;
    if (item.feature_id === "sandbox_large" && item.included_usage)
      return false;
    return true;
  });

  // Tier progression for cumulative display
  const tierProgression: Record<
    string,
    { previous: string | null; features: readonly string[] }
  > = {
    starter_plan: { previous: null, features: BOOLEAN_FEATURES.starter },
    hobby_plan: { previous: "Starter", features: BOOLEAN_FEATURES.hobby },
    business_plan: { previous: "Hobby", features: BOOLEAN_FEATURES.business },
    scale_plan: { previous: "Business", features: BOOLEAN_FEATURES.scale },
    priority_plan: { previous: "Scale", features: BOOLEAN_FEATURES.priority },
    ultra_plan: { previous: "Priority", features: BOOLEAN_FEATURES.ultra },
    max_plan: { previous: "Ultra", features: BOOLEAN_FEATURES.max },
    unlimited_plan: { previous: "Max", features: BOOLEAN_FEATURES.unlimited },
  };

  // Get the tier progression info for cumulative display
  const tierProgressionInfo = tierProgression[productId];
  const previousTierName = tierProgressionInfo?.previous;
  const thisTierNewFeatureIds = tierProgressionInfo?.features || [];

  // Filter feature items to only show NEW features for this tier (for cumulative display)
  const cumulativeFeatureItems = tierProgressionInfo
    ? featureItems.filter((item) => {
        // Include if this is a new feature for this tier
        return (
          item.feature_id && thisTierNewFeatureIds.includes(item.feature_id)
        );
      })
    : featureItems;

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-lg bg-white py-4 text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_3px_6px_rgba(0,0,0,0.16),0_3px_6px_rgba(0,0,0,0.23)]",
        isRecommended &&
          "bg-white shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)] lg:h-[calc(100%+48px)] lg:-translate-y-6 lg:shadow-[0_4px_8px_rgba(0,0,0,0.20),0_4px_8px_rgba(0,0,0,0.25)]",
        isCurrentlyActive &&
          "bg-white shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)] ring-2 ring-[#4285F4]/20",
        isHighlighted &&
          "scale-105 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.20),0_4px_8px_rgba(0,0,0,0.25)] ring-2 ring-[#4285F4]/30",
        className,
      )}
      style={{
        willChange: isHighlighted ? "transform, opacity" : "auto",
        transform: "translateZ(0)",
      }}
    >
      {/* Subtle animated background pattern - GPU accelerated */}
      <div
        className="absolute inset-0 opacity-30"
        style={{ willChange: "transform", transform: "translateZ(0)" }}
      >
        <div
          className="absolute -left-4 top-0 h-72 w-72 rounded-full bg-gradient-to-r from-blue-50/20 to-blue-100/20 blur-3xl transition-transform duration-700 group-hover:scale-110"
          style={{ willChange: "transform" }}
        />
        <div
          className="absolute -bottom-8 -right-4 h-64 w-64 rounded-full bg-gradient-to-r from-gray-100/20 to-blue-50/20 blur-3xl transition-transform duration-700 group-hover:scale-110"
          style={{ willChange: "transform" }}
        />
      </div>
      {productDisplay?.recommend_text && (
        <RecommendedBadge recommended={productDisplay?.recommend_text} />
      )}
      {isScheduledDowngrade &&
        scheduledDowngradeDate &&
        !productDisplay?.recommend_text &&
        !isCurrentlyActive && (
          <PendingDowngradeBadge date={scheduledDowngradeDate} />
        )}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          isRecommended && "lg:translate-y-6",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-shrink-0 pb-4">
              <h2 className="truncate px-6 text-2xl font-normal text-gray-800">
                {productDisplay?.name || name}
              </h2>
              {communityBadgeTier > 0 && (
                <div className="mt-1 flex items-center gap-2 px-6">
                  <CommunityBadge
                    communityBadgeTier={communityBadgeTier}
                    size="md"
                  />
                  {isCurrentlyActive && (
                    <span className="rounded-full border border-[#4285F4]/60 bg-[#EAF2FF] px-2 py-0.5 text-xs font-semibold text-[#1557b0] shadow-sm">
                      Current Plan
                    </span>
                  )}
                </div>
              )}
              {productDisplay?.description && (
                <div className="h-8 px-6 text-sm text-muted-foreground">
                  <p className="line-clamp-2">{productDisplay?.description}</p>
                </div>
              )}
            </div>
            <div className="mb-2 flex min-h-0 flex-1 flex-col">
              {/* Unified Price & Token Container */}
              <div
                className="shadow-black/3 relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
                style={{
                  willChange: "contents",
                  contain: "layout style paint",
                }}
              >
                {/* Price Section */}
                <h3 className="relative flex min-h-16 flex-shrink-0 flex-col justify-center border-b border-gray-200 bg-[#F9FBFD] px-6 py-3 text-xl font-bold">
                  {/* 50% OFF badge for plans with original prices */}
                  {(() => {
                    const originalPriceMap: Record<string, number | undefined> =
                      {
                        starter_plan: ORIGINAL_PRICES.starter,
                        hobby_plan: ORIGINAL_PRICES.hobby,
                        business_plan: ORIGINAL_PRICES.business,
                        scale_plan: ORIGINAL_PRICES.scale,
                        priority_plan: ORIGINAL_PRICES.priority,
                        hobby_custom_plan: ORIGINAL_PRICES.hobby,
                        pro_custom_plan: ORIGINAL_PRICES.business,
                      };
                    const originalPrice = originalPriceMap[productId];
                    if (originalPrice) {
                      return (
                        <div className="relative z-10 mb-1 flex items-center gap-2">
                          <span className="text-sm font-normal text-zinc-500 line-through">
                            ${originalPrice.toFixed(2)}
                          </span>
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                            50% off
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="relative z-10 line-clamp-2 text-gray-800">
                    {mainPriceDisplay?.primary_text}{" "}
                    {mainPriceDisplay?.secondary_text && (
                      <span className="mt-1 text-sm font-medium text-zinc-700">
                        {mainPriceDisplay?.secondary_text}
                      </span>
                    )}
                  </div>
                  {/* Early user pricing text for discounted plans */}
                  {(() => {
                    const hasDiscount = [
                      "starter_plan",
                      "hobby_plan",
                      "business_plan",
                      "scale_plan",
                      "priority_plan",
                      "hobby_custom_plan",
                      "pro_custom_plan",
                    ].includes(productId);
                    if (hasDiscount) {
                      return (
                        <div className="relative z-10 mt-0.5 text-[10px] font-medium text-[#4285F4]">
                          Early user pricing
                          {productId === "business_plan" && (
                            <span className="ml-1 text-green-600">
                              • Best value
                            </span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {/* Price section shine effect - GPU accelerated */}
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{ willChange: "opacity" }}
                  />
                </h3>

                {/* Token & Integration Information Display - Restructured */}
                {(tokenItems.length > 0 ||
                  integrationItems.length > 0 ||
                  convexItems.length > 0 ||
                  sandboxItems.length > 0) && (
                  <div className="relative flex min-h-0 flex-1 flex-col bg-[#F9FBFD] px-4 py-4">
                    <div className="relative z-10 flex min-h-0 flex-1 flex-col space-y-4">
                      {/* Token Information - Only show first token item to avoid duplicates */}
                      {tokenItems.slice(0, 1).map((tokenItem, index) => {
                        // Show the tier's fixed credit amount
                        let tokenCount: string;

                        // Fixed tier system - show the tier's fixed credit amount
                        const tierCreditsMap: Record<string, number> = {
                          free_plan: PLAN_BASE_CREDITS.free,
                          starter_plan: PLAN_BASE_CREDITS.starter,
                          hobby_plan: PLAN_BASE_CREDITS.hobby,
                          business_plan: PLAN_BASE_CREDITS.business,
                          scale_plan: PLAN_BASE_CREDITS.scale,
                          priority_plan: PLAN_BASE_CREDITS.priority,
                          ultra_plan: PLAN_BASE_CREDITS.ultra,
                          max_plan: PLAN_BASE_CREDITS.max,
                          unlimited_plan: PLAN_BASE_CREDITS.unlimited,
                          enterprise_plan: PLAN_BASE_CREDITS.enterprise,
                          // Legacy mappings
                          hobby_custom_plan: PLAN_BASE_CREDITS.hobby,
                          pro_custom_plan: PLAN_BASE_CREDITS.business,
                        };

                        const fixedCredits = tierCreditsMap[productId];
                        if (fixedCredits !== undefined) {
                          tokenCount = formatCredits(fixedCredits);
                        } else if (
                          typeof tokenItem.included_usage === "number"
                        ) {
                          tokenCount = formatCredits(tokenItem.included_usage);
                        } else if (tokenItem.included_usage === "inf") {
                          tokenCount = "Unlimited";
                        } else {
                          tokenCount = "0";
                        }

                        // Fixed tier billing info - all plans are limit-based (no pay-as-you-go)
                        let billingInfo = "";
                        if (productId === "free_plan") {
                          billingInfo = "One-time grant (does not reset)";
                        } else {
                          billingInfo = "Monthly limit";
                        }
                        // Calculate the dollar value (1M tokens = $1)
                        const dollarValue =
                          fixedCredits !== undefined
                            ? Math.round(fixedCredits / 1_000_000)
                            : typeof tokenItem.included_usage === "number"
                              ? Math.round(tokenItem.included_usage / 1_000_000)
                              : 0;

                        return (
                          <div key={index} className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center">
                                <VlyCoin size="sm" />
                              </div>
                              <div className="text-lg font-bold text-gray-800">
                                {`${tokenCount} tokens`}
                              </div>
                            </div>
                            {dollarValue > 0 && (
                              <div className="ml-8 mt-0.5 text-xs font-medium text-green-600">
                                Worth ${dollarValue}
                              </div>
                            )}
                            {billingInfo ? (
                              <div className="ml-8 mt-0.5 whitespace-nowrap text-xs font-normal text-zinc-500">
                                {billingInfo.trim()}
                              </div>
                            ) : (
                              <div className="ml-8 mt-1 h-4" />
                            )}
                          </div>
                        );
                      })}

                      {/* Upgrade Button */}
                      <div className="pt-1">
                        <PricingCardButton
                          recommended={
                            productDisplay?.recommend_text ? true : false
                          }
                          className="shadow-lg shadow-purple-500/25"
                          {...buttonProps}
                        >
                          {product.is_add_on
                            ? "Buy Pack"
                            : productDisplay?.button_text || buttonText}
                        </PricingCardButton>
                      </div>

                      {/* Boolean Features First - Cumulative List */}
                      {showFeatures &&
                        (cumulativeFeatureItems.length > 0 ||
                          previousTierName) && (
                          <div className="-mx-2 rounded-lg border border-white/30 bg-white/20">
                            <PricingFeatureList
                              items={cumulativeFeatureItems}
                              everythingFrom={previousTierName || undefined}
                              productId={productId}
                              // Only show NEW sandbox sizes for each tier (cumulative pattern)
                              hasSandboxSmall={
                                hasSandboxSmall && productId === "starter_plan"
                              }
                              hasSandboxMedium={
                                hasSandboxMedium &&
                                ["hobby_plan", "hobby_custom_plan"].includes(
                                  productId,
                                )
                              }
                              hasSandboxLarge={
                                hasSandboxLarge &&
                                ["business_plan", "pro_custom_plan"].includes(
                                  productId,
                                )
                              }
                            />
                          </div>
                        )}

                      {/* Dynamic Features - Expanded (only bandwidth combined) */}
                      <div className="-mx-2 mt-2 space-y-1 px-2 text-xs text-zinc-600">
                        {/* Max Projects */}
                        {(() => {
                          const maxProjectsItem = product.items.find(
                            (item) => item.feature_id === "max_projects",
                          );
                          if (!maxProjectsItem?.included_usage) return null;
                          const raw = maxProjectsItem.included_usage;
                          const count =
                            raw === "inf"
                              ? "Unlimited"
                              : typeof raw === "number"
                                ? raw >= 1000
                                  ? raw.toLocaleString()
                                  : String(raw)
                                : raw;
                          return (
                            <div className="flex items-center gap-1.5">
                              <Box className="h-3 w-3 flex-shrink-0" />
                              <span>{count} projects</span>
                            </div>
                          );
                        })()}

                        {/* Team Seats */}
                        {(() => {
                          const seatsItem = product.items.find(
                            (item) => item.feature_id === "team_seats",
                          );
                          if (
                            !seatsItem?.included_usage ||
                            seatsItem.included_usage === 0
                          )
                            return null;
                          const count =
                            seatsItem.included_usage === "inf"
                              ? "Unlimited"
                              : seatsItem.included_usage;
                          return (
                            <div className="flex items-center gap-1.5">
                              <Box className="h-3 w-3 flex-shrink-0" />
                              <span>{count} team seats</span>
                            </div>
                          );
                        })()}

                        {/* Convex Function Calls */}
                        {(() => {
                          const fnCalls = convexItems.find(
                            (item) =>
                              item.feature_id === "convex_function_calls",
                          );
                          if (!fnCalls?.included_usage) return null;
                          const val =
                            typeof fnCalls.included_usage === "number"
                              ? fnCalls.included_usage >= 1000000
                                ? `${(fnCalls.included_usage / 1000000).toFixed(0)}M`
                                : fnCalls.included_usage >= 1000
                                  ? `${(fnCalls.included_usage / 1000).toFixed(0)}K`
                                  : fnCalls.included_usage.toString()
                              : fnCalls.included_usage;
                          return (
                            <div className="flex items-center gap-1.5">
                              <ConvexIcon size="sm" />
                              <span>{val} function calls</span>
                            </div>
                          );
                        })()}

                        {/* Convex Compute */}
                        {(() => {
                          const compute = convexItems.find(
                            (item) => item.feature_id === "convex_compute",
                          );
                          if (!compute?.included_usage) return null;
                          return (
                            <div className="flex items-center gap-1.5">
                              <ConvexIcon size="sm" />
                              <span>{compute.included_usage} GB compute</span>
                            </div>
                          );
                        })()}

                        {/* Combined Bandwidth (database + file) */}
                        {(() => {
                          const dbBw = convexItems.find(
                            (item) => item.feature_id === "convex_database_bw",
                          );
                          const fileBw = convexItems.find(
                            (item) => item.feature_id === "convex_file_bw",
                          );
                          const dbBwVal =
                            typeof dbBw?.included_usage === "number"
                              ? dbBw.included_usage
                              : 0;
                          const fileBwVal =
                            typeof fileBw?.included_usage === "number"
                              ? fileBw.included_usage
                              : 0;
                          const totalBw = dbBwVal + fileBwVal;
                          if (totalBw === 0) return null;
                          return (
                            <div className="flex items-center gap-1.5">
                              <ConvexIcon size="sm" />
                              <span>{totalBw} GB bandwidth</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {/* Enhanced gradient overlay with shimmer - GPU accelerated */}
                    <div
                      className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-gray-50/20 to-gray-100/30"
                      style={{ willChange: "opacity" }}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      style={{ willChange: "opacity" }}
                    />
                  </div>
                )}

                {/* Container glow effect - GPU accelerated */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-br from-gray-100/10 via-transparent to-blue-100/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{ willChange: "opacity" }}
                />
              </div>
            </div>
          </div>
          {/* Boolean features are now rendered inside the token section above */}
        </div>
      </div>
    </div>
  );
};

// Wrap with React.memo to prevent unnecessary re-renders
export const PricingCard = React.memo(PricingCardComponent);

// Pricing Feature List - Boolean features with sandboxes as boolean items
export const PricingFeatureList = ({
  items,
  everythingFrom,
  className,
  hasSandboxSmall,
  hasSandboxMedium,
  hasSandboxLarge,
}: {
  items: ProductItem[];
  everythingFrom?: string;
  className?: string;
  productId?: string;
  hasSandboxSmall?: boolean;
  hasSandboxMedium?: boolean;
  hasSandboxLarge?: boolean;
}) => {
  // Get display name for feature ID
  const getFeatureDisplayName = (featureId: string): string => {
    return (
      FEATURE_DISPLAY_NAMES[featureId] ||
      featureId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
  };

  // Build sandbox boolean features
  const sandboxFeatures: { id: string; label: string; enabled: boolean }[] = [];
  if (hasSandboxSmall) {
    sandboxFeatures.push({
      id: "sandbox_small",
      label: "Small Sandboxes",
      enabled: true,
    });
  }
  if (hasSandboxMedium) {
    sandboxFeatures.push({
      id: "sandbox_medium",
      label: "Medium Sandboxes",
      enabled: true,
    });
  }
  if (hasSandboxLarge) {
    sandboxFeatures.push({
      id: "sandbox_large",
      label: "Large Sandboxes",
      enabled: true,
    });
  }

  const hasNoFeatures = items.length === 0 && sandboxFeatures.length === 0;

  return (
    <div className={cn("w-full", className)}>
      {everythingFrom && (
        <div className="border-b border-[#4285F4]/20 bg-[#F9FBFD] px-2 py-1.5">
          <p className="text-xs font-medium text-[#4285F4]">
            Everything in {everythingFrom}, plus:
          </p>
        </div>
      )}
      {hasNoFeatures && !everythingFrom && (
        <div className="px-2 py-1.5 text-xs text-zinc-500">
          Basic features included
        </div>
      )}
      <div className="py-1.5">
        {/* Boolean feature items first */}
        {items.map((item, index) => {
          // Use feature display name if available, fallback to item display
          const displayText = item.feature_id
            ? getFeatureDisplayName(item.feature_id)
            : item.display?.primary_text;

          return (
            <div
              key={index}
              className="flex w-full items-center gap-1.5 px-2 py-1 transition-all duration-150 hover:bg-[#F9FBFD]/50"
            >
              {/* Checkmark icon */}
              <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border border-[#4285F4]/20 bg-[#F9FBFD] shadow-sm">
                <Check className="h-2 w-2 text-[#4285F4]" />
              </div>
              <span className="text-xs font-medium leading-4 text-gray-800">
                {displayText}
              </span>
            </div>
          );
        })}
        {/* Sandbox boolean features */}
        {sandboxFeatures.map((sandbox) => (
          <div
            key={sandbox.id}
            className="flex w-full items-center gap-1.5 px-2 py-1 transition-all duration-150 hover:bg-[#F9FBFD]/50"
          >
            <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border border-[#4285F4]/20 bg-[#F9FBFD] shadow-sm">
              <Check className="h-2 w-2 text-[#4285F4]" />
            </div>
            <span className="text-xs font-medium leading-4 text-gray-800">
              {sandbox.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Pricing Card Button
export interface PricingCardButtonProps extends React.ComponentProps<"button"> {
  recommended?: boolean;
  buttonUrl?: string;
}

export const PricingCardButton = React.forwardRef<
  HTMLButtonElement,
  PricingCardButtonProps
>(({ recommended, children, className, onClick, ...props }, ref) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    setLoading(true);
    try {
      await onClick?.(e);
    } catch (error) {
      console.error("[PricingCardButton] Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      className={cn(
        "button-group group relative w-full overflow-hidden rounded-[15px] border px-4 py-3 outline outline-1 transition-all duration-300",
        recommended
          ? "bg-[#1a73e8] text-white shadow-[0_1px_2px_rgba(0,0,0,0.16)] hover:bg-[#1557b0] hover:shadow-[0_2px_4px_rgba(0,0,0,0.20)]"
          : "border-gray-200 bg-white text-gray-800 hover:border-[#4285F4]/30 hover:bg-[#F9FBFD]",
        className,
      )}
      {...props}
      ref={ref}
      disabled={loading || props.disabled}
      onClick={handleClick}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <div className="flex w-full items-center justify-between transition-transform duration-300 group-hover/button-group:translate-y-[-130%]">
            <span>{children}</span>
            <span className="text-sm">→</span>
          </div>
          <div className="absolute mt-2 flex w-full translate-y-[130%] items-center justify-between px-4 transition-transform duration-300 group-hover/button-group:mt-0 group-hover/button-group:translate-y-0">
            <span>{children}</span>
            <span className="text-sm">→</span>
          </div>
        </>
      )}
    </Button>
  );
});
PricingCardButton.displayName = "PricingCardButton";

// Annual Switch
export const AnnualSwitch = ({
  isAnnualToggle,
  setIsAnnualToggle,
}: {
  isAnnualToggle: boolean;
  setIsAnnualToggle: (isAnnual: boolean) => void;
}) => {
  return (
    <div className="mb-6 flex items-center justify-center space-x-3 rounded-[15px] border border-white/60 bg-white/30 p-3 outline outline-1 outline-white/40">
      <span
        className={cn(
          "text-sm font-medium transition-colors",
          !isAnnualToggle ? "text-gray-800" : "text-zinc-600",
        )}
      >
        Monthly
      </span>
      <Switch
        id="annual-billing"
        checked={isAnnualToggle}
        onCheckedChange={setIsAnnualToggle}
      />
      <span
        className={cn(
          "text-sm font-medium transition-colors",
          isAnnualToggle ? "text-gray-800" : "text-zinc-600",
        )}
      >
        Annual
      </span>
    </div>
  );
};

export const RecommendedBadge = ({ recommended }: { recommended: string }) => {
  return (
    <div className="absolute right-[-1px] top-[-1px] rounded-[10px] border border-white/60 bg-white/50 px-3 py-0.5 text-sm font-medium text-gray-800 outline outline-1 outline-white/40 lg:right-4 lg:top-4 lg:rounded-full lg:py-1">
      {recommended}
    </div>
  );
};

export const ActivePlanBadge = () => {
  return (
    <div className="absolute right-[-1px] top-[-1px] rounded-md border border-[#4285F4]/60 bg-[#EAF2FF] px-3 py-0.5 text-sm font-semibold text-[#1557b0] shadow-sm lg:right-4 lg:top-4 lg:rounded-full lg:py-1">
      Current Plan
    </div>
  );
};

export const PendingDowngradeBadge = ({ date }: { date: string }) => {
  return (
    <div className="absolute right-[-1px] top-[-1px] flex flex-col items-end gap-0.5 rounded-md border border-amber-400/30 bg-amber-50 px-3 py-1 shadow-sm lg:right-4 lg:top-4">
      <span className="text-xs font-medium text-amber-700">Scheduled</span>
      <span className="text-[10px] text-amber-600">{date}</span>
    </div>
  );
};

// Compact Tier Card for collapsible section
const CompactTierCard = ({
  product,
  isCurrentPlan,
  customer,
  directPlanCheckout,
  onActionClick,
  isDirectPlanCheckoutLoading,
}: {
  product: Product;
  isCurrentPlan: boolean;
  currentPlanId?: string;
  customer: any;
  directPlanCheckout: any;
  vlyIntegrationsEnabled: boolean;
  onActionClick: (
    action: DowngradeCancelAction,
    planName: string,
    handler: () => void,
  ) => void;
  isDirectPlanCheckoutLoading: boolean;
}) => {
  const { display: productDisplay } = product;
  const communityBadgeTier = getCommunityBadgeTierForPlan(product.id);
  const tierPriceMap: Record<string, { price: number; credits: number }> = {
    priority_plan: {
      price: PLAN_PRICES.priority,
      credits: PLAN_BASE_CREDITS.priority,
    },
    ultra_plan: {
      price: PLAN_PRICES.ultra,
      credits: PLAN_BASE_CREDITS.ultra,
    },
    max_plan: { price: PLAN_PRICES.max, credits: PLAN_BASE_CREDITS.max },
    unlimited_plan: {
      price: PLAN_PRICES.unlimited,
      credits: PLAN_BASE_CREDITS.unlimited,
    },
  };

  const tierPriceInfo = tierPriceMap[product.id];
  const mainPriceDisplay = tierPriceInfo
    ? {
        primary_text: `$${tierPriceInfo.price}`,
        secondary_text: "/month",
      }
    : product.items[0]?.display;

  const directHandler = createDirectPlanCheckoutHandler({
    product,
    customer,
    directPlanCheckout,
  });
  const isDowngradeOrCancel =
    product.scenario === "downgrade" || product.scenario === "cancel";
  const wrappedHandler = () => {
    if (isDowngradeOrCancel) {
      onActionClick(
        product.scenario === "cancel" ? "cancel" : "downgrade",
        product.name,
        directHandler,
      );
    } else {
      return directHandler();
    }
  };

  const isActivePlan = isCurrentPlan || product.scenario === "active";
  let buttonText = "Upgrade";
  if (isActivePlan) {
    buttonText = "Current Plan";
  } else if (product.scenario === "upgrade") {
    buttonText = "Confirm Upgrade";
  } else if (product.scenario === "downgrade") {
    buttonText = "Downgrade";
  }

  // Get key features for compact display. Use TIER_LIMITS for hidden tiers so
  // we always show correct limits (e.g. Max = 100). Unlimited displays "Unlimited" but limit is 1000.
  const projectLimitByPlan: Record<string, number | "Unlimited"> = {
    priority_plan: TIER_LIMITS.priority.maxProjects,
    ultra_plan: TIER_LIMITS.ultra.maxProjects,
    max_plan: TIER_LIMITS.max.maxProjects,
    unlimited_plan: "Unlimited",
  };
  const overrideProjects = projectLimitByPlan[product.id];
  const maxProjects =
    overrideProjects === "Unlimited"
      ? "Unlimited"
      : typeof overrideProjects === "number"
        ? overrideProjects >= 1000
          ? overrideProjects.toLocaleString()
          : String(overrideProjects)
        : (() => {
            const maxProjectsItem = product.items.find(
              (item) => item.feature_id === "max_projects",
            );
            const raw = maxProjectsItem?.included_usage;
            if (raw === "inf") return "Unlimited";
            if (typeof raw === "number")
              return raw >= 1000 ? raw.toLocaleString() : String(raw);
            return "N/A";
          })();

  // Get team seats
  const teamSeatsItem = product.items.find(
    (item) => item.feature_id === "team_seats",
  );
  const teamSeats =
    teamSeatsItem?.included_usage === "inf"
      ? "Unlimited"
      : teamSeatsItem?.included_usage || 0;

  // Get total members
  const totalMembersItem = product.items.find(
    (item) => item.feature_id === "total_members",
  );
  const totalMembers =
    totalMembersItem?.included_usage === "inf"
      ? "Unlimited"
      : totalMembersItem?.included_usage || 1;

  // Get tier-specific new features and previous tier for "Everything in X, plus:"
  const tierProgression: Record<
    string,
    { previous: string; features: readonly string[] }
  > = {
    priority_plan: { previous: "Scale", features: BOOLEAN_FEATURES.priority },
    ultra_plan: { previous: "Priority", features: BOOLEAN_FEATURES.ultra },
    max_plan: { previous: "Ultra", features: BOOLEAN_FEATURES.max },
    unlimited_plan: { previous: "Max", features: BOOLEAN_FEATURES.unlimited },
  };

  // Key upgrade labels for each hidden tier (cumulative). Used in "Everything in X, plus:".
  const compactTierKeyUpgrades: Record<string, string[]> = {
    priority_plan: ["Personal Phone Number of Founder"],
    ultra_plan: [
      "Personal Phone Number of Founder",
      "High Priority Support",
      "Hire Developers On-Demand",
    ],
    max_plan: [
      "Personal Phone Number of Founder",
      "High Priority Support",
      "Hire Developers On-Demand",
      "Maximum Support",
    ],
    unlimited_plan: [
      "Personal Phone Number of Founder",
      "High Priority Support",
      "Hire Developers On-Demand",
      "Maximum Support",
      "Unlimited Projects",
      "Unlimited everything",
    ],
  };

  const tierInfo = tierProgression[product.id];
  const previousTierName = tierInfo?.previous;
  const keyUpgradeLabels = compactTierKeyUpgrades[product.id] || [];

  // Get Convex resources
  const convexItems = product.items.filter(
    (item) =>
      (item.feature_id === "convex_function_calls" ||
        item.feature_id === "convex_compute" ||
        item.feature_id === "convex_database_bw" ||
        item.feature_id === "convex_file_bw") &&
      item.included_usage,
  );

  const fnCalls = convexItems.find(
    (item) => item.feature_id === "convex_function_calls",
  );
  const fnCallsVal =
    typeof fnCalls?.included_usage === "number"
      ? fnCalls.included_usage >= 1000000
        ? `${(fnCalls.included_usage / 1000000).toFixed(0)}M`
        : fnCalls.included_usage >= 1000
          ? `${(fnCalls.included_usage / 1000).toFixed(0)}K`
          : fnCalls.included_usage.toString()
      : fnCalls?.included_usage || "N/A";

  // Map product.id to tier name for TIER_HIGHLIGHTS
  const productIdToTierName: Record<string, string> = {
    priority_plan: "priority",
    ultra_plan: "ultra",
    max_plan: "max",
    unlimited_plan: "unlimited",
  };
  const tierName = productIdToTierName[product.id] as
    | "priority"
    | "ultra"
    | "max"
    | "unlimited"
    | undefined;
  const tierHighlights = tierName ? TIER_HIGHLIGHTS[tierName] : undefined;

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md",
        isActivePlan && "ring-2 ring-[#4285F4]/20",
      )}
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-4">
          {/* Plan Name & Price */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-800">
                {productDisplay?.name || product.name}
              </h4>
              {communityBadgeTier > 0 && (
                <CommunityBadge communityBadgeTier={communityBadgeTier} />
              )}
              {isActivePlan && (
                <span className="rounded-full border border-[#4285F4]/60 bg-[#EAF2FF] px-2 py-0.5 text-xs font-semibold text-[#1557b0] shadow-sm">
                  Current
                </span>
              )}
            </div>
            {/* 50% off badge for Priority, Ultra, Max, Unlimited */}
            {(() => {
              const originalPriceMap: Record<string, number> = {
                priority_plan: ORIGINAL_PRICES.priority,
                ultra_plan: ORIGINAL_PRICES.ultra,
                max_plan: ORIGINAL_PRICES.max,
                unlimited_plan: ORIGINAL_PRICES.unlimited,
              };
              const originalPrice = originalPriceMap[product.id];
              if (!originalPrice) return null;
              return (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-normal text-zinc-400 line-through">
                    ${originalPrice.toFixed(2)}
                  </span>
                  <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700">
                    50% off
                  </span>
                </div>
              );
            })()}
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-gray-900">
                {mainPriceDisplay?.primary_text}
              </span>
              {mainPriceDisplay?.secondary_text && (
                <span className="text-sm text-gray-600">
                  {mainPriceDisplay?.secondary_text}
                </span>
              )}
            </div>
            {/* Early user pricing for discounted tiers */}
            {[
              "priority_plan",
              "ultra_plan",
              "max_plan",
              "unlimited_plan",
            ].includes(product.id) && (
              <span className="text-[9px] font-medium text-[#4285F4]">
                Early user pricing
              </span>
            )}
          </div>

          {/* Action Button */}
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              disabled={
                product.scenario === "scheduled" ||
                isDirectPlanCheckoutLoading ||
                isActivePlan
              }
              onClick={wrappedHandler}
              className={cn(
                "h-9 min-w-[120px] rounded-md",
                isActivePlan
                  ? "bg-gray-100 text-gray-600"
                  : "bg-[#1a73e8] text-white hover:bg-[#1557b0]",
              )}
            >
              {isDirectPlanCheckoutLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                buttonText
              )}
            </Button>
            {(buttonText === "Upgrade" || buttonText === "Confirm Upgrade") && (
              <span className="text-[11px] font-normal text-gray-400">
                click to purchase.
              </span>
            )}
          </div>
        </div>

        {/* Key Stats Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Credits */}
          <div className="flex items-center gap-2">
            <VlyCoin size="sm" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800">
                {formatCredits(tierPriceInfo?.credits || 0)}
              </span>
              <span className="text-xs text-gray-500">credits/month</span>
              {tierPriceInfo && tierPriceInfo.credits > 0 && (
                <span className="text-xs font-medium text-green-600">
                  Worth $
                  {Math.round(
                    tierPriceInfo.credits / 1_000_000,
                  ).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Projects */}
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-gray-500" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800">
                {maxProjects}
              </span>
              <span className="text-xs text-gray-500">projects</span>
            </div>
          </div>

          {/* Team Seats */}
          {typeof teamSeats === "number" && teamSeats > 0 && (
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-gray-500" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-800">
                  {teamSeats}
                </span>
                <span className="text-xs text-gray-500">team seats</span>
              </div>
            </div>
          )}

          {/* Function Calls */}
          {fnCallsVal !== "N/A" && (
            <div className="flex items-center gap-2">
              <ConvexIcon size="sm" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-800">
                  {fnCallsVal}
                </span>
                <span className="text-xs text-gray-500">function calls</span>
              </div>
            </div>
          )}
        </div>

        {/* Everything in [previous], plus: */}
        {previousTierName && keyUpgradeLabels.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <div className="mb-2 rounded-md bg-[#EEF4FF] px-3 py-2 text-sm font-semibold text-[#1a73e8]">
              Everything in {previousTierName}, plus:
            </div>
            <div className="flex flex-wrap gap-3">
              {keyUpgradeLabels.map((label, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 rounded-md bg-[#F9FBFD] px-2.5 py-1.5"
                >
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                  <span className="text-xs font-medium text-gray-800">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Perks */}
        <div className="border-t border-gray-100 pt-3">
          <div className="mb-2 text-xs font-medium text-gray-600">
            Additional Perks:
          </div>
          <div className="space-y-1.5 text-xs text-gray-700">
            {/* Marketing highlights from TIER_HIGHLIGHTS */}
            {tierHighlights &&
              tierHighlights.map((highlight, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                  <span>{highlight}</span>
                </div>
              ))}
            {(totalMembers === "Unlimited" ||
              (typeof totalMembers === "number" && totalMembers > 1)) && (
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                <span>
                  {totalMembers === "Unlimited" ? "Unlimited" : totalMembers}{" "}
                  total members
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
              <span>All sandbox sizes (Small, Medium, Large)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
