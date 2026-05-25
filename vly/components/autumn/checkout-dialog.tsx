"use client";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import React, { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCheckoutContent } from "@/lib/autumn/checkout-content";
import { useCustomer } from "autumn-js/react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
// Note: Popover, PopoverContent, PopoverTrigger, and Input imports removed - no longer used after removing dropdown
import type { CheckoutParams, CheckoutResult, ProductItem } from "autumn-js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import { useConfetti } from "@/hooks/use-confetti";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Feature ID for agent credits
const AGENT_CREDITS_FEATURE_ID = "agent_credits";

export interface CheckoutDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  checkoutResult: CheckoutResult;
  checkoutParams?: CheckoutParams;
}

const formatCurrency = ({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
};

export default function CheckoutDialog(params: CheckoutDialogProps) {
  const router = useRouter();
  const { attach, checkout, refetch, customer } = useCustomer();
  const { fireUpgrade, firePurchase } = useConfetti();
  const unpauseDeployments = useAction(
    api.deployment_management.unpauseCurrentUserDeployments,
  );
  const grantUpgradeBonusCredits = useAction(
    api.autumn.grantUpgradeBonusCredits,
  );
  const [checkoutResult, setCheckoutResult] = useState<
    CheckoutResult | undefined
  >(params?.checkoutResult);

  const [loading, setLoading] = useState(false);
  const [initialUpdateDone, setInitialUpdateDone] = useState(false);

  // Use ref to track if we should update to avoid synchronous setState in effect
  const shouldUpdateRef = useRef(true);
  const prevParamsRef = useRef<{
    checkoutResult?: CheckoutResult;
    checkoutParams?: CheckoutParams;
  }>({});

  // Reset update flags when dialog opens or params change
  useEffect(() => {
    const paramsChanged =
      prevParamsRef.current.checkoutResult?.product.id !==
        params.checkoutResult?.product.id ||
      JSON.stringify(prevParamsRef.current.checkoutParams?.options) !==
        JSON.stringify(params.checkoutParams?.options);

    if (params.open && paramsChanged) {
      queueMicrotask(() => {
        setInitialUpdateDone(false);
        shouldUpdateRef.current = true;
        prevParamsRef.current = {
          checkoutResult: params.checkoutResult,
          checkoutParams: params.checkoutParams,
        };
      });
    }
  }, [params.open, params.checkoutResult, params.checkoutParams]);

  // Auto-update prepaid quantities when dialog opens with custom values
  useEffect(() => {
    if (
      params.checkoutResult &&
      params.checkoutParams?.options &&
      params.open &&
      !initialUpdateDone &&
      shouldUpdateRef.current
    ) {
      console.log("💳 CHECKOUT DIALOG RECEIVED checkoutResult:", {
        productId: params.checkoutResult.product.id,
        productName: params.checkoutResult.product.name,
        total: params.checkoutResult.total,
        receivedOptions: params.checkoutResult.options,
        desiredOptions: params.checkoutParams.options,
      });

      // Check if any prepaid items have different quantities than desired
      const needsUpdate = params.checkoutParams.options.some(
        (desiredOption: any) => {
          const receivedOption = params.checkoutResult.options.find(
            (opt) => opt.feature_id === desiredOption.featureId,
          );
          return (
            receivedOption && receivedOption.quantity !== desiredOption.quantity
          );
        },
      );

      if (needsUpdate) {
        console.log("💳 CHECKOUT DIALOG: Auto-updating prepaid quantities");

        // Re-checkout with the desired options to get updated pricing
        // Autumn expects camelCase featureId in the options
        const autumnOptions = (params.checkoutParams.options as any[]).map(
          (opt: any) => ({
            featureId: opt.featureId,
            quantity: opt.quantity,
          }),
        );

        checkout({
          productId: params.checkoutResult.product.id,
          options: autumnOptions,
          dialog: CheckoutDialog,
        }).then(({ data, error }) => {
          if (error) {
            console.error(
              "Failed to update checkout with desired quantities:",
              error,
            );
            // Still show the dialog with default quantities
            setCheckoutResult(params.checkoutResult);
          } else if (data) {
            console.log(
              "💳 CHECKOUT DIALOG: Successfully updated with desired quantities:",
              {
                newTotal: data.total,
                newOptions: data.options,
              },
            );
            setCheckoutResult(data);
          }
          setInitialUpdateDone(true);
          shouldUpdateRef.current = false;
        });
      } else {
        // Initialize state from props, but do it asynchronously to avoid synchronous setState
        queueMicrotask(() => {
          setCheckoutResult(params.checkoutResult);
          setInitialUpdateDone(true);
          shouldUpdateRef.current = false;
        });
      }
    } else if (
      params.checkoutResult &&
      params.open &&
      shouldUpdateRef.current
    ) {
      // Initialize state from props, but do it asynchronously to avoid synchronous setState
      queueMicrotask(() => {
        setCheckoutResult(params.checkoutResult);
        setInitialUpdateDone(true);
        shouldUpdateRef.current = false;
      });
    }
  }, [
    params.checkoutResult,
    params.checkoutParams,
    params.open,
    checkout,
    initialUpdateDone,
  ]);

  if (!checkoutResult) {
    return <></>;
  }

  const { open, setOpen } = params;
  const { title, message } = getCheckoutContent(checkoutResult);

  const isFree = checkoutResult?.product.properties?.is_free;
  const isPaid = isFree === false;

  // Check if this is an upgrade scenario and user has billing attached
  const isUpgradeScenario = checkoutResult?.product.scenario === "upgrade";
  const hasBillingAttached = !!customer?.payment_method;
  const shouldShowConfirmUpgrade = isUpgradeScenario && hasBillingAttached;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 pt-4 text-sm text-foreground">
        <DialogTitle className="mb-1 px-6">{title}</DialogTitle>
        <div className="mb-4 mt-1 px-6 text-muted-foreground">{message}</div>

        {isPaid && checkoutResult && (
          <PriceInformation checkoutResult={checkoutResult} />
        )}

        <DialogFooter className="flex flex-col justify-between gap-x-4 border-t bg-secondary py-2 pl-6 pr-3 shadow-inner sm:flex-row">
          <Button
            size="sm"
            onClick={async () => {
              setLoading(true);

              console.log("[CheckoutDialog] Starting checkout:", {
                productId: checkoutResult.product.id,
                productName: checkoutResult.product.name,
                scenario: checkoutResult.product.scenario,
                total: checkoutResult.total,
              });

              const options = checkoutResult.options.map((option) => {
                return {
                  featureId: option.feature_id,
                  quantity: option.quantity,
                };
              });

              try {
                // Capture current credit balance BEFORE the upgrade
                // This will be granted back as a bonus after the upgrade
                const currentBalance =
                  (customer?.features as any)?.[AGENT_CREDITS_FEATURE_ID]
                    ?.balance ?? 0;
                const isSubscriptionUpgrade =
                  !checkoutResult.product.properties?.is_one_off;

                console.log(
                  "[CheckoutDialog] Pre-upgrade credit balance:",
                  currentBalance,
                  "isSubscriptionUpgrade:",
                  isSubscriptionUpgrade,
                );

                const isStarterUpgrade =
                  checkoutResult.product.id === "starter_plan";
                const attachResult = await attach({
                  productId: checkoutResult.product.id,
                  ...(params.checkoutParams || {}),
                  options,
                  successUrl: isStarterUpgrade
                    ? `${window.location.origin}/dashboard/billing?upgraded=starter`
                    : `${window.location.origin}/dashboard/billing`,
                });

                console.log("[CheckoutDialog] Attach result:", attachResult);

                // If this was a subscription upgrade (not add-on/one-off) and user had credits,
                // grant them back as a bonus so they don't lose their remaining credits
                if (isSubscriptionUpgrade && currentBalance > 0) {
                  try {
                    const bonusResult = await grantUpgradeBonusCredits({
                      featureId: AGENT_CREDITS_FEATURE_ID,
                      amount: currentBalance,
                      reason: `Credits preserved from previous plan (upgrade to ${checkoutResult.product.name})`,
                    });

                    if (bonusResult.success) {
                      console.log(
                        `[CheckoutDialog] Granted ${currentBalance} bonus credits from previous plan`,
                      );
                    } else {
                      console.error(
                        "[CheckoutDialog] Failed to grant bonus credits:",
                        bonusResult.error,
                      );
                    }
                  } catch (bonusError) {
                    console.error(
                      "[CheckoutDialog] Error granting bonus credits:",
                      bonusError,
                    );
                    // Don't block the upgrade - the user still got their new plan
                  }
                }

                // Fire confetti for successful purchase
                const isOneOff = checkoutResult.product.properties?.is_one_off;

                if (isOneOff) {
                  firePurchase();
                } else {
                  fireUpgrade();
                }

                // Refetch customer balance to update UI with new plan's usage data
                try {
                  await refetch();
                  console.log(
                    "[CheckoutDialog] Customer data refetched successfully",
                  );
                } catch (refetchError) {
                  console.error(
                    "[CheckoutDialog] Failed to refetch customer balance:",
                    refetchError,
                  );
                  // Don't block the UI - balance will refresh on next page load
                }

                // Trigger unpause check for any successful payment (top-ups, upgrades, etc.)
                try {
                  const unpauseResult = await unpauseDeployments();

                  if (unpauseResult.unpaused && unpauseResult.success) {
                    toast.success(
                      `Deployments unpaused! Restarting ${unpauseResult.successCount} deployment${unpauseResult.successCount !== 1 ? "s" : ""}...`,
                    );
                  } else if (!unpauseResult.unpaused && unpauseResult.message) {
                    // Only show error if there was actually a pause record that couldn't be unpaused
                    // Don't show errors for users who weren't paused
                    console.log(
                      "[CheckoutDialog] Unpause check result:",
                      unpauseResult.message,
                    );
                  }
                } catch (unpauseError) {
                  console.error(
                    "[CheckoutDialog] Failed to trigger unpause check:",
                    unpauseError,
                  );
                  // Don't block the UI - unpause will happen via cron if this fails
                }

                toast.success(
                  `Successfully subscribed to ${checkoutResult.product.name}!`,
                );

                if (isStarterUpgrade) {
                  router.replace("/dashboard/billing?upgraded=starter");
                }
              } catch (error: any) {
                console.error("[CheckoutDialog] Checkout error:", {
                  error,
                  message: error?.message,
                  code: error?.code,
                  data: error?.data,
                  productId: checkoutResult.product.id,
                });

                // Check if error contains a redirect URL (Stripe checkout)
                const redirectUrl =
                  error?.url ||
                  error?.data?.url ||
                  (error as any)?.checkout_url;
                if (redirectUrl) {
                  console.log(
                    "[CheckoutDialog] Redirecting to Stripe:",
                    redirectUrl,
                  );
                  window.location.href = redirectUrl;
                  return;
                }

                const errorMessage =
                  error?.message || error?.data?.message || "Checkout failed";
                toast.error(errorMessage);
              }

              setOpen(false);
              setLoading(false);
            }}
            disabled={loading}
            className="flex min-w-16 items-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span className="flex gap-1 whitespace-nowrap">
                  {shouldShowConfirmUpgrade ? "Confirm Upgrade" : "Confirm"}
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceInformation({
  checkoutResult,
}: {
  checkoutResult: CheckoutResult;
}) {
  return (
    <div className="mb-4 flex flex-col gap-4 px-6">
      <ProductItems checkoutResult={checkoutResult} />

      <div className="flex flex-col gap-2">
        {checkoutResult?.has_prorations && checkoutResult.lines.length > 0 && (
          <CheckoutLines checkoutResult={checkoutResult} />
        )}
        <DueAmounts checkoutResult={checkoutResult} />
      </div>
    </div>
  );
}

/**
 * Calculate the correct next cycle total for prepaid update scenarios
 *
 * Autumn's next_cycle.total sometimes excludes the base subscription price
 * when updating prepaid plans, only including the prepaid feature cost.
 * This function corrects that by adding the base subscription price.
 */
function calculateCorrectNextCycleTotal(
  checkoutResult: CheckoutResult,
): number {
  const { next_cycle, product } = checkoutResult;

  if (!next_cycle) return 0;

  // Check if this is an "Update Plan" scenario with prepaid items
  const isUpdateScenario =
    product.scenario === "active" && product.properties.updateable;
  const hasPrepaidItems = product.items.some(
    (item) => item.usage_model === "prepaid",
  );

  // Only apply correction for update scenarios with prepaid items
  if (!isUpdateScenario || !hasPrepaidItems) {
    return next_cycle.total;
  }

  // Find the base subscription price (items with type "price" that aren't usage-based)
  let baseSubscriptionPrice = 0;

  for (const item of product.items) {
    // Base subscription items have type "price" and no usage_model
    if (item.type === "price" && !item.usage_model && item.price) {
      baseSubscriptionPrice += item.price;
    }
  }

  // For prepaid updates, Autumn's next_cycle.total only includes the prepaid cost
  // We need to add the base subscription price to get the correct total
  if (baseSubscriptionPrice > 0) {
    return baseSubscriptionPrice + next_cycle.total;
  }

  // Otherwise, return the original next_cycle.total
  return next_cycle.total;
}

function DueAmounts({ checkoutResult }: { checkoutResult: CheckoutResult }) {
  const { next_cycle, product } = checkoutResult;
  const nextCycleAtStr = next_cycle
    ? new Date(next_cycle.starts_at).toLocaleDateString()
    : undefined;

  const hasUsagePrice = product.items.some(
    (item) => item.usage_model === "pay_per_use",
  );

  // Calculate the correct next cycle total (fixes prepaid update scenarios)
  const nextCycleTotal = next_cycle
    ? calculateCorrectNextCycleTotal(checkoutResult)
    : 0;

  const showNextCycle = next_cycle && nextCycleTotal !== checkoutResult.total;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <div>
          <p className="text-md font-medium">Total due today</p>
        </div>

        <p className="text-md font-medium">
          {formatCurrency({
            amount: checkoutResult?.total,
            currency: checkoutResult?.currency,
          })}
        </p>
      </div>
      {showNextCycle && (
        <div className="flex justify-between text-muted-foreground">
          <div>
            <p className="text-md">Due next cycle ({nextCycleAtStr})</p>
          </div>
          <p className="text-md">
            {formatCurrency({
              amount: nextCycleTotal,
              currency: checkoutResult?.currency,
            })}
            {hasUsagePrice && <span> + usage prices</span>}
          </p>
        </div>
      )}
    </div>
  );
}

function ProductItems({ checkoutResult }: { checkoutResult: CheckoutResult }) {
  const isUpdateQuantity =
    checkoutResult?.product.scenario === "active" &&
    checkoutResult.product.properties.updateable;

  const isOneOff = checkoutResult?.product.properties.is_one_off;

  // Deduplicate items by feature_id to prevent duplicate display
  const uniqueItems =
    checkoutResult?.product.items
      .filter((item) => item.type !== "feature")
      .filter((item, index, self) => {
        // For items with feature_id, keep only the first occurrence
        if (item.feature_id) {
          return (
            self.findIndex((i) => i.feature_id === item.feature_id) === index
          );
        }
        // For price items (no feature_id), keep only the first one
        return self.findIndex((i) => !i.feature_id) === index;
      }) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Price</p>
      {uniqueItems.map((item, index) => {
        if (item.usage_model == "prepaid") {
          return (
            <PrepaidItem
              key={index}
              item={item}
              checkoutResult={checkoutResult}
            />
          );
        }

        if (isUpdateQuantity) {
          return null;
        }

        return (
          <div key={index} className="flex justify-between">
            <p className="text-muted-foreground">
              {item.feature
                ? item.feature.name
                : isOneOff
                  ? "Price"
                  : "Subscription"}
            </p>
            <p>
              {item.display?.primary_text} {item.display?.secondary_text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CheckoutLines({ checkoutResult }: { checkoutResult: CheckoutResult }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="total" className="border-b-0">
        <CustomAccordionTrigger className="my-0 w-full justify-between border-none py-0">
          <div className="flex w-full cursor-pointer items-center justify-end gap-1">
            <p className="font-light text-muted-foreground">View details</p>
            <ChevronDown
              className="mt-0.5 rotate-90 text-muted-foreground transition-transform duration-200 ease-in-out"
              size={14}
            />
          </div>
        </CustomAccordionTrigger>
        <AccordionContent className="mb-0 mt-2 flex flex-col gap-2 pb-2">
          {checkoutResult?.lines
            .filter((line) => line.amount != 0)
            .map((line, index) => {
              return (
                <div key={index} className="flex justify-between">
                  <p className="text-muted-foreground">{line.description}</p>
                  <p className="text-muted-foreground">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: checkoutResult?.currency,
                    }).format(line.amount)}
                  </p>
                </div>
              );
            })}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function CustomAccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]_svg]:rotate-0",
          className,
        )}
        {...props}
      >
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

const PrepaidItem = ({
  item,
  checkoutResult,
}: {
  item: ProductItem;
  checkoutResult: CheckoutResult;
}) => {
  const {
    included_usage: includedUsage,
    billing_units: billingUnits,
    price,
    feature_id: featureId,
  } = item;

  // Get the base credits from included_usage
  const baseCredits = typeof includedUsage === "number" ? includedUsage : 0;

  // Find the additional prepaid quantity from checkout options
  const option = checkoutResult.options?.find(
    (opt) => opt.feature_id === featureId,
  );
  const additionalCredits = option?.quantity ?? 0;

  // Calculate total credits (base + additional prepaid)
  const totalCredits = baseCredits + additionalCredits;

  // Format the total credits amount
  const formattedCredits = totalCredits.toLocaleString();

  // Format billing info
  const billingInfo =
    billingUnits && price
      ? `then $${price} per ${billingUnits.toLocaleString()} agent tokens`
      : "";

  return (
    <div className="flex justify-between gap-2">
      <div className="flex items-start gap-2">
        <p className="whitespace-nowrap text-muted-foreground">
          {item.feature?.name === "Agent Credits"
            ? "Agent Tokens"
            : item.feature?.name}
        </p>
      </div>
      <div className="text-end">
        <p>{formattedCredits} agent tokens</p>
        {billingInfo && <p>{billingInfo}</p>}
      </div>
    </div>
  );
};

export const PriceItem = ({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-1 pb-4 sm:h-7 sm:flex-row sm:items-center sm:gap-2 sm:pb-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const PricingDialogButton = ({
  children,
  size,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  size?: "sm" | "lg" | "default" | "icon";
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size={size}
      className={cn(className, "shadow-sm shadow-stone-400")}
    >
      {children}
      <ArrowRight className="!h-3" />
    </Button>
  );
};
