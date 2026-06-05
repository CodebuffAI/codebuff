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
import { ChevronDown, ImageIcon, AlertTriangle, Sparkles } from "lucide-react";
import {
  FREEBUFF_MODELS,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
  DEFAULT_FREEBUFF_MODEL_ID,
  getFreebuffModel,
  isFreebuffPremiumModelId,
  isFreebuffMultimodalModelId,
  type FreebuffModelOption,
} from "@codebuff/common/constants/freebuff-models";
import { cn } from "@/vly/lib/utils";

interface FreebuffModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

// Group the catalog into the same tiers the CLI uses so the web picker mirrors
// it: premium models (daily-limited) up top, unlimited models below.
const PREMIUM_MODELS = FREEBUFF_MODELS.filter((m) => isFreebuffPremiumModelId(m.id));
const UNLIMITED_MODELS = FREEBUFF_MODELS.filter(
  (m) => !isFreebuffPremiumModelId(m.id),
);

const PremiumBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
    <Sparkles className="h-3 w-3" />
    Premium · {FREEBUFF_PREMIUM_SESSION_LIMIT}/day
  </span>
);

const ModelRow: React.FC<{
  model: FreebuffModelOption;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ model, isSelected, onSelect }) => {
  const premium = isFreebuffPremiumModelId(model.id);
  const multimodal = isFreebuffMultimodalModelId(model.id);

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex cursor-pointer flex-col items-start gap-1 px-2 py-2",
        isSelected && "bg-accent",
      )}
    >
      <div className="flex w-full items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {model.displayName}
        </span>
        {multimodal && (
          <Tooltip>
            <TooltipTrigger asChild>
              <ImageIcon className="h-3.5 w-3.5 text-sky-500" />
            </TooltipTrigger>
            <TooltipContent>Accepts image input</TooltipContent>
          </Tooltip>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {model.tagline}
        </span>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2">
        {premium && <PremiumBadge />}
        {model.warning && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            {model.warning}
          </span>
        )}
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
    getFreebuffModel(selectedModelId) ?? getFreebuffModel(DEFAULT_FREEBUFF_MODEL_ID);
  const currentPremium = isFreebuffPremiumModelId(current.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm",
          )}
        >
          <span className="font-medium text-foreground">
            {current.displayName}
          </span>
          {currentPremium && (
            <Sparkles className="h-3 w-3 text-amber-500" />
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {PREMIUM_MODELS.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Premium</span>
              <span className="font-normal normal-case">
                {FREEBUFF_PREMIUM_SESSION_LIMIT}/day limit
              </span>
            </DropdownMenuLabel>
            {PREMIUM_MODELS.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                isSelected={model.id === current.id}
                onSelect={() => onModelChange(model.id)}
              />
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
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
