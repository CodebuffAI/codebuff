"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUserCreditBalances } from "@/hooks/useUserCreditBalances";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  User,
  Plus,
  Minus,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { calculatePlatformCost, formatCost } from "@/lib/billing";
import { toast } from "sonner";

import {
  CREDIT_TYPES,
  CREDIT_NAME_ABBREVIATIONS,
  CREDIT_UNITS,
  CREDIT_INCREMENTS,
  CREDIT_INPUT_UNITS,
} from "../constants";
import {
  formatBalanceCompact,
  formatBalanceDetailed,
  getFreePlanDefaults,
} from "../utils";
import { EmptyState } from "../shared";
import { UserInfo } from "../types";

interface UserCreditsTabProps {
  selectedUser: UserInfo | null;
  onClose: () => void;
}

export function UserCreditsTab({ selectedUser, onClose }: UserCreditsTabProps) {
  const queryClient = useQueryClient();
  const grantCreditsAction = useAction(api.admin.grantCreditsToUser);

  // Fetch credit balances using React Query (Suspense)
  const { data: creditBalancesData } = useUserCreditBalances(
    selectedUser?.clerk_id,
  );

  // Mutation for granting credits
  const grantCreditsMutation = useMutation({
    mutationFn: async (params: {
      clerkId: string;
      featureId: string;
      amount: number;
      reason?: string;
    }) => {
      return await grantCreditsAction(params);
    },
    onSuccess: () => {
      // Invalidate and refetch credit balances
      queryClient.invalidateQueries({
        queryKey: ["userCreditBalances", selectedUser?.clerk_id],
      });
    },
  });

  const [creditType, setCreditType] = useState<string>("agent_credits");
  // Initialize amount with default value for initial credit type
  const getDefaultAmount = (type: string) => {
    const defaults = getFreePlanDefaults();
    const defaultValue = defaults[type];
    return defaultValue !== undefined ? String(defaultValue) : "";
  };
  const [amount, setAmount] = useState<string>(() =>
    getDefaultAmount("agent_credits"),
  );
  const [reason, setReason] = useState<string>("Admin grant");
  const [isCustomReason, setIsCustomReason] = useState(false);
  const [mode, setMode] = useState<"grant" | "deduct">("grant");

  // Handler to update credit type and set default amount
  const handleCreditTypeChange = (newCreditType: string) => {
    setCreditType(newCreditType);
    const defaults = getFreePlanDefaults();
    const defaultValue = defaults[newCreditType];
    if (defaultValue !== undefined) {
      setAmount(String(defaultValue));
    }
  };

  const handleGrant = async () => {
    if (!selectedUser) {
      toast.error("Please select a user");
      return;
    }

    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid positive amount");
      return;
    }

    // Confirmation for large amounts
    if (amountNum > 100000) {
      if (
        !confirm(
          `You are about to ${mode} ${amountNum.toLocaleString()} credits. Are you sure?`,
        )
      ) {
        return;
      }
    }

    try {
      const finalAmount = mode === "deduct" ? amountNum : -amountNum;

      await grantCreditsMutation.mutateAsync({
        clerkId: selectedUser.clerk_id,
        featureId: creditType,
        amount: finalAmount,
        reason: reason || undefined,
      });

      const action = mode === "grant" ? "granted" : "deducted";
      const preposition = mode === "grant" ? "to" : "from";
      toast.success(
        `Successfully ${action} ${amountNum.toLocaleString()} credits ${preposition} ${selectedUser.email}`,
      );

      // Reset form
      setAmount("");
      setReason("Admin grant");
      setIsCustomReason(false);
      onClose();
    } catch (error) {
      console.error("Failed to grant credits:", error);
      toast.error(
        `Failed to ${mode} credits: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  if (!selectedUser) {
    return (
      <EmptyState icon={User} title="Please select a user to manage credits" />
    );
  }

  return (
    <div className="grid gap-4">
      {/* Compact Credit Form */}
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/50 p-4 shadow-sm">
        {/* Balance Selection + Grant/Deduct */}
        {creditBalancesData?.balances ? (
          <div className="grid gap-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
              Select Credit Type
            </div>
            <TooltipProvider>
              <div className="flex gap-1 overflow-x-auto rounded-md border border-blue-200 bg-blue-50/30 p-1">
                {creditBalancesData.balances.map((credit: any) => {
                  const isSelected = credit.featureId === creditType;
                  const balance = credit.balance;
                  const isUnlimited =
                    credit.unlimited || balance === "unlimited";
                  const rawBalance = isUnlimited
                    ? "Unlimited"
                    : formatBalanceDetailed(balance);
                  const formattedBalance = isUnlimited
                    ? "∞"
                    : formatBalanceCompact(balance);
                  const shortName =
                    CREDIT_NAME_ABBREVIATIONS[credit.featureId] || credit.name;
                  const unit = CREDIT_UNITS[credit.featureId] || "";
                  const displayValue = unit
                    ? `${formattedBalance} ${unit}`
                    : formattedBalance;

                  return (
                    <Tooltip key={credit.featureId}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() =>
                            handleCreditTypeChange(credit.featureId)
                          }
                          className={cn(
                            "flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-md border px-1.5 py-1 transition-all",
                            isSelected
                              ? "border-blue-500 bg-blue-100 shadow-sm"
                              : "border-transparent bg-white/50 hover:border-blue-300 hover:bg-blue-50/70 hover:shadow-sm",
                          )}
                        >
                          <span
                            className={cn(
                              "whitespace-nowrap text-[10px] font-bold tabular-nums leading-tight",
                              isSelected ? "text-blue-900" : "text-zinc-900",
                            )}
                          >
                            {displayValue}
                          </span>
                          <span
                            className={cn(
                              "whitespace-nowrap text-[8px] font-medium leading-tight",
                              isSelected ? "text-blue-700" : "text-zinc-600",
                            )}
                          >
                            {shortName}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-semibold">{credit.name}</div>
                          <div className="text-zinc-300">{rawBalance}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        ) : null}

        {/* Amount/Reason/Custom Reason and Receipt */}
        <div className="grid grid-cols-5 gap-4">
          {/* Left Column: Amount + Action + Reason + Custom Reason */}
          <div className="col-span-2 space-y-3">
            {/* Amount with integrated Action toggle */}
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
                Amount
              </Label>
              <div className="relative">
                {/* Action Toggle - Icon Only */}
                <button
                  type="button"
                  onClick={() => setMode(mode === "grant" ? "deduct" : "grant")}
                  className={cn(
                    "absolute inset-y-0 left-0 flex w-8 cursor-pointer items-center justify-center rounded-l border-r transition-all hover:opacity-80",
                    mode === "grant"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700",
                  )}
                  title={
                    mode === "grant"
                      ? "Grant (click to switch to Deduct)"
                      : "Deduct (click to switch to Grant)"
                  }
                >
                  {mode === "grant" ? (
                    <Plus className="h-4 w-4" />
                  ) : (
                    <Minus className="h-4 w-4" />
                  )}
                </button>

                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Prevent negative values
                    if (value === "" || parseFloat(value) >= 0) {
                      setAmount(value);
                    }
                  }}
                  onKeyDown={(e) => {
                    // Prevent minus, plus, and 'e' characters
                    if (
                      e.key === "-" ||
                      e.key === "+" ||
                      e.key === "e" ||
                      e.key === "E"
                    ) {
                      e.preventDefault();
                    }
                  }}
                  className="h-8 border-zinc-300 bg-white pl-9 pr-[88px] text-xs transition-colors focus:border-blue-500"
                />

                {/* Right side: Unit label and Clear button */}
                <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-1.5">
                  <span className="text-xs font-medium text-zinc-400">
                    {CREDIT_INPUT_UNITS[creditType] || "credits"}
                  </span>
                  <div className="h-4 w-px bg-zinc-300"></div>
                  <button
                    type="button"
                    onClick={() => setAmount("")}
                    className="flex items-center justify-center rounded p-1 text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-700"
                    title="Clear amount"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-1">
                  {(
                    CREDIT_INCREMENTS[creditType] ||
                    CREDIT_INCREMENTS.agent_credits
                  ).map((preset) => (
                    <div key={preset.label} className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(amount) || 0;
                          setAmount(String(current + preset.value));
                        }}
                        className="flex cursor-pointer items-center justify-center rounded p-0.5 text-green-600 transition-all hover:bg-green-100 hover:text-green-700 active:scale-95"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <div className="text-center text-[9px] font-semibold text-zinc-700">
                        {preset.label}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(amount) || 0;
                          setAmount(
                            String(Math.max(0, current - preset.value)),
                          );
                        }}
                        className="flex cursor-pointer items-center justify-center rounded p-0.5 text-red-600 transition-all hover:bg-red-100 hover:text-red-700 active:scale-95"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reason */}
            <div className="grid gap-1.5">
              <Label
                htmlFor="reason-select"
                className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700"
              >
                Reason
              </Label>
              <Select
                value={isCustomReason ? "custom" : reason}
                onValueChange={(value) => {
                  if (value === "custom") {
                    setIsCustomReason(true);
                    setReason("");
                  } else {
                    setIsCustomReason(false);
                    setReason(value);
                  }
                }}
              >
                <SelectTrigger className="h-8 border-zinc-300 bg-white text-xs transition-colors hover:border-zinc-400">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin grant">Admin grant</SelectItem>
                  <SelectItem value="Promotional credit">
                    Promotional credit
                  </SelectItem>
                  <SelectItem value="Beta testing reward">
                    Beta testing reward
                  </SelectItem>
                  <SelectItem value="Refund">Refund</SelectItem>
                  <SelectItem value="Support credit">Support credit</SelectItem>
                  <SelectItem value="Migration bonus">
                    Migration bonus
                  </SelectItem>
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Reason Textarea */}
            {isCustomReason && (
              <Textarea
                id="custom-reason"
                placeholder="Enter custom reason..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none border-zinc-300 bg-white text-xs transition-colors focus:border-blue-500"
              />
            )}
          </div>

          {/* Right Column: Receipt */}
          <div className="col-span-3">
            {(() => {
              const amountNum = parseInt(amount) || 0;
              const selectedCredit = creditBalancesData?.balances?.find(
                (c: any) => c.featureId === creditType,
              );
              const currentBalance =
                selectedCredit?.unlimited ||
                selectedCredit?.balance === "unlimited"
                  ? Infinity
                  : typeof selectedCredit?.balance === "number"
                    ? selectedCredit.balance
                    : 0;
              const isUnlimited = currentBalance === Infinity;
              const newBalance = isUnlimited
                ? Infinity
                : mode === "grant"
                  ? currentBalance + amountNum
                  : currentBalance - amountNum;
              const creditName =
                CREDIT_TYPES.find((t) => t.id === creditType)?.name ||
                creditType;
              const unit = CREDIT_UNITS[creditType] || "";
              const platformCost = calculatePlatformCost(creditType, amountNum);

              return (
                <div
                  className={cn(
                    "h-full rounded-lg border-2 p-3 transition-all",
                    mode === "grant"
                      ? "border-green-200 bg-gradient-to-br from-green-50 to-green-100/30"
                      : "border-red-200 bg-gradient-to-br from-red-50 to-red-100/30",
                  )}
                >
                  <h3
                    className={cn(
                      "mb-2 text-xs font-semibold uppercase tracking-wide",
                      mode === "grant" ? "text-green-900" : "text-red-900",
                    )}
                  >
                    Transaction Preview
                  </h3>

                  <div className="space-y-2">
                    {/* User Information */}
                    {selectedUser && (
                      <div className="mb-2 rounded-md border border-blue-300 bg-blue-50 p-2">
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <User className="h-3 w-3 text-blue-600" />
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-blue-900">
                            Recipient
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-blue-900">
                            {selectedUser.name}
                          </div>
                          <div className="font-mono text-[10px] text-blue-700">
                            {selectedUser.email}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Credit Type */}
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-1.5">
                      <span className="text-[10px] font-medium text-zinc-600">
                        Credit Type
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-900">
                        {creditName}
                      </span>
                    </div>

                    {/* Current Balance */}
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-1.5">
                      <span className="text-[10px] font-medium text-zinc-600">
                        Current
                      </span>
                      <span className="text-xs font-bold tabular-nums text-zinc-900">
                        {isUnlimited
                          ? "∞"
                          : `${formatBalanceDetailed(currentBalance)}${unit ? ` ${unit}` : ""}`}
                      </span>
                    </div>

                    {/* Operation */}
                    <div
                      className={cn(
                        "flex items-center justify-between rounded-md p-2",
                        mode === "grant" ? "bg-green-100/50" : "bg-red-100/50",
                      )}
                    >
                      <span className="text-[10px] font-medium text-zinc-600">
                        {mode === "grant" ? "Grant" : "Deduct"}
                      </span>
                      <span
                        className={cn(
                          "text-base font-bold tabular-nums",
                          mode === "grant" ? "text-green-700" : "text-red-700",
                        )}
                      >
                        {mode === "grant" ? "+" : "-"}
                        {amountNum.toLocaleString()}
                        {unit ? ` ${unit}` : ""}
                      </span>
                    </div>

                    {/* Platform Cost */}
                    {platformCost > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-amber-700">
                            Platform Cost
                          </span>
                          <span className="text-xs font-bold tabular-nums text-amber-900">
                            {formatCost(platformCost)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Divider Arrow */}
                    <div className="-my-1 flex justify-center">
                      <div
                        className={cn(
                          "text-base font-bold leading-none",
                          mode === "grant" ? "text-green-600" : "text-red-600",
                        )}
                      >
                        ↓
                      </div>
                    </div>

                    {/* New Balance */}
                    <div
                      className={cn(
                        "flex items-center justify-between rounded-md border-2 p-2",
                        mode === "grant"
                          ? "border-green-300 bg-green-50"
                          : newBalance < 0
                            ? "border-red-400 bg-red-100"
                            : "border-red-300 bg-red-50",
                      )}
                    >
                      <span className="text-[10px] font-semibold text-zinc-700">
                        New Balance
                      </span>
                      <span
                        className={cn(
                          "text-base font-bold tabular-nums",
                          mode === "grant"
                            ? "text-green-700"
                            : newBalance < 0
                              ? "text-red-700"
                              : "text-red-600",
                        )}
                      >
                        {isUnlimited
                          ? "∞"
                          : `${formatBalanceDetailed(newBalance)}${unit ? ` ${unit}` : ""}`}
                      </span>
                    </div>

                    {/* Warning for negative balance */}
                    {!isUnlimited && mode === "deduct" && newBalance < 0 && (
                      <div className="rounded-md border border-red-300 bg-red-50 p-1.5 text-[10px] text-red-800">
                        <strong>⚠️</strong> Negative balance!
                      </div>
                    )}

                    {/* Reason Summary */}
                    {reason && reason.trim() !== "" && (
                      <div className="mt-2 rounded-md border border-zinc-200 bg-white/60 p-2">
                        <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
                          Reason
                        </div>
                        <div className="text-[10px] italic text-zinc-700">
                          "{reason}"
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <DialogFooter className="gap-2">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={grantCreditsMutation.isPending}
          className="border-zinc-300 transition-colors hover:bg-zinc-50"
        >
          Cancel
        </Button>
        <Button
          onClick={handleGrant}
          disabled={grantCreditsMutation.isPending}
          variant={mode === "deduct" ? "destructive" : "default"}
          className="min-w-[140px] shadow-sm transition-all hover:shadow-md"
        >
          {grantCreditsMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {grantCreditsMutation.isPending
            ? mode === "grant"
              ? "Granting..."
              : "Deducting..."
            : mode === "grant"
              ? "Grant Credits"
              : "Deduct Credits"}
        </Button>
      </DialogFooter>
    </div>
  );
}
