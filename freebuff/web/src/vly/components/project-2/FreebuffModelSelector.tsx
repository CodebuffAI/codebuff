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
import { ChevronDown, ImageIcon, Check, Sparkles } from "lucide-react";
import { useRateLimit } from "@convex-dev/rate-limiter/react";
import {
  FREEBUFF_MODELS,
  FREEBUFF_KIMI_MODEL_ID,
  DEFAULT_FREEBUFF_MODEL_ID,
  getFreebuffModel,
  isFreebuffPremiumModelId,
  isFreebuffMultimodalModelId,
  type FreebuffModelOption,
} from "@codebuff/common/constants/freebuff-models";
import { api } from "@/convex/_generated/api";
import { cn } from "@/vly/lib/utils";

interface FreebuffModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

// Models still supported by the backend/CLI but intentionally hidden from the
// web picker to keep the list short.
const HIDDEN_MODEL_IDS = new Set<string>([FREEBUFF_KIMI_MODEL_ID]);

const VISIBLE_MODELS = FREEBUFF_MODELS.filter(
  (m) => !HIDDEN_MODEL_IDS.has(m.id),
);
const PREMIUM_MODELS = VISIBLE_MODELS.filter((m) =>
  isFreebuffPremiumModelId(m.id),
);
const UNLIMITED_MODELS = VISIBLE_MODELS.filter(
  (m) => !isFreebuffPremiumModelId(m.id),
);

const ModelRow: React.FC<{
  model: FreebuffModelOption;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ model, isSelected, onSelect }) => {
  const multimodal = isFreebuffMultimodalModelId(model.id);

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2",
        isSelected && "bg-accent",
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
                onSelect={() => onModelChange(model.id)}
              />
            ))}
            <DropdownMenuSeparator className="my-1.5" />
          </>
        )}
        <DropdownMenuLabel className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Unlimited
        </DropdownMenuLabel>
        {UNLIMITED_MODELS.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            isSelected={model.id === current.id}
            onSelect={() => onModelChange(model.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
