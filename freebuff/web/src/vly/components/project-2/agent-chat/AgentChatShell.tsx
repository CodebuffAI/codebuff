"use client";

import { AgentChatMessages, AgentChatMessagesRef } from "./AgentChatMessages";
import { ChatSkeleton } from "../ChatSkeleton";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FunctionReturnType } from "convex/server";
import { useCallback, useRef, Suspense, useState, useEffect } from "react";
import { useChatStorageContext } from "@/vly/contexts/ChatStorageContext";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useAction } from "convex/react";
import { toast } from "sonner";
import { formatRetryTime } from "@/vly/lib/rateLimitHelpers";
import { AgentThreadList } from "./AgentThreadList";
import { ChatInput } from "../ChatInput";
import {
  ChevronLeft,
  X,
  AlertTriangle,
  ChevronDown,
  Pencil,
  Loader,
  KeyRound,
  Copy,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/vly/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import {
  ModelDisclaimerDialog,
  hasAcknowledgedDisclaimer,
} from "../ModelDisclaimerDialog";

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
    <div className="flex-shrink-0 border-t border-zinc-200 bg-zinc-50">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between px-3 py-1.5">
          <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-700">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span>
              {unresolvedRuntimeErrors.length} runtime error
              {unresolvedRuntimeErrors.length !== 1 ? "s" : ""}
            </span>
            <ChevronDown
              className={`h-2.5 w-2.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <Button
            onClick={handleFix}
            size="sm"
            variant="outline"
            className="h-5 gap-1 px-2 text-[10px]"
          >
            Fix
          </Button>
        </div>
        <CollapsibleContent>
          <div className="max-h-32 space-y-1 overflow-y-auto border-t border-zinc-200 bg-white px-3 py-1.5">
            {unresolvedRuntimeErrors.map((err, idx) => (
              <div
                key={idx}
                className="group relative rounded border border-zinc-200 bg-zinc-50 p-1.5"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteRuntimeError({ errorId: err._id })}
                  className="absolute right-0.5 top-0.5 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5 text-zinc-400" />
                </Button>
                <div className="pr-6">
                  <div className="text-[10px] font-medium text-zinc-700">
                    {err.error}
                  </div>
                  <div className="mt-0.5 text-[9px] text-zinc-500">
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

interface AgentChatShellProps {
  project: FunctionReturnType<typeof api.project.getProjectData>;
  projectSemanticIdentifier: string;
  onSwitchToOldChat?: () => void;
  onCreateVlyThread?: () => Promise<void>;
  onSelectOldThread?: (threadId: Id<"thread">) => void;
  isSelectingElement?: boolean;
  setIsSelectingElement?: (v: boolean) => void;
}

export function AgentChatShell({
  project,
  projectSemanticIdentifier,
  onSelectOldThread,
  isSelectingElement: externalIsSelectingElement,
  setIsSelectingElement: externalSetIsSelectingElement,
}: AgentChatShellProps) {
  const vlyAgentDisplayName = "vly agent 2.0";
  // All hooks must be called unconditionally before any early returns
  const chatMessagesRef = useRef<AgentChatMessagesRef>(null);
  const [showThreadList, setShowThreadList] = useState(false);
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

    const existingStreamedMessages = localStore.getQuery(
      api.coding_agent.cli_agent.queries.getStreamedAgentMessages,
      {
        semanticIdentifier,
      },
    );

    if (existingStreamedMessages === undefined) {
      return;
    }

    const now = Date.now();
    const optimisticMessage = {
      _id: crypto.randomUUID() as Id<"agent_message">,
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

    // Streamed query returns the active in-flight message only.
    localStore.setQuery(
      api.coding_agent.cli_agent.queries.getStreamedAgentMessages,
      {
        semanticIdentifier,
      },
      [optimisticMessage],
    );
  });
  const startCodexDeviceAuth = useAction(
    api.coding_agent.cli_agent.execute.startCodexDeviceAuth,
  );
  const getCodexDeviceAuthStatus = useAction(
    api.coding_agent.cli_agent.execute.getCodexDeviceAuthStatus,
  );
  const resetCodexDeviceAuth = useAction(
    api.coding_agent.cli_agent.execute.resetCodexDeviceAuth,
  );

  // Cancel message action
  const cancelMessage = useAction(
    api.coding_agent.cli_agent.agent_message.cancelAgentMessage,
  );

  // Get currently streaming message to cancel it from ChatInput X button
  const hasActiveThread = !!project?.active_agent_thread;
  const streamedMessages = useQuery(
    api.coding_agent.cli_agent.queries.getStreamedAgentMessages,
    hasActiveThread
      ? { semanticIdentifier: projectSemanticIdentifier }
      : "skip",
  );
  const currentStreamingMessage = streamedMessages?.[0];

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

  // State to track message to restore to input
  const [messageToRestore, setMessageToRestore] = useState<string | null>(null);

  // State for editing thread title
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");

  // State for model selection dialog
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);
  const [pendingModelSelection, setPendingModelSelection] = useState<
    "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff" | null
  >(null);
  const [isStartingCodexAuth, setIsStartingCodexAuth] = useState(false);
  const [codexAuthUrl, setCodexAuthUrl] = useState<string | null>(null);
  const [codexOneTimeCode, setCodexOneTimeCode] = useState<string | null>(null);
  const [codexAuthStatus, setCodexAuthStatus] = useState<{
    hasAuthFile: boolean;
    isAuthenticated: boolean;
    authMode?: string;
    lastRefresh?: string;
  } | null>(null);
  const [isCheckingCodexAuth, setIsCheckingCodexAuth] = useState(false);
  const [isResettingCodexAuth, setIsResettingCodexAuth] = useState(false);
  const [showCodexAuthSettings, setShowCodexAuthSettings] = useState(false);
  const [showCodexSetupInstructions, setShowCodexSetupInstructions] =
    useState(false);

  // Update thread title mutation
  const updateThreadTitle = useMutation(
    api.coding_agent.cli_agent.agent_thread.updateAgentThreadTitle,
  );

  // Handler for sending messages
  const handleSendMessage = useCallback(
    async (message: string, images: Id<"_storage">[]): Promise<boolean> => {
      if (!project || isProcessing) {
        return false;
      }

      if (
        !message.trim() &&
        images.length === 0 &&
        !selectedNodeInfoRef.current?.image
      ) {
        return false;
      }

      // Get the agent type from the active thread, default to Freebuff if no thread
      const agentType = activeThread?.agent_type || "Freebuff";

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
          agentType: agentType as "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff",
        });

        // Check if rate limited
        if (result && !result.success && result.error?.kind === "RateLimited") {
          const retryAfterMs =
            "retryAfter" in result.error ? result.error.retryAfter || 0 : 0;
          const timeString = formatRetryTime(retryAfterMs);
          toast.error(
            `Rate limit exceeded. Please wait ${timeString} before sending another message.`,
            { duration: 5000 },
          );
          return false;
        }

        // Check if content moderation blocked
        if (
          result &&
          !result.success &&
          result.error?.kind === "CONTENT_MODERATION"
        ) {
          toast.error(result.error.message || "This content is not allowed.", {
            duration: 6000,
          });
          return false;
        }

        // Scroll to bottom after sending message
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
      isProcessing,
      sendMessage,
      projectSemanticIdentifier,
      activeThread,
      updateSelectedNodeInfo,
    ],
  );

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

    window.addEventListener("message", handleToolbarSelect);
    return () => {
      window.removeEventListener("message", handleToolbarSelect);
    };
  }, [updateSelectedNodeInfo, setIsSelectingElement]);

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

  // Handle creating new thread - show model selection dialog
  const handleCreateNewThread = useCallback(() => {
    // Allow opening dialog even if project is loading (we'll disable create button if needed)
    // But we need projectSemanticIdentifier at minimum
    if (!projectSemanticIdentifier) return;
    setShowModelDialog(true);
  }, [projectSemanticIdentifier]);

  // Actually create the thread (called after disclaimer acknowledgment)
  const createThreadAfterAcknowledgment = useCallback(
    async (agentType: "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff") => {
      if (!project || isProcessing) return;

      try {
        await createNewAgentThread({
          projectSemanticIdentifier,
          agentType,
        });

        // createNewAgentThread already sets active_agent_thread on the project
        setShowModelDialog(false);
        setShowThreadList(false);
      } catch {
        toast.error("Failed to create new thread");
      }
    },
    [
      project,
      isProcessing,
      createNewAgentThread,
      projectSemanticIdentifier,
    ],
  );

  // Handle model selection and check disclaimer first
  const handleSelectModelAndCreateThread = useCallback(
    async (agentType: "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff") => {
      if (!project || isProcessing) return;

      // Check if user needs to acknowledge disclaimer for these models
      if (
        (agentType === "Claude Code" ||
          agentType === "Codex" ||
          agentType === "Gemini CLI") &&
        !hasAcknowledgedDisclaimer()
      ) {
        // Show disclaimer dialog
        setPendingModelSelection(agentType);
        setShowDisclaimerDialog(true);
        return;
      }

      // User has already acknowledged, proceed with thread creation
      await createThreadAfterAcknowledgment(agentType);
    },
    [project, isProcessing, createThreadAfterAcknowledgment],
  );

  // Handle disclaimer acknowledgment
  const handleDisclaimerAcknowledged = useCallback(() => {
    if (pendingModelSelection) {
      createThreadAfterAcknowledgment(pendingModelSelection);
      setPendingModelSelection(null);
    }
  }, [pendingModelSelection, createThreadAfterAcknowledgment]);

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
    if (currentStreamingMessage?.isStreaming && currentStreamingMessage._id) {
      await handleCancelMessage(currentStreamingMessage._id);
    }
  }, [currentStreamingMessage, handleCancelMessage]);

  const copyAuthValue = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }, []);

  const refreshCodexAuthStatus = useCallback(async () => {
    if (!activeThread || activeThread.agent_type !== "Codex") return;

    setIsCheckingCodexAuth(true);
    try {
      const status = await getCodexDeviceAuthStatus({
        projectSemanticIdentifier,
      });
      if (!status.success) {
        toast.error(status.message || "Failed to check Codex auth status.");
        return;
      }
      setCodexAuthStatus({
        hasAuthFile: status.hasAuthFile,
        isAuthenticated: status.isAuthenticated,
        authMode: status.authMode,
        lastRefresh: status.lastRefresh,
      });
    } catch {
      toast.error("Failed to check Codex auth status.");
    } finally {
      setIsCheckingCodexAuth(false);
    }
  }, [activeThread, getCodexDeviceAuthStatus, projectSemanticIdentifier]);

  const handleResetCodexDeviceLogin = useCallback(async () => {
    if (!activeThread || activeThread.agent_type !== "Codex") return;

    setIsResettingCodexAuth(true);
    try {
      const result = await resetCodexDeviceAuth({
        projectSemanticIdentifier,
      });
      if (!result.success) {
        toast.error(result.message || "Failed to reset Codex auth.");
        return;
      }

      setCodexAuthUrl(null);
      setCodexOneTimeCode(null);
      setShowCodexSetupInstructions(false);
      setCodexAuthStatus({
        hasAuthFile: result.hasAuthFile,
        isAuthenticated: result.isAuthenticated,
      });
      toast.success("Codex login has been reset. Start device login again.");
    } catch {
      toast.error("Failed to reset Codex auth.");
    } finally {
      setIsResettingCodexAuth(false);
    }
  }, [activeThread, projectSemanticIdentifier, resetCodexDeviceAuth]);

  const handleStartCodexDeviceLogin = useCallback(async () => {
    if (!activeThread || activeThread.agent_type !== "Codex") return;

    setIsStartingCodexAuth(true);
    try {
      const result = await startCodexDeviceAuth({
        projectSemanticIdentifier,
      });

      if (result.alreadyAuthenticated) {
        setCodexAuthUrl(null);
        setCodexOneTimeCode(null);
        setShowCodexSetupInstructions(false);
        setCodexAuthStatus({
          hasAuthFile: result.hasAuthFile,
          isAuthenticated: result.isAuthenticated,
          authMode: result.authMode,
          lastRefresh: result.lastRefresh,
        });
        toast.success("Codex auth token already exists on this machine.");
        return;
      }

      if (result.authUrl) {
        setCodexAuthUrl(result.authUrl);
      }
      if (result.oneTimeCode) {
        setCodexOneTimeCode(result.oneTimeCode);
      }
      if (result.authUrl || result.oneTimeCode) {
        setShowCodexSetupInstructions(true);
      }
      setCodexAuthStatus({
        hasAuthFile: result.hasAuthFile,
        isAuthenticated: result.isAuthenticated,
        authMode: result.authMode,
        lastRefresh: result.lastRefresh,
      });

      if (result.success) {
        toast.success(
          "Device login started. Open auth link and enter the code.",
        );
      } else {
        toast.error(result.message || "Could not start Codex device auth.");
      }
    } catch {
      toast.error("Could not start Codex device login. Please try again.");
    } finally {
      setIsStartingCodexAuth(false);
    }
  }, [activeThread, projectSemanticIdentifier, startCodexDeviceAuth]);

  useEffect(() => {
    if (activeThread?.agent_type !== "Codex") {
      setShowCodexAuthSettings(false);
      setCodexAuthUrl(null);
      setCodexOneTimeCode(null);
      setShowCodexSetupInstructions(false);
      return;
    }
    void refreshCodexAuthStatus();
  }, [activeThread?._id, activeThread?.agent_type, refreshCodexAuthStatus]);

  useEffect(() => {
    if (codexAuthStatus?.isAuthenticated) {
      setShowCodexAuthSettings(false);
      setCodexAuthUrl(null);
      setCodexOneTimeCode(null);
      setShowCodexSetupInstructions(false);
    }
  }, [codexAuthStatus?.isAuthenticated]);

  const isCodexThread = activeThread?.agent_type === "Codex";
  const isCodexConnected = codexAuthStatus?.isAuthenticated === true;
  const hasCodexDeviceAuthValues = !!codexAuthUrl || !!codexOneTimeCode;
  const showCodexInstructionView =
    hasCodexDeviceAuthValues && showCodexSetupInstructions;
  const showCodexDeviceBanner = isCodexThread && showCodexAuthSettings;

  return (
    <>
      {/* Model Disclaimer Dialog */}
      {pendingModelSelection && (
        <ModelDisclaimerDialog
          open={showDisclaimerDialog}
          onOpenChange={(open) => {
            setShowDisclaimerDialog(open);
            if (!open) {
              // Clear pending selection if dialog is closed without acknowledgment
              setPendingModelSelection(null);
            }
          }}
          onAcknowledge={handleDisclaimerAcknowledged}
          modelName={pendingModelSelection}
        />
      )}

      {/* Model Selection Dialog - Always rendered, even when project is loading */}
      <Dialog
        open={showModelDialog}
        onOpenChange={(open) => {
          setShowModelDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg">Start New Thread</DialogTitle>
            <DialogDescription className="text-sm">
              This will create a new thread with the selected agent. Your
              current conversation will be preserved in its own thread.
            </DialogDescription>
          </DialogHeader>
          {isProcessing && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Loader className="h-3.5 w-3.5 animate-spin" />
              <span>Please wait for the current message to complete...</span>
            </div>
          )}
          <div className="space-y-2 py-2">
            <Card
              onClick={() => {
                if (!isProcessing && project) {
                  handleSelectModelAndCreateThread("Claude Code");
                }
              }}
              className={`transition-all ${
                isProcessing || !project
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-primary hover:bg-accent/50 active:scale-[0.98]"
              }`}
            >
              <CardHeader className="px-4 py-3 pb-2">
                <div className="flex items-center gap-2">
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg"
                    alt="Claude Code"
                    className="h-5 w-5 object-contain"
                  />
                  <CardTitle className="text-sm font-medium">
                    Claude Code
                  </CardTitle>
                  <span className="ml-auto rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[10px] font-medium text-purple-700">
                    Limited-time
                  </span>
                </div>
                <CardDescription className="mt-1 text-xs">
                  Most expensive, but best for fixing bugs.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card
              onClick={() => {
                if (!isProcessing && project) {
                  handleSelectModelAndCreateThread("Codex");
                }
              }}
              className={`transition-all ${
                isProcessing || !project
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-primary hover:bg-accent/50 active:scale-[0.98]"
              }`}
            >
              <CardHeader className="px-4 py-3 pb-2">
                <div className="flex items-center gap-2">
                  <img
                    src="https://www.svgrepo.com/show/306500/openai.svg"
                    alt="Codex"
                    className="h-5 w-5 object-contain"
                  />
                  <CardTitle className="text-sm font-medium">Codex</CardTitle>
                  <div className="ml-auto flex items-center gap-1">
                    <span className="rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[10px] font-medium text-purple-700">
                      Limited-time
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700">
                      Recommended
                    </span>
                  </div>
                </div>
                <CardDescription className="mt-1 text-xs">
                  Cheapest, best for intelligent features.
                </CardDescription>
                <div className="mt-1 text-[10px] font-medium text-blue-700">
                  Includes ChatGPT subscription device login option.
                </div>
              </CardHeader>
            </Card>

            <Card className="cursor-not-allowed opacity-50 transition-all">
              <CardHeader className="px-4 py-3 pb-2">
                <div className="flex items-center gap-2">
                  <img
                    src="https://google.gallerycdn.vsassets.io/extensions/google/gemini-cli-vscode-ide-companion/0.20.0/1765572429008/Microsoft.VisualStudio.Services.Icons.Default"
                    alt="Gemini CLI"
                    className="h-5 w-5 object-contain"
                  />
                  <CardTitle className="text-sm font-medium">
                    Gemini CLI
                  </CardTitle>
                  <span className="ml-auto rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[10px] font-medium text-purple-700">
                    Unavailable
                  </span>
                </div>
                <CardDescription className="mt-1 text-xs">
                  gemini is currently under maintence.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card
              onClick={() => {
                if (!isProcessing && project) {
                  handleSelectModelAndCreateThread("Freebuff");
                }
              }}
              className={`transition-all ${
                isProcessing || !project
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-primary hover:bg-accent/50 active:scale-[0.98]"
              }`}
            >
              <CardHeader className="px-4 py-3 pb-2">
                <div className="flex items-center gap-2">
                  <img
                    src="/favicon.svg"
                    alt={vlyAgentDisplayName}
                    className="h-5 w-5 object-contain"
                  />
                  <CardTitle className="text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <span>{vlyAgentDisplayName}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700">
                        New
                      </span>
                    </span>
                  </CardTitle>
                </div>
                <CardDescription className="mt-1 text-xs">
                  {vlyAgentDisplayName} default workflow.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Early return if project is not loaded - AFTER dialog */}
      {!project ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center text-zinc-500">Loading project...</div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {showThreadList ? (
            <motion.div
              key="thread-list"
              className="relative flex h-full w-full min-w-[320px] max-w-[500px] transform-gpu flex-col overflow-hidden bg-white shadow-[0_0_20px_0_rgba(45,45,45,0.18)] dark:border-l dark:border-[#363636] dark:bg-[#282828] dark:shadow-[0_0_28px_0_rgba(0,0,0,0.72)]"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{
                duration: 0.4,
                ease: [0, 0, 0.2, 1] as const,
              }}
              style={{ willChange: "transform" }}
            >
              <AgentThreadList
                projectSemanticIdentifier={projectSemanticIdentifier}
                activeThreadId={
                  project?.active_agent_thread || project?.active_thread
                }
                onSelectThread={handleSetActiveThread}
                onCreateNewThread={handleCreateNewThread}
                onBack={() => setShowThreadList(false)}
                isProcessing={isProcessing}
              />
            </motion.div>
          ) : (
            <motion.div
              key="chat-panel"
              className="relative flex h-full w-full min-w-[320px] max-w-[500px] transform-gpu flex-col overflow-hidden bg-slate-50 shadow-[0_0_20px_0_rgba(45,45,45,0.18)] dark:border-l dark:border-[#363636] dark:bg-[#282828] dark:shadow-[0_0_28px_0_rgba(0,0,0,0.72)]"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{
                duration: 0.4,
                ease: [0, 0, 0.2, 1] as const,
              }}
              style={{ willChange: "transform" }}
            >
              {/* Header with back button and thread title */}
              <div className="group flex-shrink-0 border-b bg-white px-4 py-2.5 dark:border-[#3a3a3a] dark:bg-[#232323]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowThreadList(true);
                    }}
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-zinc-100"
                  >
                    <ChevronLeft className="h-4 w-4 text-zinc-600" />
                  </button>
                  {activeThread && (
                    <div className="flex flex-1 items-center gap-2">
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
                          className="h-6 flex-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-900">
                            {activeThread.title ||
                              `Thread ${new Date(activeThread.last_edited_timestamp).toLocaleString()}`}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              activeThread.agent_type === "Claude Code"
                                ? "bg-purple-100 text-purple-700"
                                : activeThread.agent_type === "Codex"
                                  ? "bg-blue-100 text-blue-700"
                                  : activeThread.agent_type === "Gemini CLI"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {activeThread.agent_type}
                          </span>
                          {activeThread.agent_type === "Codex" && (
                            <>
                              {isCodexConnected ? (
                                <>
                                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                    ChatGPT connected
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setShowCodexAuthSettings((prev) => !prev)
                                    }
                                    title={
                                      showCodexAuthSettings
                                        ? "Hide Codex settings"
                                        : "Open Codex settings"
                                    }
                                    className="h-5 w-5 px-0 text-blue-700 hover:text-blue-800"
                                  >
                                    <Settings2 className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setShowCodexAuthSettings(true)
                                    }
                                    className="h-5 px-1.5 text-[10px] text-blue-700"
                                  >
                                    Connect ChatGPT subscription
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setShowCodexAuthSettings((prev) => !prev)
                                    }
                                    title={
                                      showCodexAuthSettings
                                        ? "Hide Codex settings"
                                        : "Open Codex settings"
                                    }
                                    className="h-5 w-5 px-0 text-blue-700 hover:text-blue-800"
                                  >
                                    <Settings2 className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => {
                              setEditingTitle(
                                activeThread.title ||
                                  `Thread ${new Date(activeThread.last_edited_timestamp).toLocaleString()}`,
                              );
                              setIsEditingTitle(true);
                            }}
                            className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-zinc-100 group-hover:opacity-100"
                            title="Edit title"
                          >
                            <Pencil className="h-3 w-3 text-zinc-500" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {showCodexDeviceBanner && (
                <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {!isCodexConnected && (
                        <>
                          <div className="text-[11px] font-semibold text-blue-900">
                            Use ChatGPT subscription with Codex
                          </div>
                          <div className="text-[10px] text-blue-700">
                            Start device auth on this machine to get your URL
                            and one-time code.
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-medium text-zinc-700">
                              Not connected
                            </span>
                            {codexAuthStatus?.hasAuthFile &&
                              !codexAuthStatus?.isAuthenticated && (
                                <span className="text-amber-700">
                                  Invalid token file detected
                                </span>
                              )}
                          </div>
                        </>
                      )}

                      {showCodexInstructionView ? (
                        <div className="mt-2 space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-2">
                          <div className="text-[10px] font-semibold text-amber-900">
                            Before entering this code
                          </div>
                          <div className="text-[10px] text-amber-800">
                            Enable device code authorization first in ChatGPT:
                            Settings -&gt; Security -&gt; bottom toggle. Then
                            click Start Device Login again to reissue a fresh
                            code.
                          </div>
                          <div className="text-[10px] text-amber-800">
                            If you have not used Codex on this ChatGPT account
                            yet, you may also need to activate Codex on your
                            account before linking it here.
                          </div>
                          <a
                            href="https://chatgpt.com/#settings/Security"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 hover:text-blue-800"
                          >
                            Open ChatGPT Security settings
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                          <div className="space-y-1 rounded border border-amber-300 bg-white/70 p-1.5">
                            <div className="text-[10px] font-semibold text-amber-900">
                              Use this link and code
                            </div>
                            {codexAuthUrl && (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-1.5 text-[10px]"
                                  onClick={() =>
                                    window.open(codexAuthUrl, "_blank")
                                  }
                                >
                                  Open auth link
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-1.5 text-[10px]"
                                  onClick={() =>
                                    copyAuthValue("Auth URL", codexAuthUrl)
                                  }
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <code className="rounded bg-amber-100 px-1.5 py-1 text-[10px] font-medium text-amber-900">
                                Code: {codexOneTimeCode || "pending..."}
                              </code>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[10px]"
                                onClick={() =>
                                  codexOneTimeCode &&
                                  copyAuthValue(
                                    "One-time code",
                                    codexOneTimeCode,
                                  )
                                }
                                disabled={!codexOneTimeCode}
                              >
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </div>
                          <img
                            src="/device.png"
                            alt="ChatGPT Security settings showing the device code authorization toggle for Codex."
                            className="w-full rounded border border-amber-200"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setShowCodexSetupInstructions(false)}
                            className="h-6 w-fit px-2 text-[10px]"
                          >
                            I enabled it, continue
                          </Button>
                        </div>
                      ) : (
                        <>
                          {hasCodexDeviceAuthValues && (
                            <div className="mt-2 space-y-1.5 rounded-md border-2 border-sky-400 bg-sky-50 p-2 shadow-sm">
                              <div className="text-[10px] font-semibold text-sky-900">
                                Finish sign-in
                              </div>
                              <div className="text-[10px] text-sky-800">
                                1) Go to the auth link. 2) Enter the one-time
                                code. 3) Return here and click Refresh status.
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {codexAuthUrl && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-1.5 text-[10px]"
                                    onClick={() =>
                                      window.open(codexAuthUrl, "_blank")
                                    }
                                  >
                                    Open auth link
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </Button>
                                )}
                                <code className="rounded bg-sky-100 px-1.5 py-1 text-[10px] font-medium text-sky-900">
                                  Code: {codexOneTimeCode || "pending..."}
                                </code>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-1.5 text-[10px]"
                                  onClick={() =>
                                    codexOneTimeCode &&
                                    copyAuthValue(
                                      "One-time code",
                                      codexOneTimeCode,
                                    )
                                  }
                                  disabled={!codexOneTimeCode}
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                              {!codexOneTimeCode && (
                                <div className="text-[10px] text-amber-700">
                                  Code is still loading. Press Start Device
                                  Login again to re-fetch it.
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-2 space-y-2 rounded-md border border-blue-200 bg-white/80 p-2">
                            <div className="text-[10px] font-semibold text-blue-900">
                              Codex Login Settings
                            </div>
                            <div className="text-[10px] text-blue-700">
                              If this is your first time using Codex on this
                              ChatGPT account, you may need to activate Codex on
                              the account before device login will work.
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[10px]">
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  isCodexConnected
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-zinc-200 text-zinc-700"
                                }`}
                              >
                                {isCodexConnected
                                  ? "Connected to ChatGPT"
                                  : "Not connected"}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={refreshCodexAuthStatus}
                                disabled={isCheckingCodexAuth}
                                className="h-6 text-[10px]"
                              >
                                {isCheckingCodexAuth
                                  ? "Checking..."
                                  : "Refresh status"}
                              </Button>
                              {hasCodexDeviceAuthValues && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setShowCodexSetupInstructions(true)
                                  }
                                  className="h-6 px-1.5 text-[10px] text-blue-700 hover:text-blue-800"
                                >
                                  View setup instructions
                                </Button>
                              )}
                              {codexAuthStatus?.authMode && (
                                <span className="text-zinc-600">
                                  mode: {codexAuthStatus.authMode}
                                </span>
                              )}
                              {codexAuthStatus?.lastRefresh && (
                                <span className="text-zinc-600">
                                  last refresh: {codexAuthStatus.lastRefresh}
                                </span>
                              )}
                            </div>
                            <details className="text-[10px]">
                              <summary className="cursor-pointer text-zinc-600">
                                Advanced
                              </summary>
                              <div className="mt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={handleResetCodexDeviceLogin}
                                  disabled={isResettingCodexAuth}
                                  className="h-6 text-[10px] text-red-700 hover:text-red-800"
                                >
                                  {isResettingCodexAuth
                                    ? "Resetting..."
                                    : "Reset login"}
                                </Button>
                              </div>
                            </details>
                          </div>
                        </>
                      )}
                    </div>
                    {!isCodexConnected && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleStartCodexDeviceLogin}
                        disabled={isStartingCodexAuth || isResettingCodexAuth}
                        className="h-7 shrink-0 gap-1.5 bg-blue-600 px-2.5 text-[10px] font-medium text-white hover:bg-blue-700"
                      >
                        {isStartingCodexAuth ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          <KeyRound className="h-3 w-3" />
                        )}
                        {isStartingCodexAuth
                          ? "Starting..."
                          : "Start Device Login"}
                      </Button>
                    )}
                  </div>
                </div>
              )}

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
              {selectedNodeInfo && (
                <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="flex-shrink-0 text-zinc-500"
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
                      <span className="truncate text-zinc-700">
                        {selectedNodeInfo.reactHierarchyFormatted &&
                        selectedNodeInfo.reactHierarchyFormatted !==
                          "No React components found for this element."
                          ? `Selected node: ${selectedNodeInfo.reactHierarchyFormatted.split(":")[1]?.split("child of")[0]?.trim() || selectedNodeInfo.selector} (selector: ${selectedNodeInfo.selector})`
                          : `Selected node: ${selectedNodeInfo.selector}`}
                      </span>
                    )}
                    <button
                      className="ml-auto text-zinc-500 hover:text-zinc-700"
                      onClick={() => {
                        updateSelectedNodeInfo(null);
                        setIsSelectingElement(false);
                      }}
                      title="Clear selection"
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Input - Compact mode for agent chat */}
              <div className="flex-shrink-0 border-t bg-white">
                <ChatInput
                  isProcessing={isProcessing}
                  handleSendMessage={handleSendMessage}
                  projectSemanticIdentifier={projectSemanticIdentifier}
                  terminateThread={handleTerminateThread}
                  isSelectingElement={isSelectingElement}
                  setIsSelectingElement={setIsSelectingElement}
                  projectId={project?._id}
                  onOpenDivergenceDialog={() => {}}
                  queuedMessages={[]}
                  onRemoveQueuedMessage={() => {}}
                  externalSelectedNodeInfo={selectedNodeInfo}
                  onSelectedNodeInfoChange={updateSelectedNodeInfo}
                  onUserInputChange={() => {}}
                  selectedAgentMode="POWERFUL"
                  onAgentModeChange={undefined}
                  onSwitchAgent={handleCreateNewThread}
                  syncStatus={undefined}
                  activeEntryPointId={undefined}
                  restoreMessage={messageToRestore}
                  compactMode={true}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
