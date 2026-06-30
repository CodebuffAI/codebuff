"use client";

import {
  AgentChatMessages,
  AgentChatMessagesRef,
  type AskUserQuestion,
} from "./AgentChatMessages";
import { AskUserComposer } from "./AskUserComposer";
import { ChatSkeleton } from "../ChatSkeleton";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FunctionReturnType } from "convex/server";
import { useCallback, useRef, Suspense, useState, useEffect } from "react";
import { useChatStorageContext } from "@/vly/contexts/ChatStorageContext";
import { useMutation, useQuery, useAction } from "convex/react";
import { useRateLimit } from "@convex-dev/rate-limiter/react";
import Link from "next/link";
import { toast } from "sonner";
import { handleAgentSendError } from "@/vly/lib/agentErrorHandler";
import { trackRedditFirstPromptOnce } from "@/lib/reddit-funnel";
import { useMessageQueue } from "@/vly/hooks/useMessageQueue";
import { AgentThreadList } from "./AgentThreadList";
import { ChatInput } from "../ChatInput";
import {
  Check,
  ChevronLeft,
  X,
  AlertTriangle,
  ChevronDown,
  Pencil,
  Plus,
  History,
  Github,
  Gift,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/vly/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/vly/components/ui/collapsible";
import { BuildErrors } from "@/vly/components/project-2/BuildErrors";
import {
  ModelDisclaimerDialog,
  hasAcknowledgedDisclaimer,
} from "@/vly/components/project-2/ModelDisclaimerDialog";
import {
  DEFAULT_FREEBUFF_MODEL_ID,
  isFreebuffPremiumModelId,
  resolveFreebuffModel,
} from "@codebuff/common/constants/freebuff-models";
import {
  getNextReferralTier,
  getReferralTier,
} from "@codebuff/common/constants/freebuff-referral-tiers";
import {
  FREEBUFF_MODEL_STORAGE_KEY,
  resolveVisibleFreebuffModel,
} from "@/vly/components/project-2/FreebuffModelSelector";
import {
  AgentLogo,
  CliAgentConfigurationPanel,
  isCliAgentConfigured,
} from "./CliAgentConfigurationPanel";
import { formatRetryTime } from "@/vly/lib/rateLimitHelpers";

type AgentType = "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff";
const GEMINI_CLI_MAINTENANCE_MESSAGE = "gemini is currently under maintence.";

type CliByokSettings = FunctionReturnType<typeof api.users.getCliByokSettings>;
type ResolvedCliByokSettings = NonNullable<CliByokSettings>;

type CliPreferenceKey =
  | "gpt_auth_method"
  | "claude_provider_preference"
  | "gpt_model_preference"
  | "claude_model_preference";

const CODEX_MODEL_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "gpt-5.5", label: "GPT 5.5" },
  { value: "gpt-5.4", label: "GPT 5.4" },
  { value: "gpt-5.4-mini", label: "GPT 5.4 Mini" },
] as const;

const CLAUDE_ANTHROPIC_MODEL_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const;

const CLAUDE_BEDROCK_MODEL_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "us.anthropic.claude-opus-4-8", label: "US Opus 4.8" },
  { value: "us.anthropic.claude-sonnet-4-6", label: "US Sonnet 4.6" },
  {
    value: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    label: "US Haiku 4.5",
  },
] as const;

const CliRuntimePreferenceSelector: React.FC<{
  agentType: "Codex" | "Claude Code";
  settings: ResolvedCliByokSettings;
  onSelect: (key: CliPreferenceKey, value: string) => Promise<void>;
  disabled?: boolean;
}> = ({ agentType, settings, onSelect, disabled = false }) => {
  const isCodex = agentType === "Codex";
  const activeValue = isCodex
    ? settings.gptAuthMethod
    : settings.claudeProviderPreference;

  const options = isCodex
    ? [
        {
          value: "oauth",
          label: "ChatGPT OAuth",
          configured: settings.hasCodexOauth,
        },
        {
          value: "byok",
          label: "OpenAI BYOK",
          configured: settings.hasOpenAiApiKey,
        },
      ]
    : [
        {
          value: "anthropic",
          label: "Anthropic BYOK",
          configured: settings.hasAnthropicApiKey,
        },
        {
          value: "bedrock",
          label: "AWS Bedrock BYOK",
          configured: settings.hasBedrockBearerToken,
        },
      ];

  const activeLabel = options.find((option) => option.value === activeValue)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="font-medium text-foreground">{activeLabel ?? "Provider"}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault();
              void onSelect(
                isCodex ? "gpt_auth_method" : "claude_provider_preference",
                option.value,
              );
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{option.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {option.configured ? "Configured" : "Needs setup"}
              </span>
            </span>
            {activeValue === option.value && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            window.location.href = "/web/settings#ai-credentials";
          }}
        >
          Configure credentials
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const CliModelPreferenceSelector: React.FC<{
  agentType: "Codex" | "Claude Code";
  settings: ResolvedCliByokSettings;
  onSelect: (key: CliPreferenceKey, value: string) => Promise<void>;
  disabled?: boolean;
}> = ({ agentType, settings, onSelect, disabled = false }) => {
  const options =
    agentType === "Codex"
      ? CODEX_MODEL_OPTIONS
      : settings.claudeProviderPreference === "bedrock"
        ? CLAUDE_BEDROCK_MODEL_OPTIONS
        : CLAUDE_ANTHROPIC_MODEL_OPTIONS;

  const activeValue =
    agentType === "Codex"
      ? settings.gptModelPreference
      : settings.claudeModelPreference;
  const activeLabel =
    options.find((option) => option.value === activeValue)?.label ??
    options[0]?.label ??
    "Model";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="font-medium text-foreground">{activeLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault();
              void onSelect(
                agentType === "Codex"
                  ? "gpt_model_preference"
                  : "claude_model_preference",
                option.value,
              );
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate text-sm">{option.label}</span>
            {activeValue === option.value && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Compact, subtle runtime errors component for agent chat
const CompactRuntimeErrors: React.FC<{
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>;
  onSendMessage: (
    message: string,
    images: Id<"_storage">[],
  ) => Promise<boolean>;
}> = ({ project, onSendMessage }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const unresolvedRuntimeErrorsResult = useQuery(
    api.runtime_errors.getUnresolvedRuntimeErrors,
    {
      projectId: project._id,
      paginationOpts: { numItems: 5, cursor: null },
    },
  );

  const resolveRuntimeErrors = useMutation(
    api.runtime_errors.resolveRuntimeErrors,
  );

  const deleteRuntimeError = useMutation(api.runtime_errors.deleteRuntimeError);

  const unresolvedRuntimeErrors = unresolvedRuntimeErrorsResult?.page || [];

  if (!unresolvedRuntimeErrorsResult || unresolvedRuntimeErrors.length === 0) {
    return null;
  }

  const handleFix = async () => {
    const errorsToFix = unresolvedRuntimeErrors || [];
    const errorIds = errorsToFix.map((err) => err._id);
    const detailsMessage = errorsToFix
      .map(
        (err) =>
          `Error: ${err.error}\nURL: ${err.url}${err.stack_trace ? `\nStack Trace:\n${err.stack_trace}` : ""}`,
      )
      .join("\n\n");

    await onSendMessage(detailsMessage, []);
    await resolveRuntimeErrors({ errorIds });
    setIsExpanded(false);
  };

  return (
    <div className="flex-shrink-0 border-t border-border/40 bg-muted/30">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between px-4 py-2">
          <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span>
              {unresolvedRuntimeErrors.length} runtime error
              {unresolvedRuntimeErrors.length !== 1 ? "s" : ""}
            </span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <Button
            onClick={handleFix}
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-xs"
          >
            Fix
          </Button>
        </div>
        <CollapsibleContent>
          <div className="max-h-32 space-y-1 overflow-y-auto border-t border-border/40 bg-background/60 px-4 py-2">
            {unresolvedRuntimeErrors.map((err, idx) => (
              <div
                key={idx}
                className="group relative rounded-md bg-muted/40 p-2"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteRuntimeError({ errorId: err._id })}
                  className="absolute right-0.5 top-0.5 h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
                <div className="pr-6">
                  <div className="text-xs font-medium text-foreground/90">
                    {err.error}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {err.url}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const DailyReferralLimitBanner: React.FC<{
  selectedModelId: string;
  remaining: number | null;
  retryAfterMs: number | null;
  referralCount: number;
}> = ({ selectedModelId, remaining, retryAfterMs, referralCount }) => {
  if (remaining !== 0) return null;

  const isPremium = isFreebuffPremiumModelId(selectedModelId);
  const currentTier = getReferralTier(referralCount);
  const nextTier = getNextReferralTier(referralCount);
  const currentLimit = isPremium
    ? currentTier.premiumModelDailyLimit
    : currentTier.standardModelDailyLimit;
  const nextLimit = nextTier
    ? isPremium
      ? nextTier.premiumModelDailyLimit
      : nextTier.standardModelDailyLimit
    : null;
  const referralsNeeded = nextTier
    ? Math.max(0, nextTier.referralsRequired - referralCount)
    : 0;
  const resetText =
    retryAfterMs && retryAfterMs > 0
      ? `Resets in ${formatRetryTime(retryAfterMs)}.`
      : "Resets later today.";

  return (
    <div className="flex-shrink-0 border-t border-amber-500/25 bg-amber-500/10 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
            <Gift className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              You need more referrals to keep using this model today
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              You used all {currentLimit} {isPremium ? "premium" : "standard"}{" "}
              Freebuff messages for your current referral tier. {resetText}{" "}
              {nextTier
                ? `Get ${referralsNeeded} qualified ${
                    referralsNeeded === 1 ? "referral" : "referrals"
                  } to unlock ${nextLimit} ${
                    isPremium ? "premium" : "standard"
                  } messages per day.`
                : "You've unlocked the highest referral tier."}
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0">
          <Link href="/web/referrals">
            <Gift className="mr-1.5 h-3.5 w-3.5" />
            Get referrals
          </Link>
        </Button>
      </div>
    </div>
  );
};

interface AgentChatShellProps {
  project: FunctionReturnType<typeof api.project.getProjectData>;
  projectSemanticIdentifier: string;
  onSwitchToOldChat?: () => void;
  onCreateVlyThread?: () => Promise<void>;
  onSelectOldThread?: (threadId: Id<"thread">) => void;
  isSelectingElement?: boolean;
  setIsSelectingElement?: (v: boolean) => void;
  onOpenVersions?: () => void;
  onOpenGitHub?: () => void;
  githubActionLabel?: string;
  /** Hide preview element picker (general cloud repos don't support it). */
  hideElementSelector?: boolean;
  /**
   * Optional hook to let an external surface (e.g. the Freebuff Cloud preview
   * pane) push a message into this chat — used to forward dev-server logs for
   * diagnosis. Receives a stable sender; called whenever the sender changes.
   */
  onRegisterSendMessage?: (
    send: (message: string) => Promise<boolean>,
  ) => void;
}

export function AgentChatShell({
  project,
  projectSemanticIdentifier,
  onSelectOldThread,
  isSelectingElement: externalIsSelectingElement,
  setIsSelectingElement: externalSetIsSelectingElement,
  onOpenVersions,
  onOpenGitHub,
  githubActionLabel = "GitHub",
  hideElementSelector = false,
  onRegisterSendMessage,
}: AgentChatShellProps) {
  const vlyAgentDisplayName = "freebuff agent 2.0";
  // All hooks must be called unconditionally before any early returns
  const chatMessagesRef = useRef<AgentChatMessagesRef>(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const [showAgentPickerDialog, setShowAgentPickerDialog] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);
  const [pendingAgentSelection, setPendingAgentSelection] =
    useState<Exclude<AgentType, "Freebuff"> | null>(null);
  const [internalIsSelectingElement, setInternalIsSelectingElement] =
    useState(false);

  // Use external state if provided, otherwise use internal state
  const isSelectingElement =
    externalIsSelectingElement !== undefined
      ? externalIsSelectingElement
      : internalIsSelectingElement;
  const setIsSelectingElement =
    externalSetIsSelectingElement || setInternalIsSelectingElement;

  // Use persistent chat storage for selectedNodeInfo
  const { selectedNodeInfo, updateSelectedNodeInfo } = useChatStorageContext();

  // Store refs for selected node info to avoid recreating callbacks
  const selectedNodeInfoRef = useRef(selectedNodeInfo);

  // Update ref in effect, not during render
  useEffect(() => {
    selectedNodeInfoRef.current = selectedNodeInfo;
  }, [selectedNodeInfo]);

  // Set active agent thread mutation
  const setActiveAgentThread = useMutation(api.project.setActiveAgentThread);

  // Create new thread mutation
  const createNewAgentThread = useMutation(
    api.coding_agent.cli_agent.agent_thread.createNewAgentThread,
  );
  const switchAgentOnThread = useMutation(
    api.coding_agent.cli_agent.agent_thread.switchAgentOnThread,
  );
  const byokSettings = useQuery(api.users.getCliByokSettings);
  const setCliPreference = useMutation(api.users.setCliPreference);

  // Send message mutation
  const sendMessage = useMutation(
    api.coding_agent.cli_agent.trigger.saveMessageAndStartWorkflow,
  ).withOptimisticUpdate((localStore, args) => {
    const semanticIdentifier = args.projectSemanticIdentifier;
    if (!semanticIdentifier) {
      return;
    }

    // Only optimistic-update when an active agent thread already exists and
    // the streamed query is loaded in the current view.
    if (!project?.active_agent_thread) {
      return;
    }

    // The live tail query is subscribed at idle with afterSeq: -1 (no
    // afterMessageId). Match those exact args so the optimistic in-flight message
    // renders immediately before the server creates the real row.
    const existingStreamData = localStore.getQuery(
      api.coding_agent.cli_agent.queries.getStreamingMessageDeltas,
      {
        semanticIdentifier,
        afterSeq: -1,
      },
    );

    if (existingStreamData === undefined) {
      return;
    }

    const now = Date.now();
    const optimisticMessage = {
      _id: crypto.randomUUID() as Id<"agent_message">,
      // Marks this as a client-only placeholder so the live tail doesn't track
      // its (non-Convex) id as a delta cursor before the real row exists.
      _optimistic: true,
      _creationTime: now,
      thread_id: project.active_agent_thread,
      session_id: undefined,
      user_message: args.message,
      assistant_stream: undefined,
      commit_hash: undefined,
      checkpoint_id: undefined,
      deactivated: false,
      isStreaming: true,
      state: "Processing" as const,
      state_message: undefined,
      total_cost_usd: undefined,
      credits_deducted: undefined,
      usage_breakdown: undefined,
      model_used: undefined,
      images: args.images,
    };

    localStore.setQuery(
      api.coding_agent.cli_agent.queries.getStreamingMessageDeltas,
      {
        semanticIdentifier,
        afterSeq: -1,
      },
      { message: optimisticMessage, deltas: [] },
    );
  });
  // Cancel message action
  const cancelMessage = useAction(
    api.coding_agent.cli_agent.agent_message.cancelAgentMessage,
  );

  // Get currently streaming message to cancel it from ChatInput X button. Only
  // the streaming metadata is needed here, so skip the delta read (metaOnly).
  const hasActiveThread = !!project?.active_agent_thread;
  const streamData = useQuery(
    api.coding_agent.cli_agent.queries.getStreamingMessageDeltas,
    hasActiveThread
      ? { semanticIdentifier: projectSemanticIdentifier, metaOnly: true }
      : "skip",
  );
  const currentStreamingMessage = streamData?.message ?? undefined;

  // Get active thread data (for title editing and processing state)
  const activeThread = useQuery(
    api.coding_agent.cli_agent.agent_thread.getAgentThreadPublic,
    project?.active_agent_thread
      ? { threadId: project.active_agent_thread }
      : "skip",
  );

  // Check both project state and active thread processing state
  const isProcessing =
    project?.state === "processing" || activeThread?.isProcessing === true;
  const isFreebuffThread = activeThread?.agent_type === "Freebuff";
  const isCodexThread = activeThread?.agent_type === "Codex";
  const activeConfigAgent = isCodexThread
    ? "Codex"
    : activeThread?.agent_type === "Claude Code"
      ? "Claude Code"
      : undefined;
  const isActiveCliAgentConfigured =
    !activeConfigAgent ||
    byokSettings === undefined ||
    isCliAgentConfigured(activeConfigAgent, byokSettings);
  const shouldShowAgentConfigurationPanel =
    !!activeConfigAgent &&
    byokSettings !== undefined &&
    !isActiveCliAgentConfigured;

  // State to track message to restore to input
  const [messageToRestore, setMessageToRestore] = useState<string | null>(null);
  const [activeAskUserQuestions, setActiveAskUserQuestions] = useState<
    AskUserQuestion[]
  >([]);
  const handleActiveAskUserQuestionsChange = useCallback(
    (questions: AskUserQuestion[]) => {
      setActiveAskUserQuestions(questions);
    },
    [],
  );
  useEffect(() => {
    setActiveAskUserQuestions([]);
  }, [project?.active_agent_thread]);

  // Selected open-source Freebuff model. Starts at the default for a stable
  // first render, then hydrates from localStorage on mount so the user's last
  // used model is restored without an SSR/hydration mismatch.
  const [selectedFreebuffModel, setSelectedFreebuffModel] = useState<string>(
    DEFAULT_FREEBUFF_MODEL_ID,
  );
  const selectedFreebuffModelRef = useRef(selectedFreebuffModel);
  useEffect(() => {
    selectedFreebuffModelRef.current = selectedFreebuffModel;
  }, [selectedFreebuffModel]);

  // Restore the last used model from localStorage once on mount. Hidden
  // models (removed from the picker) are mapped back to the default so the
  // user isn't silently pinned to a model they can no longer see.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(FREEBUFF_MODEL_STORAGE_KEY);
    if (stored) {
      setSelectedFreebuffModel(resolveVisibleFreebuffModel(stored));
    }
  }, []);

  const { check: checkPremiumLimit, status: premiumLimitStatus } = useRateLimit(
    api.coding_agent.rateLimiter.getPremiumModelRateLimit,
    { getServerTimeMutation: api.coding_agent.rateLimiter.getServerTime },
  );
  const { check: checkStandardLimit, status: standardLimitStatus } =
    useRateLimit(api.coding_agent.rateLimiter.getStandardModelRateLimit, {
      getServerTimeMutation: api.coding_agent.rateLimiter.getServerTime,
    });
  const isSelectedPremiumModel =
    isFreebuffPremiumModelId(selectedFreebuffModel);
  const selectedLimitStatus = isSelectedPremiumModel
    ? premiumLimitStatus
    : standardLimitStatus;
  const selectedLimitCheck = isSelectedPremiumModel
    ? checkPremiumLimit?.()
    : checkStandardLimit?.();
  const viewer = useQuery(api.users.viewer);
  const isGodUser = viewer?.role === "god";
  const selectedDailyRemaining = isGodUser
    ? null
    : selectedLimitCheck
      ? Math.max(0, Math.floor(selectedLimitCheck.value))
      : null;
  const referralCount = viewer?.qualified_referral_count ?? 0;

  const showReferralLimitMessage = useCallback(() => {
    const tier = getReferralTier(referralCount);
    const nextTier = getNextReferralTier(referralCount);
    const currentLimit = isSelectedPremiumModel
      ? tier.premiumModelDailyLimit
      : tier.standardModelDailyLimit;
    const nextLimit = nextTier
      ? isSelectedPremiumModel
        ? nextTier.premiumModelDailyLimit
        : nextTier.standardModelDailyLimit
      : null;
    const referralsNeeded = nextTier
      ? Math.max(0, nextTier.referralsRequired - referralCount)
      : 0;

    toast.error(
      `You've used all ${currentLimit} ${isSelectedPremiumModel ? "premium" : "standard"} Freebuff messages for today. ${
        nextTier
          ? `Get ${referralsNeeded} qualified ${
              referralsNeeded === 1 ? "referral" : "referrals"
            } to unlock ${nextLimit} per day.`
          : "You've already unlocked the highest referral tier."
      }`,
      {
        duration: 9000,
        action: {
          label: "Get referrals",
          onClick: () => {
            window.location.href = "/web/referrals";
          },
        },
      },
    );
  }, [isSelectedPremiumModel, referralCount]);

  const handleFreebuffModelChange = useCallback((modelId: string) => {
    const resolved = resolveFreebuffModel(modelId);
    setSelectedFreebuffModel(resolved);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FREEBUFF_MODEL_STORAGE_KEY, resolved);
    }
  }, []);

  const handleCliPreferenceChange = useCallback(
    async (key: CliPreferenceKey, value: string) => {
      try {
        await setCliPreference({ key, value });
        if (key === "gpt_auth_method") {
          toast.success(
            value === "oauth"
              ? "Codex auth mode set to OAuth"
              : "Codex auth mode set to BYOK",
          );
          return;
        }
        if (key === "gpt_model_preference") {
          return;
        }
        if (key === "claude_model_preference") {
          return;
        }
        if (key === "claude_provider_preference") {
          const nextModelDefault =
            value === "bedrock"
              ? "us.anthropic.claude-sonnet-4-6"
              : "claude-sonnet-4-6";
          await setCliPreference({
            key: "claude_model_preference",
            value: nextModelDefault,
          });
        }
        toast.success(
          value === "anthropic"
            ? "Claude provider set to Anthropic"
            : "Claude provider set to Bedrock",
        );
      } catch {
        if (
          key === "gpt_model_preference" ||
          key === "claude_model_preference"
        ) {
          return;
        }
        toast.error(
          key === "gpt_auth_method"
            ? "Failed to update Codex auth method"
            : "Failed to set Claude provider",
        );
      }
    },
    [byokSettings?.claudeProviderPreference, setCliPreference],
  );

  const customCliModelSelector =
    activeThread?.agent_type === "Codex" && byokSettings ? (
      <>
        <CliRuntimePreferenceSelector
          agentType="Codex"
          settings={byokSettings}
          onSelect={handleCliPreferenceChange}
          disabled={isProcessing}
        />
        <CliModelPreferenceSelector
          agentType="Codex"
          settings={byokSettings}
          onSelect={handleCliPreferenceChange}
          disabled={isProcessing}
        />
      </>
    ) : activeThread?.agent_type === "Claude Code" && byokSettings ? (
      <>
        <CliRuntimePreferenceSelector
          agentType="Claude Code"
          settings={byokSettings}
          onSelect={handleCliPreferenceChange}
          disabled={isProcessing}
        />
        <CliModelPreferenceSelector
          agentType="Claude Code"
          settings={byokSettings}
          onSelect={handleCliPreferenceChange}
          disabled={isProcessing}
        />
      </>
    ) : undefined;

  // State for editing thread title
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");

  // Update thread title mutation
  const updateThreadTitle = useMutation(
    api.coding_agent.cli_agent.agent_thread.updateAgentThreadTitle,
  );

  // Handler for sending messages
  // dispatchSend performs the actual mutation call and is what the message
  // queue invokes when a queued message auto-fires after the current run
  // completes. The public handleSendMessage below decides between sending
  // immediately and enqueueing.
  const dispatchSend = useCallback(
    async (message: string, images: Id<"_storage">[]): Promise<boolean> => {
      if (!project) {
        return false;
      }

      if (
        !message.trim() &&
        images.length === 0 &&
        !selectedNodeInfoRef.current?.image
      ) {
        return false;
      }

      trackRedditFirstPromptOnce();

      // Freebuff Web threads are normalized server-side, but the active thread
      // query can lag behind the first send. Default to Freebuff so the selected
      // MiniMax M3 model is included even before that query resolves.
      const agentType = activeThread?.agent_type || "Freebuff";
      const configAgent =
        agentType === "Codex" || agentType === "Claude Code"
          ? agentType
          : undefined;
      if (
        configAgent &&
        byokSettings !== undefined &&
        !isCliAgentConfigured(configAgent, byokSettings)
      ) {
        toast.error(`Configure ${configAgent} before sending a message.`);
        return false;
      }

      // Capture selected node info before clearing it
      const currentSelectedNode = selectedNodeInfoRef.current;
      let fullMessage = message;

      // If we have a selected node, include its context in the message
      if (currentSelectedNode) {
        const nodeDescription =
          currentSelectedNode.reactHierarchyFormatted &&
          currentSelectedNode.reactHierarchyFormatted !==
            "No React components found for this element."
            ? `${currentSelectedNode.reactHierarchyFormatted.split(":")[1]?.split("child of")[0]?.trim() || currentSelectedNode.selector} (selector: ${currentSelectedNode.selector})`
            : currentSelectedNode.selector;

        fullMessage = `Selected node: ${nodeDescription}\n${message}`;

        updateSelectedNodeInfo(null);
      }

      try {
        const result = await sendMessage({
          projectSemanticIdentifier,
          message: fullMessage,
          images: images.length > 0 ? images : undefined,
          agentType: agentType as
            | "Claude Code"
            | "Codex"
            | "Gemini CLI"
            | "Freebuff",
          freebuffModel:
            agentType === "Freebuff"
              ? selectedFreebuffModelRef.current
              : undefined,
        });

        if (result && !result.success && result.error) {
          handleAgentSendError(result.error);
          return false;
        }

        if (result?.success) {
          setTimeout(() => {
            chatMessagesRef.current?.scrollToBottom();
          }, 100);
          return true;
        }

        return false;
      } catch {
        toast.error("Failed to send message. Please try again.");
        return false;
      }
    },
    [
      project,
      sendMessage,
      projectSemanticIdentifier,
      activeThread,
      byokSettings,
      updateSelectedNodeInfo,
    ],
  );

  // Client-side message queue: max 1 message can wait while a turn is in
  // flight. When isProcessing flips false, the queue auto-fires the
  // pending message via dispatchSend (which still passes through the
  // server-side rate-limit gate).
  const messageQueue = useMessageQueue({
    onProcessMessage: async (message, images) => {
      await dispatchSend(message, images);
    },
    isProcessing,
  });

  const MAX_QUEUED_MESSAGES = 1;

  const handleSendMessage = useCallback(
    async (message: string, images: Id<"_storage">[]): Promise<boolean> => {
      if (!project) {
        return false;
      }

      const hasContent =
        message.trim().length > 0 ||
        images.length > 0 ||
        !!selectedNodeInfoRef.current?.image;

      if (!hasContent) {
        return false;
      }

      if (selectedDailyRemaining === 0) {
        showReferralLimitMessage();
        return false;
      }

      // While a turn is running, route the new message into the
      // single-slot queue rather than rejecting it outright. The
      // backend already rejects parallel sends on the same thread
      // via the THREAD_PROCESSING gate, so this is purely a UX
      // affordance that lets the user line up exactly one follow-up.
      if (isProcessing) {
        if (messageQueue.queue.length >= MAX_QUEUED_MESSAGES) {
          toast.error("Only 1 message can be queued at a time.", {
            duration: 4000,
          });
          return false;
        }

        messageQueue.addToQueue(message, images);
        toast.success(
          "Message queued. It will send when the current one finishes.",
          { duration: 3000 },
        );
        // Clear any selected node attachment so it does not leak into
        // a later, unrelated send.
        if (selectedNodeInfoRef.current) {
          updateSelectedNodeInfo(null);
        }
        return true;
      }

      return dispatchSend(message, images);
    },
    [
      project,
      isProcessing,
      messageQueue,
      dispatchSend,
      updateSelectedNodeInfo,
      selectedDailyRemaining,
      showReferralLimitMessage,
    ],
  );

  // Wrapper for BuildErrors (expects (message: string) => Promise<unknown>)
  const sendAutomatedAgentMessage = useCallback(
    async (message: string) => {
      return handleSendMessage(message, []);
    },
    [handleSendMessage],
  );

  // Expose the sender to an external surface (cloud preview "send logs to chat").
  // No-op on Freebuff Web, which never passes this prop.
  useEffect(() => {
    onRegisterSendMessage?.(sendAutomatedAgentMessage);
  }, [onRegisterSendMessage, sendAutomatedAgentMessage]);

  // Listen for vly-toolbar-select events from the codesandbox iframe
  useEffect(() => {
    function handleToolbarSelect(event: MessageEvent) {
      if (event.data && event.data.type === "vly-toolbar-select") {
        updateSelectedNodeInfo({
          selector: event.data.selector,
          reactHierarchyFormatted: event.data.reactHierarchyFormatted,
          image: event.data.image,
        });
        setIsSelectingElement(false);
      }
    }

    function handleChatMessage(event: Event) {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const message = customEvent.detail?.message;
      if (!message || !message.trim()) return;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(
          `chat-send-${projectSemanticIdentifier}`,
        );
        window.localStorage.removeItem(
          `chat-draft-${projectSemanticIdentifier}`,
        );
      }
      void handleSendMessage(message, []);
    }

    window.addEventListener("message", handleToolbarSelect);
    window.addEventListener("sendChatMessage", handleChatMessage);
    return () => {
      window.removeEventListener("message", handleToolbarSelect);
      window.removeEventListener("sendChatMessage", handleChatMessage);
    };
  }, [
    updateSelectedNodeInfo,
    setIsSelectingElement,
    handleSendMessage,
    projectSemanticIdentifier,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sendKey = `chat-send-${projectSemanticIdentifier}`;
    const message = window.localStorage.getItem(sendKey);
    if (!message || !message.trim()) return;
    window.localStorage.removeItem(sendKey);
    void handleSendMessage(message, []);
  }, [projectSemanticIdentifier, handleSendMessage]);

  // Handle setting active thread
  const setActiveThread = useMutation(api.project.setActiveThread);

  const handleSetActiveThread = useCallback(
    (
      threadId: Id<"agent_thread"> | Id<"thread">,
      threadType: "agent_thread" | "thread",
    ) => {
      if (project) {
        if (threadType === "thread") {
          // Old thread - switch to old chat UI
          setActiveThread({
            projectId: project._id,
            threadId: threadId as Id<"thread">,
          });
          setShowThreadList(false);
          if (onSelectOldThread) {
            onSelectOldThread(threadId as Id<"thread">);
          }
        } else {
          // New agent thread
          setActiveAgentThread({
            projectId: project._id,
            threadId: threadId as Id<"agent_thread">,
          });
          setShowThreadList(false);
        }
      }
    },
    [project, setActiveAgentThread, setActiveThread, onSelectOldThread],
  );

  const createThread = useCallback(
    async (agentType: AgentType) => {
      if (!projectSemanticIdentifier || !project || isProcessing) return;
      try {
        await createNewAgentThread({
          projectSemanticIdentifier,
          agentType,
        });
        setShowThreadList(false);
        setShowAgentPickerDialog(false);
      } catch {
        toast.error("Failed to create new thread");
      }
    },
    [project, isProcessing, createNewAgentThread, projectSemanticIdentifier],
  );

  const handleCreateNewThread = useCallback(() => {
    if (!projectSemanticIdentifier || !project || isProcessing) return;
    setShowAgentPickerDialog(true);
  }, [projectSemanticIdentifier, project, isProcessing]);

  const handleSelectAgentAndCreateThread = useCallback(
    async (agentType: AgentType) => {
      if (agentType === "Gemini CLI") {
        toast.error(GEMINI_CLI_MAINTENANCE_MESSAGE);
        return;
      }

      if (
        (agentType === "Codex" || agentType === "Claude Code") &&
        !hasAcknowledgedDisclaimer()
      ) {
        setPendingAgentSelection(agentType);
        setShowDisclaimerDialog(true);
        return;
      }

      await createThread(agentType);
    },
    [createThread],
  );

  const handleDisclaimerAcknowledged = useCallback(() => {
    if (!pendingAgentSelection) return;
    void createThread(pendingAgentSelection);
    setPendingAgentSelection(null);
  }, [pendingAgentSelection, createThread]);

  const handleAgentPickerOpenChange = useCallback((open: boolean) => {
    setShowAgentPickerDialog(open);
  }, []);

  const handleDisclaimerOpenChange = useCallback((open: boolean) => {
    setShowDisclaimerDialog(open);
    if (!open) {
      setPendingAgentSelection(null);
    }
  }, []);

  const handleSwitchAgentOnCurrentThread = useCallback(
    async (agentType: AgentType) => {
      if (!activeThread || isProcessing) {
        return;
      }

      if (agentType === "Gemini CLI") {
        toast.error(GEMINI_CLI_MAINTENANCE_MESSAGE);
        return;
      }

      try {
        await switchAgentOnThread({ threadId: activeThread._id, agentType });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to switch agent";
        toast.error(message);
      }
    },
    [activeThread, isProcessing, switchAgentOnThread],
  );

  const getAgentButtonClasses = (disabled = false) =>
    [
      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
      disabled
        ? "cursor-not-allowed border-border/50 bg-muted/40 opacity-60"
        : "border-border/70 hover:bg-muted",
    ].join(" ");

  // Handle canceling a message
  const handleCancelMessage = useCallback(
    async (messageId: Id<"agent_message">) => {
      try {
        await cancelMessage({ messageId });
        toast.success("Message cancelled");
      } catch (error) {
        console.error("Failed to cancel message:", error);
        toast.error("Failed to cancel message");
      }
    },
    [cancelMessage],
  );

  // Handle terminating thread from ChatInput X button - cancels the currently streaming message
  const handleTerminateThread = useCallback(async () => {
    // Drop any pending queued message first so it does not auto-fire
    // after we cancel the currently streaming message.
    messageQueue.clearQueue();

    if (currentStreamingMessage?.isStreaming && currentStreamingMessage._id) {
      await handleCancelMessage(currentStreamingMessage._id);
    }
  }, [currentStreamingMessage, handleCancelMessage, messageQueue]);

  return (
    <TooltipProvider delayDuration={200}>
      {pendingAgentSelection && (
        <ModelDisclaimerDialog
          open={showDisclaimerDialog}
          onOpenChange={handleDisclaimerOpenChange}
          onAcknowledge={handleDisclaimerAcknowledged}
          modelName={pendingAgentSelection}
        />
      )}

      <Dialog
        open={showAgentPickerDialog}
        onOpenChange={handleAgentPickerOpenChange}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Thread</DialogTitle>
            <DialogDescription>
              Choose which agent should run this thread.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => void handleSelectAgentAndCreateThread("Freebuff")}
              disabled={isProcessing}
              className={getAgentButtonClasses(isProcessing)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <AgentLogo agentType="Freebuff" />
                  Freebuff
                </span>
                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-700">
                  Recommended
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Fast default workflow with Freebuff model selector.
              </p>
            </button>

            <button
              type="button"
              onClick={() => void handleSelectAgentAndCreateThread("Codex")}
              disabled={isProcessing}
              className={getAgentButtonClasses(isProcessing)}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <AgentLogo agentType="Codex" />
                Codex
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Runs OpenAI Codex with your ChatGPT OAuth or OpenAI key.
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                void handleSelectAgentAndCreateThread("Claude Code")
              }
              disabled={isProcessing}
              className={getAgentButtonClasses(isProcessing)}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <AgentLogo agentType="Claude Code" />
                Claude Code
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Runs Claude Code with your Anthropic or Bedrock credential.
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Early return if project is not loaded */}
      {!project ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center text-sm text-muted-foreground">
            Loading project…
          </div>
        </div>
      ) : showThreadList ? (
        <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-transparent">
          <AgentThreadList
            projectSemanticIdentifier={projectSemanticIdentifier}
            activeThreadId={
              project?.active_agent_thread || project?.active_thread
            }
            onSelectThread={handleSetActiveThread}
            onCreateNewThread={handleCreateNewThread}
            isProcessing={isProcessing}
          />
        </div>
      ) : (
        <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-transparent">
          {/*
            Plain div (no framer-motion slide) — we removed the thread
            animator per design feedback. State changes apply instantly.
          */}
              {/*
                Header — back button + thread title (no agent badge, no
                inline switcher, no Codex chips). The Pencil edit affordance
                stays subtle and only appears on hover.
              */}
              <div className="group flex-shrink-0 border-b border-border bg-transparent px-3 py-2 sm:px-4">
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowThreadList(true);
                        }}
                        type="button"
                        aria-label="All threads"
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-7 lg:w-7"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      sideOffset={6}
                      className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
                    >
                      All threads
                    </TooltipContent>
                  </Tooltip>
                  {activeThread && (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                      {isEditingTitle ? (
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={async () => {
                            if (activeThread._id) {
                              await updateThreadTitle({
                                threadId: activeThread._id,
                                title: editingTitle || undefined,
                              });
                            }
                            setIsEditingTitle(false);
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              if (activeThread._id) {
                                await updateThreadTitle({
                                  threadId: activeThread._id,
                                  title: editingTitle || undefined,
                                });
                              }
                              setIsEditingTitle(false);
                            } else if (e.key === "Escape") {
                              setIsEditingTitle(false);
                              setEditingTitle("");
                            }
                          }}
                          className="h-7 flex-1 border-border/60 bg-transparent text-sm"
                          autoFocus
                        />
                      ) : (
                        <>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild disabled={isProcessing}>
                              <button className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                                {activeThread.agent_type === "Freebuff" ||
                                activeThread.agent_type === "Codex" ||
                                activeThread.agent_type === "Claude Code" ? (
                                  <AgentLogo
                                    agentType={activeThread.agent_type}
                                    className="h-4 w-4"
                                  />
                                ) : null}
                                {activeThread.agent_type}
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52">
                              <DropdownMenuItem
                                onClick={() =>
                                  void handleSwitchAgentOnCurrentThread("Freebuff")
                                }
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-2">
                                  <AgentLogo agentType="Freebuff" />
                                  Freebuff
                                </span>
                                {activeThread.agent_type === "Freebuff" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void handleSwitchAgentOnCurrentThread("Codex")
                                }
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-2">
                                  <AgentLogo agentType="Codex" />
                                  Codex
                                </span>
                                {activeThread.agent_type === "Codex" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void handleSwitchAgentOnCurrentThread(
                                    "Claude Code",
                                  )
                                }
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-2">
                                  <AgentLogo agentType="Claude Code" />
                                  Claude Code
                                </span>
                                {activeThread.agent_type === "Claude Code" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </DropdownMenuItem>
                              {activeThread.agent_type === "Gemini CLI" && (
                                <DropdownMenuItem disabled>
                                  Gemini CLI
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  window.location.href =
                                    "/web/settings#ai-credentials";
                                }}
                              >
                                Configure agents
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <span className="min-w-0 truncate text-sm font-medium text-foreground/90">
                            {activeThread.title ||
                              `Thread ${new Date(activeThread.last_edited_timestamp).toLocaleString()}`}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  setEditingTitle(
                                    activeThread.title ||
                                      `Thread ${new Date(activeThread.last_edited_timestamp).toLocaleString()}`,
                                  );
                                  setIsEditingTitle(true);
                                }}
                                aria-label="Rename thread"
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground lg:h-6 lg:w-6 lg:opacity-0 lg:group-hover:opacity-100"
                              >
                                <Pencil className="h-3.5 w-3.5 lg:h-3 lg:w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              sideOffset={6}
                              className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
                            >
                              Rename thread
                            </TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  )}
                  <div className="ml-1 flex shrink-0 items-center gap-0.5 sm:ml-2">
                    {onOpenVersions && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenVersions();
                            }}
                            type="button"
                            aria-label="Version history"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <History className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={6}
                          className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
                        >
                          Version history
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isProcessing) {
                              void handleCreateNewThread();
                            }
                          }}
                          type="button"
                          aria-label="New thread"
                          disabled={isProcessing}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        sideOffset={6}
                        className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
                      >
                        New thread
                      </TooltipContent>
                    </Tooltip>
                    {onOpenGitHub && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenGitHub();
                            }}
                            type="button"
                            aria-label={githubActionLabel}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Github className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={6}
                          className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
                        >
                          {githubActionLabel}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>

              {/* Build Errors - shown at top of chat */}
              {project && (
                <BuildErrors
                  project={project}
                  sendMessage={sendAutomatedAgentMessage}
                />
              )}

              {shouldShowAgentConfigurationPanel && activeConfigAgent ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-4">
                  <div className="mx-auto max-w-2xl">
                    <CliAgentConfigurationPanel
                      agent={activeConfigAgent}
                      projectSemanticIdentifier={projectSemanticIdentifier}
                      variant="chat"
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Messages */}
                  <Suspense fallback={<ChatSkeleton />}>
                    <AgentChatMessages
                      key={project?.active_agent_thread || "no-thread"}
                      ref={chatMessagesRef}
                      project={project}
                      projectSemanticIdentifier={projectSemanticIdentifier}
                      onSendMessage={(message) => handleSendMessage(message, [])}
                      onCreateNewThread={handleCreateNewThread}
                      onRestoreMessage={setMessageToRestore}
                      onActiveAskUserQuestionsChange={
                        handleActiveAskUserQuestionsChange
                      }
                    />
                  </Suspense>

                  {/* Compact Runtime Errors - Subtle and compact */}
                  {project && (
                    <CompactRuntimeErrors
                      project={project}
                      onSendMessage={handleSendMessage}
                    />
                  )}

              {/* Selected Node Preview - Shows selected element before chat input */}
              {!hideElementSelector && selectedNodeInfo && (
                <div className="border-t border-border/40 bg-muted/30 px-4 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="flex-shrink-0 text-muted-foreground"
                    >
                      <circle
                        cx="10"
                        cy="10"
                        r="8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <line
                        x1="10"
                        y1="2"
                        x2="10"
                        y2="6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="10"
                        y1="14"
                        x2="10"
                        y2="18"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="2"
                        y1="10"
                        x2="6"
                        y2="10"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="14"
                        y1="10"
                        x2="18"
                        y2="10"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <circle cx="10" cy="10" r="2" fill="currentColor" />
                    </svg>
                    {selectedNodeInfo.image ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          background: "var(--project-selected-node-bg)",
                          borderRadius: 8,
                          padding: 6,
                        }}
                      >
                        <img
                          src={selectedNodeInfo.image}
                          alt="Selected node preview"
                          style={{
                            maxWidth: 200,
                            maxHeight: 120,
                            width: "auto",
                            height: "auto",
                            display: "block",
                            borderRadius: 6,
                            background: "var(--project-selected-node-image-bg)",
                          }}
                        />
                      </div>
                    ) : (
                      <span className="truncate text-foreground/80">
                        {selectedNodeInfo.reactHierarchyFormatted &&
                        selectedNodeInfo.reactHierarchyFormatted !==
                          "No React components found for this element."
                          ? `Selected node: ${selectedNodeInfo.reactHierarchyFormatted.split(":")[1]?.split("child of")[0]?.trim() || selectedNodeInfo.selector} (selector: ${selectedNodeInfo.selector})`
                          : `Selected node: ${selectedNodeInfo.selector}`}
                      </span>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => {
                            updateSelectedNodeInfo(null);
                            setIsSelectingElement(false);
                          }}
                          aria-label="Clear selection"
                          type="button"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        sideOffset={6}
                        className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
                      >
                        Clear selection
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}

              {activeAskUserQuestions.length > 0 ? (
                <div className="flex-shrink-0 border-t border-border/20 bg-transparent pt-3">
                  <AskUserComposer
                    questions={activeAskUserQuestions}
                    onSubmit={async (message) => {
                      const sent = await handleSendMessage(message, []);
                      if (sent) setActiveAskUserQuestions([]);
                      return sent;
                    }}
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 border-t border-border bg-transparent">
                  <DailyReferralLimitBanner
                    selectedModelId={selectedFreebuffModel}
                    remaining={selectedDailyRemaining}
                    retryAfterMs={
                      selectedLimitStatus?.retryAt
                        ? Math.max(0, selectedLimitStatus.retryAt - Date.now())
                        : null
                    }
                    referralCount={referralCount}
                  />
                  <ChatInput
                    isProcessing={isProcessing}
                    handleSendMessage={handleSendMessage}
                    projectSemanticIdentifier={projectSemanticIdentifier}
                    terminateThread={handleTerminateThread}
                    isSelectingElement={isSelectingElement}
                    setIsSelectingElement={setIsSelectingElement}
                    projectId={project?._id}
                    onOpenDivergenceDialog={() => {}}
                    queuedMessages={messageQueue.queue}
                    onRemoveQueuedMessage={messageQueue.removeFromQueue}
                    externalSelectedNodeInfo={selectedNodeInfo}
                    onSelectedNodeInfoChange={updateSelectedNodeInfo}
                    onUserInputChange={() => {}}
                    selectedAgentMode="POWERFUL"
                    onAgentModeChange={undefined}
                    selectedFreebuffModel={
                      isFreebuffThread ? selectedFreebuffModel : undefined
                    }
                    onFreebuffModelChange={
                      isFreebuffThread ? handleFreebuffModelChange : undefined
                    }
                    customModelSelector={customCliModelSelector}
                    syncStatus={undefined}
                    activeEntryPointId={undefined}
                    restoreMessage={messageToRestore}
                    compactMode={true}
                    hideElementSelector={hideElementSelector}
                    issueReportSource="cloud"
                    issueReportThreadId={
                      project.active_agent_thread
                        ? String(project.active_agent_thread)
                        : undefined
                    }
                  />
                </div>
              )}
                </>
              )}
        </div>
      )}
    </TooltipProvider>
  );
}
