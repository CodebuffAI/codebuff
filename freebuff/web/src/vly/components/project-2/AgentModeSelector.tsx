"use client";

import React, { useState } from "react";
import { AgentMode } from "@/convex/utils/registry_validators";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/vly/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useFeatureAccess } from "@/vly/hooks/useFeatureAccess";
import { FeaturePaywallDialog } from "@/vly/components/billing/FeaturePaywallDialog";

const ZaiIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5 6h14L5 18h14"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const OpenAIIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
);

const AnthropicIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm1.21 5.175l-2.38 6.146h4.753L7.78 8.695z" />
  </svg>
);

interface BadgeConfig {
  label: string;
  color: "blue" | "green" | "purple" | "orange" | "red" | "gold";
}

interface AgentModeConfig {
  id: AgentMode;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: BadgeConfig;
  requiresScale?: boolean;
  temporarilyUnavailable?: boolean;
}

const AGENT_MODES: AgentModeConfig[] = [
  {
    id: "CHEAP",
    title: "GPT-5.4 nano",
    description: "Lowest-cost GPT-5.4 option for quick fixes",
    icon: <OpenAIIcon className="h-4 w-4" />,
    badge: { label: "5x cheaper", color: "green" },
  },
  {
    id: "EFFICIENT",
    title: "GPT-5.4 mini",
    description: "Smaller GPT-5.4 model for fast everyday edits",
    icon: <OpenAIIcon className="h-4 w-4" />,
    badge: { label: "1.3x cheaper", color: "blue" },
  },
  {
    id: "STANDARD",
    title: "GLM 5",
    description: "Balanced non-OpenAI option at standard price",
    icon: <ZaiIcon className="h-4 w-4" />,
  },
  {
    id: "PRECISE",
    title: "GPT-5.4",
    description: "Best OpenAI mode for precision with Codex fallback",
    icon: <OpenAIIcon className="h-4 w-4" />,
    badge: { label: "2.5x pricier", color: "orange" },
  },
  {
    id: "POWERFUL",
    title: "Claude Sonnet 4.6",
    description: "Bedrock-backed default for reliability",
    icon: <AnthropicIcon className="h-4 w-4" />,
    badge: { label: "3x pricier", color: "red" },
  },
  {
    id: "OPUS",
    title: "Claude Opus 4.6",
    description: "Most capable model (Scale plan)",
    icon: <AnthropicIcon className="h-4 w-4" />,
    badge: { label: "5x pricier", color: "gold" },
    requiresScale: true,
  },
];

const getBadgeStyles = (color: BadgeConfig["color"]) => {
  switch (color) {
    case "green":
      return { bg: "#dcfce7", text: "#166534", border: "#86efac" };
    case "blue":
      return { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" };
    case "purple":
      return { bg: "#f3e8ff", text: "#6b21a8", border: "#d8b4fe" };
    case "orange":
      return { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" };
    case "red":
      return { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" };
    case "gold":
      return { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" };
  }
};

interface AgentModeSelectorProps {
  selectedMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  disabled?: boolean;
}

export function AgentModeSelector({
  selectedMode,
  onModeChange,
  disabled = false,
}: AgentModeSelectorProps) {
  const [showPaywall, setShowPaywall] = useState(false);
  const { hasAccess: hasOpusAccess, isLoading } =
    useFeatureAccess("claude_opus_access");

  const defaultMode =
    AGENT_MODES.find((mode) => mode.id === "POWERFUL") || AGENT_MODES[0];
  const currentMode =
    AGENT_MODES.find((mode) => mode.id === selectedMode) || defaultMode;

  const handleModeSelect = (mode: AgentModeConfig) => {
    if (mode.temporarilyUnavailable) {
      return;
    }
    // If mode requires Scale and user doesn't have access, show paywall
    if (mode.requiresScale && !hasOpusAccess && !isLoading) {
      setShowPaywall(true);
      return;
    }
    onModeChange(mode.id);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-zinc-500 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <span>{currentMode.title}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[260px] border-gray-200 bg-white shadow-lg dark:border-[#575757] dark:bg-[#282828]"
        >
          {AGENT_MODES.map((mode) => {
            const isLocked = mode.requiresScale && !hasOpusAccess && !isLoading;
            const isTemporarilyUnavailable = mode.temporarilyUnavailable;
            const isDisabled = isLocked || isTemporarilyUnavailable;

            return (
              <DropdownMenuItem
                key={mode.id}
                onClick={() => handleModeSelect(mode)}
                className={`flex cursor-pointer flex-col items-start gap-0.5 px-2.5 py-1.5 ${
                  selectedMode === mode.id
                    ? "bg-blue-50 text-blue-900 dark:bg-[#3c3c3c] dark:text-zinc-100"
                    : isDisabled
                      ? "text-gray-400 dark:text-zinc-500"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-zinc-300 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100"
                } ${isDisabled ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <div className="flex w-full items-center gap-2">
                  {mode.icon}
                  <div className="flex-1 text-xs font-medium">{mode.title}</div>
                  <div className="ml-auto flex items-center gap-1">
                    {mode.badge && (
                      <div
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                        style={{
                          backgroundColor: getBadgeStyles(mode.badge.color).bg,
                          color: getBadgeStyles(mode.badge.color).text,
                          border: `1px solid ${getBadgeStyles(mode.badge.color).border}`,
                        }}
                      >
                        {mode.badge.label}
                      </div>
                    )}
                    {isTemporarilyUnavailable && (
                      <div
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                        style={{
                          backgroundColor: "#f4f4f5",
                          color: "#52525b",
                          border: "1px solid #d4d4d8",
                        }}
                      >
                        Unavailable
                      </div>
                    )}
                  </div>
                </div>
                <div className="pl-5 text-[10px] text-gray-500 dark:text-zinc-400">
                  {mode.description}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Scale Plan Paywall Dialog */}
      <FeaturePaywallDialog
        featureId="claude_opus_access"
        requiredPlan="Scale"
        title="Unlock Claude 4.6 Opus"
        message="Claude 4.6 Opus is the most capable AI model available, perfect for complex reasoning and high-quality code generation. Upgrade to Scale plan to access this premium model."
        open={showPaywall}
        onOpenChange={setShowPaywall}
      />
    </>
  );
}
