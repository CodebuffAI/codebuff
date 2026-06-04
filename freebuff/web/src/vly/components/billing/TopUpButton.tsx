"use client";

/**
 * Top-Up Button Component
 * Displays a popover with pack options for purchasing additional credits
 */

import { useState } from "react";
import { useCustomer } from "autumn-js/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/vly/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/vly/components/ui/popover";

interface PackOption {
  id: string;
  label: string;
  amount: string;
  price: string;
}

interface TopUpButtonProps {
  packOptions: PackOption[];
  disabled?: boolean;
  checkoutDialog: any;
}

export function TopUpButton({
  packOptions,
  disabled,
  checkoutDialog,
}: TopUpButtonProps) {
  const { checkout } = useCustomer({
    expand: ["payment_method"],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleTopUp = async (productId: string) => {
    setIsLoading(true);
    setOpen(false);
    try {
      // Autumn's checkout handles missing payment methods automatically
      // It will redirect to Stripe to add payment, then complete the purchase
      await checkout({
        productId,
        dialog: checkoutDialog,
      });
    } catch (error) {
      console.error("Top up error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                disabled={disabled || isLoading}
                className="group relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-purple-300/40 bg-gradient-to-r from-purple-50/80 to-purple-100/70 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-purple-400/60 hover:from-purple-100/90 hover:to-purple-200/80 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="h-3 w-3 animate-spin rounded-full border border-purple-600 border-t-transparent" />
                ) : (
                  <Plus className="h-3 w-3 text-purple-700" />
                )}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Buy More</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-zinc-900">
            Choose Pack Size
          </h4>
          <div className="space-y-2">
            {packOptions.map((pack) => (
              <button
                key={pack.id}
                onClick={() => handleTopUp(pack.id)}
                className="group flex w-full items-center justify-between rounded-lg border border-purple-200/40 bg-gradient-to-r from-purple-50/60 to-white/60 p-3 text-left transition-all hover:border-purple-300/60 hover:from-purple-100/80 hover:to-purple-50/80 hover:shadow-sm active:scale-[0.98]"
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold text-zinc-900">
                    {pack.label}
                  </div>
                  <div className="text-xs text-zinc-600">{pack.amount}</div>
                </div>
                <div className="ml-3 text-sm font-bold text-purple-700">
                  {pack.price}
                </div>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
