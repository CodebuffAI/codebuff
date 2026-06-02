"use client";

/**
 * Payment Method Display Component
 * Shows payment method details and action buttons
 */

import { useState } from "react";
import { Settings, Edit, Plus, Zap } from "lucide-react";

interface PaymentMethod {
  card?: {
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
  };
}

interface PaymentMethodDisplayProps {
  paymentMethod?: PaymentMethod | null;
  isFreePlan: boolean;
  loadingStates: {
    setup: boolean;
    update: boolean;
    upgrade: boolean;
  };
  onManageBilling: () => void;
  onSetupPayment: () => void;
  onUpdatePayment: () => void;
  onQuickUpgrade?: () => void;
  upgradePlanName?: string;
}

export function PaymentMethodDisplay({
  paymentMethod,
  isFreePlan,
  loadingStates,
  onManageBilling,
  onSetupPayment,
  onUpdatePayment,
  onQuickUpgrade,
  upgradePlanName = "Hobby",
}: PaymentMethodDisplayProps) {
  const [cardDetailsVisible, setCardDetailsVisible] = useState(false);

  return (
    <div className="border-t border-white/50 bg-white/10 px-8 py-3 backdrop-blur-sm sm:py-2">
      <div className="mb-3 flex items-center justify-between sm:mb-2">
        <span className="text-xs font-medium text-zinc-800">
          Payment Method
        </span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {paymentMethod ? (
            <button
              onClick={() => setCardDetailsVisible(!cardDetailsVisible)}
              className="group flex min-w-0 cursor-pointer items-center gap-2 text-xs text-zinc-600 transition-colors hover:text-zinc-800"
            >
              <span
                className={`whitespace-nowrap transition-all duration-200 ${!cardDetailsVisible ? "blur-sm" : ""}`}
              >
                {paymentMethod.card?.brand?.toUpperCase() || "VISA"} ••••
                {paymentMethod.card?.last4 || "4242"}
              </span>
              <span
                className={`whitespace-nowrap text-zinc-500 transition-all duration-200 ${!cardDetailsVisible ? "blur-sm" : ""}`}
              >
                {paymentMethod.card?.exp_month?.toString().padStart(2, "0") ||
                  "12"}
                /{paymentMethod.card?.exp_year?.toString().slice(-2) || "34"}
              </span>
              <span className="whitespace-nowrap text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                {cardDetailsVisible ? "Hide" : "Show"}
              </span>
            </button>
          ) : (
            <span className="text-xs text-zinc-500">
              No payment method configured
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {paymentMethod ? (
            <>
              <button
                onClick={onManageBilling}
                className="hover:bg-gradient-radial relative flex h-7 items-center justify-center gap-1 overflow-hidden rounded-[8px] border border-white/60 bg-white/40 px-2.5 py-1 text-xs font-medium text-zinc-800 outline outline-1 outline-white/40 backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent"
              >
                <Settings className="h-3 w-3" />
                Billing Portal
              </button>
              <button
                onClick={onUpdatePayment}
                disabled={loadingStates.update}
                className="hover:bg-gradient-radial relative flex h-7 items-center justify-center gap-1 overflow-hidden rounded-[8px] border border-white/60 bg-white/40 px-2 py-1 text-xs font-medium text-zinc-800 outline outline-1 outline-white/40 backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent disabled:opacity-50"
              >
                {loadingStates.update ? (
                  <div className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-transparent" />
                ) : (
                  <Edit className="h-3 w-3" />
                )}
                Update
              </button>
            </>
          ) : (
            <button
              onClick={onSetupPayment}
              disabled={loadingStates.setup}
              className="hover:bg-gradient-radial relative flex h-7 items-center justify-center gap-1 overflow-hidden rounded-[8px] border border-white/60 bg-white/40 px-2.5 py-1 text-xs font-medium text-zinc-800 outline outline-1 outline-white/40 backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent disabled:opacity-50"
            >
              {loadingStates.setup ? (
                <div className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-transparent" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Add Payment
            </button>
          )}
          {isFreePlan && paymentMethod && onQuickUpgrade && (
            <button
              onClick={onQuickUpgrade}
              disabled={loadingStates.upgrade}
              className="hover:bg-gradient-radial relative flex h-7 items-center justify-center gap-1 overflow-hidden rounded-[8px] border border-white/60 bg-white/50 px-2.5 py-1 text-xs font-medium text-zinc-800 outline outline-1 outline-white/40 backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent disabled:opacity-50"
            >
              {loadingStates.upgrade ? (
                <div className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-transparent" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Upgrade to {upgradePlanName}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
