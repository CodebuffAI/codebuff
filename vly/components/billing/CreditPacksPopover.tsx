"use client";

/**
 * Credit Packs Popover Component
 * A compact popover for purchasing credit packs from the credits display
 */

import { useState } from "react";
import { useCustomer } from "autumn-js/react";
import { Plus, RefreshCw, Zap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { oneTimeCreditPack, recurringCreditPack } from "@/autumn.config";
import { useDirectPlanCheckout } from "@/hooks/useDirectPlanCheckout";

// Credit pack options
const CREDIT_PACK_OPTIONS = {
  oneTime: {
    product: oneTimeCreditPack,
    label: "One-Time",
    amount: "15M credits",
    price: "$15",
  },
  recurring: {
    product: recurringCreditPack,
    label: "Monthly",
    amount: "15M/mo",
    price: "$12/mo",
  },
};

export function CreditPacksPopover() {
  const { refetch } = useCustomer();
  const { directPlanCheckout } = useDirectPlanCheckout();
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleBuyPack = async (productId: string, isRecurring: boolean) => {
    setIsPurchasing(productId);
    setOpen(false);

    try {
      await directPlanCheckout({
        productId,
        productName: isRecurring
          ? "Monthly Credit Pack"
          : "One-Time Credit Pack",
        isSubscriptionUpgrade: false,
      });
      toast.success(
        isRecurring
          ? "Monthly credits activated! Manage from billing."
          : "Credits purchased!",
      );
      await refetch();
    } catch (error: any) {
      const redirectUrl =
        error?.url || error?.data?.url || (error as any)?.checkout_url;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      toast.error(error?.message || "Failed to purchase credits.");
    } finally {
      setIsPurchasing(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                disabled={isPurchasing !== null}
                className="group relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-purple-300/40 bg-gradient-to-r from-purple-50/80 to-purple-100/70 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-purple-400/60 hover:from-purple-100/90 hover:to-purple-200/80 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPurchasing !== null ? (
                  <div className="h-3 w-3 animate-spin rounded-full border border-purple-600 border-t-transparent" />
                ) : (
                  <Plus className="h-3 w-3 text-purple-700" />
                )}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Buy Credits</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Get Credits</h4>
          <div className="space-y-2">
            {/* Recurring option */}
            <button
              onClick={() =>
                handleBuyPack(CREDIT_PACK_OPTIONS.recurring.product.id, true)
              }
              disabled={isPurchasing !== null}
              className="group relative flex w-full items-center justify-between rounded-lg border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-2.5 text-left transition-all hover:border-green-300 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="absolute -top-1.5 left-2 rounded bg-green-600 px-1 py-0.5 text-[8px] font-bold text-white">
                SAVE $3
              </div>
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-green-600" />
                <div>
                  <div className="text-xs font-semibold text-zinc-900">
                    {CREDIT_PACK_OPTIONS.recurring.label}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {CREDIT_PACK_OPTIONS.recurring.amount}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isPurchasing === CREDIT_PACK_OPTIONS.recurring.product.id ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                ) : (
                  <span className="text-xs font-bold text-green-700">
                    {CREDIT_PACK_OPTIONS.recurring.price}
                  </span>
                )}
              </div>
            </button>

            {/* One-time option */}
            <button
              onClick={() =>
                handleBuyPack(CREDIT_PACK_OPTIONS.oneTime.product.id, false)
              }
              disabled={isPurchasing !== null}
              className="group flex w-full items-center justify-between rounded-lg border border-amber-200/60 bg-gradient-to-r from-amber-50/60 to-white/60 p-2.5 text-left transition-all hover:border-amber-300/80 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-amber-600" />
                <div>
                  <div className="text-xs font-semibold text-zinc-900">
                    {CREDIT_PACK_OPTIONS.oneTime.label}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {CREDIT_PACK_OPTIONS.oneTime.amount}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isPurchasing === CREDIT_PACK_OPTIONS.oneTime.product.id ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                ) : (
                  <span className="text-xs font-bold text-amber-700">
                    {CREDIT_PACK_OPTIONS.oneTime.price}
                  </span>
                )}
              </div>
            </button>
          </div>
          <p className="text-[9px] text-zinc-400">
            Monthly packs auto-renew. Cancel anytime from billing.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
