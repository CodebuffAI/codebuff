"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/vly/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";
import { ChevronDown, ImageIcon, Check, Sparkles, Globe } from "lucide-react";
import { useRateLimit } from "@convex-dev/rate-limiter/react";
import { useQuery } from "convex/react";
import {
  FREEBUFF_MODELS,
  DEFAULT_FREEBUFF_MODEL_ID,
  FREEBUFF_WEB_LIMITED_MODEL_IDS,
  getFreebuffModel,
  isFreebuffPremiumModelId,
  isFreebuffMultimodalModelId,
  isFreebuffWebModelAllowedForLimitedTier,
  resolveFreebuffModel,
  resolveFreebuffWebModelForLimitedTier,
  type FreebuffModelOption,
} from "@codebuff/common/constants/freebuff-models";
import {
  getNextReferralTier,
  getReferralTier,
} from "@codebuff/common/constants/freebuff-referral-tiers";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { cn } from "@/vly/lib/utils";

interface FreebuffModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Keep a web-specific resolver for localStorage hydration. There are no hidden
 * web models right now (Kimi and MiniMax M3 should both be selectable), but the
 * wrapper keeps stale/unknown IDs pinned to the shared Freebuff fallback.
 */
export function resolveVisibleFreebuffModel(modelId: string): string {
  return resolveFreebuffModel(modelId);
}

/** Shared localStorage key so the dashboard composer and the project chat
 *  remember the same "last used model" selection. */
export const FREEBUFF_MODEL_STORAGE_KEY = "freebuff:selectedModel";
const PREMIUM_MODELS = FREEBUFF_MODELS.filter((m) =>
  isFreebuffPremiumModelId(m.id),
);
const UNLIMITED_MODELS = FREEBUFF_MODELS.filter(
  (m) => !isFreebuffPremiumModelId(m.id),
);

const ModelRow: React.FC<{
  model: FreebuffModelOption;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}> = ({ model, isSelected, disabled = false, onSelect }) => {
  const multimodal = isFreebuffMultimodalModelId(model.id);

  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={(e) => {
        e.preventDefault();
        if (disabled) return;
        onSelect();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2",
        isSelected && "bg-accent",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <Check
        className={cn(
          "h-4 w-4 shrink-0 text-primary",
          isSelected ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {model.displayName}
          </span>
          {multimodal && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-sky-500" />
              </TooltipTrigger>
              <TooltipContent>Accepts image input</TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {model.tagline}
        </span>
      </div>
    </DropdownMenuItem>
  );
};

export function FreebuffModelSelector({
  selectedModelId,
  onModelChange,
  disabled = false,
  compact = false,
}: FreebuffModelSelectorProps) {
  const current =
    getFreebuffModel(selectedModelId) ??
    getFreebuffModel(DEFAULT_FREEBUFF_MODEL_ID);

  // Live premium quota remaining (reactive). `check()` returns the current
  // token value computed against server time; it's undefined until loaded.
  const { check: checkPremiumLimit } = useRateLimit(
    api.coding_agent.rateLimiter.getPremiumModelRateLimit,
    { getServerTimeMutation: api.coding_agent.rateLimiter.getServerTime },
  );
  const premiumStatus = checkPremiumLimit?.();
  const premiumRemaining = premiumStatus
    ? Math.max(0, Math.floor(premiumStatus.value))
    : null;

  // Standard (non-premium) models share a tier-scaled daily quota too.
  const { check: checkStandardLimit } = useRateLimit(
    api.coding_agent.rateLimiter.getStandardModelRateLimit,
    { getServerTimeMutation: api.coding_agent.rateLimiter.getServerTime },
  );
  const standardStatus = checkStandardLimit?.();
  const standardRemaining = standardStatus
    ? Math.max(0, Math.floor(standardStatus.value))
    : null;

  // Referral tier progress for the subtle "refer friends" footer: how many
  // more qualified referrals unlock the next limit bump.
  const viewer = useQuery(api.users.viewer);
  const referralCount = viewer?.qualified_referral_count ?? 0;
  const nextTier = viewer ? getNextReferralTier(referralCount) : null;
  const currentTier = getReferralTier(referralCount);

  // Geo-derived access tier. Limited regions only get the limited model set
  // plus a daily session quota; the server enforces both, this mirrors it.
  const accessStatus = useQuery(api.webAccess.getWebAccessStatus, {});
  const isLimitedTier = accessStatus?.accessTier === "limited";

  // Coerce a saved selection (e.g. premium id from localStorage) that the
  // limited tier can't use, so the UI matches what the server will run.
  React.useEffect(() => {
    if (!isLimitedTier) return;
    if (isFreebuffWebModelAllowedForLimitedTier(selectedModelId)) return;
    onModelChange(resolveFreebuffWebModelForLimitedTier(selectedModelId));
  }, [isLimitedTier, selectedModelId, onModelChange]);

  // The whole limited-tier set is geo-exempt (DeepSeek V4 Flash, MiMo 2.5):
  // limited regions get these models with no session quota.
  const limitedTierModels = FREEBUFF_MODELS.filter((m) =>
    FREEBUFF_WEB_LIMITED_MODEL_IDS.some((id) => id === m.id),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
          )}
        >
          <span className="font-medium text-foreground">
            {current.displayName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1.5">
        {isLimitedTier ? (
          <>
            <div className="mx-1 mb-1.5 flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  Limited access in your region
                </span>
                <span className="text-[11px] opacity-80">
                  These models are free to use with generous daily limits
                </span>
              </div>
            </div>
            <DropdownMenuLabel className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Available models
            </DropdownMenuLabel>
            {limitedTierModels.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                isSelected={model.id === current.id}
                onSelect={() => onModelChange(model.id)}
              />
            ))}
          </>
        ) : (
          <>
            {PREMIUM_MODELS.length > 0 && (
              <>
                <DropdownMenuLabel className="flex items-center justify-between px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Premium
                  </span>
                  {premiumRemaining !== null && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium normal-case tabular-nums text-amber-600">
                      {premiumRemaining} left today
                    </span>
                  )}
                </DropdownMenuLabel>
                {PREMIUM_MODELS.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    isSelected={model.id === current.id}
                    // Out of premium quota for today — the server would reject
                    // the send anyway, so don't let users pick a doomed model.
                    disabled={premiumRemaining === 0}
                    onSelect={() => onModelChange(model.id)}
                  />
                ))}
                <DropdownMenuSeparator className="my-1.5" />
              </>
            )}
            <DropdownMenuLabel className="flex items-center justify-between px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Standard</span>
              {standardRemaining !== null && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium normal-case tabular-nums text-amber-600">
                  {standardRemaining} left today
                </span>
              )}
            </DropdownMenuLabel>
            {UNLIMITED_MODELS.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                isSelected={model.id === current.id}
                // Standard daily quota exhausted — sends would be rejected.
                disabled={standardRemaining === 0}
                onSelect={() => onModelChange(model.id)}
              />
            ))}
            {nextTier && (
              <>
                <DropdownMenuSeparator className="my-1.5" />
                {/* Subtle next-tier nudge: progress toward the next referral
                    tier and the limits it unlocks. */}
                <Link
                  href="/web/referrals"
                  className="mx-1 mb-0.5 flex flex-col gap-1.5 rounded-md px-2.5 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      Refer {nextTier.referralsRequired - referralCount} more{" "}
                      {nextTier.referralsRequired - referralCount === 1
                        ? "friend"
                        : "friends"}{" "}
                      → {nextTier.standardModelDailyLimit} standard ·{" "}
                      {nextTier.premiumModelDailyLimit} premium / day
                    </span>
                    <span className="shrink-0 tabular-nums opacity-70">
                      {referralCount}/{nextTier.referralsRequired}
                    </span>
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary/60"
                      style={{
                        width: `${Math.min(100, (referralCount / nextTier.referralsRequired) * 100)}%`,
                      }}
                    />
                  </span>
                </Link>
              </>
            )}
            {!nextTier && currentTier.tier > 0 && (
              <>
                <DropdownMenuSeparator className="my-1.5" />
                <div className="mx-1 mb-0.5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  Max referral tier unlocked
                </div>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
