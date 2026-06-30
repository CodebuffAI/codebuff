"use client";

import { AgentMode } from "!/utils/registry_validators";
import { ContextLength } from "./ContextLengthSelector";
import { DEFAULT_CONTEXT_LENGTH } from "@/vly/lib/coding-agent/contextLengthPresets";
import { AgentThreadList } from "./agent-chat/AgentThreadList";
import DivergenceResolutionDialog from "@/vly/components/project-2/DivergenceResolutionDialog";
import { useMessageQueue } from "@/vly/hooks/useMessageQueue";
import { useChatStorageContext } from "@/vly/contexts/ChatStorageContext";
import {
  ModelDisclaimerDialog,
  hasAcknowledgedDisclaimer,
} from "./ModelDisclaimerDialog";
import { toast } from "sonner";
import { checkRateLimitAndNotify } from "@/vly/lib/rateLimitHelpers";
import { handleAgentSendError } from "@/vly/lib/agentErrorHandler";
import { trackRedditFirstPromptOnce } from "@/lib/reddit-funnel";
import { IssueReportButton } from "@/vly/components/IssueReportButton";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { insertAtTop, useAction, useMutation, useQuery } from "convex/react";
import { useRateLimit } from "@convex-dev/rate-limiter/react";
import { FunctionReturnType } from "convex/server";
import { X, ChevronLeft, Pencil, Loader, Plus, History, Github } from "lucide-react";
import { Input } from "@/vly/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";
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
import { getImageUrl } from "@/vly/lib/image-utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  lazy,
  Suspense,
} from "react";

// Lazy load heavy message components
const ChatMessages = lazy(() =>
  import("./ChatMessages").then((m) => ({ default: m.ChatMessages })),
);

// Import skeleton directly (not lazy loaded)
import { ChatSkeleton } from "./ChatSkeleton";
import { ChatMessagesRef } from "./ChatMessages";

// Valid agent modes that can be selected from the UI
const VALID_AGENT_MODES: AgentMode[] = [
  "POWERFUL",
  "EFFICIENT",
  "PRECISE",
  "CHEAP",
  "STANDARD",
  "OPUS",
  "PLANNING",
  "EXPENSIVE",
  "ULTRA_CHEAP",
];

function normalizeSelectedAgentMode(mode: AgentMode): AgentMode {
  switch (mode) {
    case "EXPENSIVE":
      return "POWERFUL";
    case "ULTRA_CHEAP":
      return "CHEAP";
    case "MINIMAX":
      return "STANDARD";
    default:
      return mode;
  }
}

interface ChatShellProps {
  project: FunctionReturnType<typeof api.project.getProjectData>;
  threadMessages: FunctionReturnType<typeof api.project.getThreadMessages>;
  streamedMessages: FunctionReturnType<typeof api.project.getStreamedMessages>;
  pageIdSelectedForEdit: Id<"entry_point"> | null;
  onPageSelectedForEdit: (pageId: Id<"entry_point"> | null) => void;
  expandedPageNodeId: Id<"entry_point"> | null;
  projectSemanticIdentifier: string;
  activeEntryPointId?: Id<"entry_point"> | null;
  createNewThreadFromEntryPoint: (args: {
    projectSemanticIdentifier: string;
    entryPointId: Id<"entry_point">;
  }) => Promise<any>;
  isSelectingElement: boolean;
  setIsSelectingElement: (v: boolean) => void;
  currentPageUrl?: string;
  messagesStatus?:
    | "LoadingFirstPage"
    | "CanLoadMore"
    | "LoadingMore"
    | "Exhausted"
    | undefined;
  loadMoreThreadMessages?: (n: number) => void;
  syncStatus?: FunctionReturnType<
    typeof api.github.repositories.getProjectSyncStatus
  >;
  onSwitchToNewAgent?: () => void;
  onOpenVersions?: () => void;
  onOpenGitHub?: () => void;
  githubActionLabel?: string;
}

export function ChatShell({
  project,
  threadMessages,
  streamedMessages,
  projectSemanticIdentifier,
  isSelectingElement,
  setIsSelectingElement,
  currentPageUrl,
  messagesStatus,
  loadMoreThreadMessages,
  syncStatus,
  activeEntryPointId,
  onOpenVersions,
  onOpenGitHub,
  githubActionLabel = "GitHub",
}: ChatShellProps) {
  const [selectedAgentMode, setSelectedAgentMode] = useState<AgentMode>(() => {
    if (typeof window !== "undefined") {
      const saved = document.cookie
        .split("; ")
        .find((row) => row.startsWith("agentMode="));
      if (saved) {
        const mode = saved.split("=")[1] as AgentMode;
        const normalizedMode = normalizeSelectedAgentMode(mode);
        if (
          VALID_AGENT_MODES.includes(mode) ||
          VALID_AGENT_MODES.includes(normalizedMode)
        ) {
          return normalizedMode;
        }
      }
    }
    // Default to Claude Sonnet 4.6 for Freebuff agent when creating a new thread
    return "POWERFUL";
  });
  const [selectedContextLength, setSelectedContextLength] =
    useState<ContextLength>(() => {
      if (typeof window !== "undefined") {
        const saved = document.cookie
          .split("; ")
          .find((row) => row.startsWith("contextLength="));
        if (saved) {
          const length = saved.split("=")[1] as ContextLength;
          if (["small", "medium", "long"].includes(length)) {
            return length;
          }
        }
      }
      return DEFAULT_CONTEXT_LENGTH;
    });
  const [showDivergenceDialog, setShowDivergenceDialog] = useState(false);
  const [showThreadList, setShowThreadList] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);
  const [pendingModelSelection, setPendingModelSelection] = useState<
    "Claude Code" | "Codex" | "Gemini CLI" | null
  >(null);

  // Check rate limit status proactively
  const { status } = useRateLimit(api.coding_agent.rateLimiter.getRateLimit, {
    getServerTimeMutation: api.coding_agent.rateLimiter.getServerTime,
  });
  const retryAt = status?.retryAt;

  // Log when credit checking component mounts
  useEffect(() => {
    console.log("🏗️ ChatShell: Credit checking system initialized", {
      projectId: project?._id,
      projectSemanticIdentifier,
      timestamp: new Date().toISOString(),
    });
  }, [project?._id, projectSemanticIdentifier]);

  // Use persistent chat storage for selectedNodeInfo and uploaded images
  const {
    selectedNodeInfo,
    updateSelectedNodeInfo,
    uploadedImages,
    removeImage,
  } = useChatStorageContext();

  // Track whether user has input to hide suggestions
  const [hasUserInput, setHasUserInput] = useState(false);
  const [divergenceInfo, setDivergenceInfo] = useState<any>(null);

  const selectedAgentModeRef = useRef(selectedAgentMode);
  selectedAgentModeRef.current = selectedAgentMode;

  const selectedContextLengthRef = useRef(selectedContextLength);
  selectedContextLengthRef.current = selectedContextLength;

  // Save agent mode to cookie whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      document.cookie = `agentMode=${selectedAgentMode}; path=/; max-age=31536000`; // 1 year
    }
  }, [selectedAgentMode]);

  // Save context length to cookie whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      document.cookie = `contextLength=${selectedContextLength}; path=/; max-age=31536000`; // 1 year
    }
  }, [selectedContextLength]);

  const chatMessagesRef = useRef<ChatMessagesRef>(null);

  const sendMessage = useMutation(
    api.coding_agent.trigger.saveMessageAndStartWorkflow,
  ).withOptimisticUpdate((localStore, args) => {
    const { projectSemanticIdentifier, message, images } = args;

    // Guard check: only proceed if we have the semantic identifier
    if (!projectSemanticIdentifier || !project?.active_thread) return;

    const now = Date.now() - 100;
    const newMessage = {
      _id: crypto.randomUUID() as any,
      _creationTime: now,
      date: now,
      role: "user" as const,
      content: message,
      images: images || [],
      project_id: project._id,
      thread_id: project.active_thread,
      deactivated: false,
      streaming: false,
      user_id: undefined,
      model: undefined,
      tool_call: undefined,
      object: undefined,
      error_check: undefined,
      result: undefined,
      commit_hash: undefined,
    };

    insertAtTop({
      paginatedQuery: api.project.listThreadMessages,
      argsToMatch: {
        semanticIdentifier: projectSemanticIdentifier,
        threadId: project.active_thread,
      },
      localQueryStore: localStore,
      item: newMessage,
    });
  });

  const revertToCommit = useAction(api.codesandbox.versionControl.revert);
  const setActiveThread = useMutation(api.project.setActiveThread);
  const setActiveAgentThread = useMutation(api.project.setActiveAgentThread);
  const terminateThread = useAction(api.thread.terminateThread);
  // Thread creation mutation available for future use
  void useMutation;
  const createNewAgentThread = useMutation(
    api.coding_agent.cli_agent.agent_thread.createNewAgentThread,
  );

  // Handler for opening divergence dialog
  const handleOpenDivergenceDialog = useCallback(() => {
    if (
      syncStatus?.sync_status === "conflict" ||
      syncStatus?.sync_status === "error"
    ) {
      // Set divergence info if available, or create a basic one
      setDivergenceInfo({
        isDivergent: true,
        localCommits: 0,
        remoteCommits: 0,
        divergenceType: syncStatus.sync_status,
        canFastForward: false,
      });
      setShowDivergenceDialog(true);
    }
  }, [syncStatus]);

  const projectThreads =
    useQuery(
      api.thread.getProjectThreads,
      project
        ? {
            projectId: project._id,
          }
        : "skip",
    ) ?? [];

  // Get active old thread data (for title editing)
  const activeThread = projectThreads.find(
    (t) => t._id === project?.active_thread,
  );

  // Update thread title mutation
  const updateThreadTitle = useMutation(api.thread.updateThreadTitle);

  // Store frequently changing values in refs to avoid recreating the callback
  const selectedNodeInfoRef = useRef(selectedNodeInfo);
  const currentPageUrlRef = useRef(currentPageUrl);
  const revertToCommitRef = useRef(revertToCommit);
  const projectSemanticIdentifierRef = useRef(projectSemanticIdentifier);

  // Update refs directly in render
  selectedNodeInfoRef.current = selectedNodeInfo;
  currentPageUrlRef.current = currentPageUrl;
  revertToCommitRef.current = revertToCommit;
  projectSemanticIdentifierRef.current = projectSemanticIdentifier;

  const resolveCurrentPageContext = useCallback(() => {
    if (currentPageUrlRef.current && currentPageUrlRef.current.trim()) {
      return currentPageUrlRef.current;
    }

    if (typeof window !== "undefined" && window.location?.href) {
      return window.location.href;
    }

    return undefined;
  }, []);

  const isProcessing = project?.state === "processing";

  // Initialize message queue
  const messageQueue = useMessageQueue({
    onProcessMessage: async (message: string, images: Id<"_storage">[]) => {
      // Use refs to avoid recreating callback when these values change
      try {
        const result = await sendMessage({
          projectSemanticIdentifier: projectSemanticIdentifierRef.current,
          message,
          agentMode: selectedAgentModeRef.current,
          contextLength: selectedContextLengthRef.current,
          images,
          tempPageContext: resolveCurrentPageContext(),
        });

        if (result && !result.success && result.error) {
          handleAgentSendError(result.error);
          return;
        }
      } catch (error: any) {
        // Handle other errors
        console.error("Error sending message from queue:", error);
        toast.error("Failed to send message. Please try again.");
      }
    },
    isProcessing,
  });

  const handleSendMessageWithNode = useCallback(
    async (message: string, images: Id<"_storage">[]) => {
      if (
        !message.trim() &&
        images.length === 0 &&
        !selectedNodeInfoRef.current?.image
      )
        return false;

      trackRedditFirstPromptOnce();

      // Check if we're rate limited (use hook's status for proactive check)
      if (!checkRateLimitAndNotify(retryAt, "sending another message")) {
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

        fullMessage = `Selected node: ${nodeDescription}
${message}`;

        updateSelectedNodeInfo(null);
      } else {
      }

      // If AI is currently processing, add to queue instead of sending immediately
      if (isProcessing) {
        messageQueue.addToQueue(fullMessage, images);
        // Scroll to bottom after adding to queue
        setTimeout(() => {
          chatMessagesRef.current?.scrollToBottom();
        }, 100);
        return true;
      } else {
        try {
          const result = await sendMessage({
            projectSemanticIdentifier: projectSemanticIdentifierRef.current,
            message: fullMessage,
            agentMode: selectedAgentModeRef.current,
            contextLength: selectedContextLengthRef.current,
            images,
            tempPageContext: resolveCurrentPageContext(),
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
        } catch (error: any) {
          // Handle other errors
          console.error("Error sending message:", error);
          toast.error("Failed to send message. Please try again.");
          return false;
        }
      }
    },
    [
      isProcessing,
      messageQueue,
      retryAt,
      resolveCurrentPageContext,
      sendMessage,
      updateSelectedNodeInfo,
    ],
  );

  const sendAutomatedAgentMessage = useCallback(
    async (message: string) => {
      return sendMessage({
        projectSemanticIdentifier: projectSemanticIdentifierRef.current,
        message,
        agentMode: selectedAgentModeRef.current,
        contextLength: selectedContextLengthRef.current,
        tempPageContext: resolveCurrentPageContext(),
      });
    },
    [resolveCurrentPageContext, sendMessage],
  );

  // Memoize send message callback to prevent recreation
  const sendMessageCallback = useCallback(
    (msg: string) => handleSendMessageWithNode(msg, []),
    [handleSendMessageWithNode],
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
        setIsSelectingElement(false); // End selection mode
      }
    }

    // Listen for integration tool messages
    function handleChatMessage(event: CustomEvent) {
      if (event.detail && event.detail.message) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(
            `chat-send-${projectSemanticIdentifierRef.current}`,
          );
          window.localStorage.removeItem(
            `chat-draft-${projectSemanticIdentifierRef.current}`,
          );
        }
        handleSendMessageWithNode(event.detail.message, []);
      }
    }

    window.addEventListener("message", handleToolbarSelect);
    window.addEventListener(
      "sendChatMessage",
      handleChatMessage as EventListener,
    );

    return () => {
      window.removeEventListener("message", handleToolbarSelect);
      window.removeEventListener(
        "sendChatMessage",
        handleChatMessage as EventListener,
      );
    };
  }, [
    handleSendMessageWithNode,
    setIsSelectingElement,
    updateSelectedNodeInfo,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sendKey = `chat-send-${projectSemanticIdentifier}`;
    const message = window.localStorage.getItem(sendKey);
    if (!message || !message.trim()) return;
    window.localStorage.removeItem(sendKey);
    void handleSendMessageWithNode(message, []);
  }, [projectSemanticIdentifier, handleSendMessageWithNode]);

  // Calculate if suggestions should be shown
  const shouldShowSuggestions = useMemo(() => {
    // Never show suggestions during processing
    if (!threadMessages || threadMessages.length === 0 || isProcessing) {
      return false;
    }

    // Hide suggestions if user has any input
    if (hasUserInput) {
      return false;
    }

    const sortedMessages = [...threadMessages].sort((a, b) => b.date - a.date);

    // Find the last assistant message with valid suggestions that is complete (not streaming)
    const lastAssistantMessage = sortedMessages.find(
      (msg) =>
        msg.role === "assistant" &&
        !msg.streaming && // Message must not be streaming
        (!msg.message_state || msg.message_state.status === "complete") && // Message must be complete
        msg.suggestions &&
        msg.suggestions.length > 0 &&
        msg.suggestions.some((s) => s && s.trim().length > 0),
    );

    // Only show if we have a valid message with suggestions and it's not processing
    const hasValidSuggestions =
      lastAssistantMessage &&
      lastAssistantMessage.suggestions &&
      lastAssistantMessage.suggestions.some((s) => s && s.trim().length > 0);

    return (
      hasValidSuggestions &&
      !isProcessing &&
      !showDivergenceDialog &&
      syncStatus?.sync_status !== "conflict" &&
      syncStatus?.sync_status !== "error"
    );
  }, [
    threadMessages,
    isProcessing,
    showDivergenceDialog,
    syncStatus,
    hasUserInput,
  ]);

  // Scroll to bottom when suggestions appear
  useEffect(() => {
    if (shouldShowSuggestions) {
      setTimeout(() => {
        chatMessagesRef.current?.scrollToBottom();
      }, 150); // Small delay to ensure suggestions are rendered
    }
  }, [shouldShowSuggestions]);

  // Handler for creating a new thread - show model selection dialog
  const handleCreateNewThread = useCallback(() => {
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

  // Legacy chats are read-only. The only action available is to spin up a fresh
  // thread on the Freebuff agent (which swaps this shell for AgentChatShell).
  const [isStartingFreebuff, setIsStartingFreebuff] = useState(false);
  const handleStartFreebuffAgent = useCallback(async () => {
    if (!projectSemanticIdentifier || isStartingFreebuff) return;
    setIsStartingFreebuff(true);
    try {
      await createNewAgentThread({
        projectSemanticIdentifier,
        agentType: "Freebuff",
      });
      // On success the project's active_agent_thread is set and project-2
      // re-renders AgentChatShell, unmounting this component. If that swap
      // doesn't happen for any reason, don't leave the button stuck spinning.
      window.setTimeout(() => setIsStartingFreebuff(false), 3000);
    } catch {
      toast.error("Failed to start Freebuff agent");
      setIsStartingFreebuff(false);
    }
  }, [projectSemanticIdentifier, isStartingFreebuff, createNewAgentThread]);

  // Handle disclaimer acknowledgment
  const handleDisclaimerAcknowledged = useCallback(() => {
    if (pendingModelSelection) {
      createThreadAfterAcknowledgment(pendingModelSelection);
      setPendingModelSelection(null);
    }
  }, [pendingModelSelection, createThreadAfterAcknowledgment]);

  // Handle setting active thread (both old and new types)
  const handleSetActiveThread = useCallback(
    (
      threadId: Id<"agent_thread"> | Id<"thread">,
      threadType: "agent_thread" | "thread",
    ) => {
      if (project) {
        if (threadType === "thread") {
          // Old thread - set as active
          setActiveThread({
            projectId: project._id,
            threadId: threadId as Id<"thread">,
          });
          setShowThreadList(false);
        } else {
          // New agent thread - set as active to switch to new chat UI
          setActiveAgentThread({
            projectId: project._id,
            threadId: threadId as Id<"agent_thread">,
          });
          setShowThreadList(false);
        }
      }
    },
    [project, setActiveThread, setActiveAgentThread],
  );

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

      {/* Model Selection Dialog */}
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
                    src="/logo-icon.png"
                    alt="freebuff agent 2.0"
                    className="h-5 w-5 object-contain"
                  />
                  <CardTitle className="text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <span>freebuff agent 2.0</span>
                      <span className="rounded-full border border-[#7CFF3F]/30 bg-[#7CFF3F]/15 px-1.5 py-0 text-[10px] font-medium text-[#7CFF3F]">
                        New
                      </span>
                    </span>
                  </CardTitle>
                  <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700">
                    Recommended
                  </span>
                </div>
                <CardDescription className="mt-1 text-xs">
                  freebuff agent 2.0 default workflow.
                </CardDescription>
              </CardHeader>
            </Card>

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
                  <span className="ml-auto rounded-full border border-blue-200 bg-blue-100 px-1.5 py-0 text-[10px] font-medium text-blue-700">
                    Available
                  </span>
                </div>
                <CardDescription className="mt-1 text-xs">
                  Use Claude Code for this thread.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-not-allowed opacity-50 transition-all">
              <CardHeader className="px-4 py-3 pb-2">
                <div className="flex items-center gap-2">
                  <img
                    src="https://www.svgrepo.com/show/306500/openai.svg"
                    alt="Codex"
                    className="h-5 w-5 object-contain"
                  />
                  <CardTitle className="text-sm font-medium">Codex</CardTitle>
                  <span className="ml-auto rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[10px] font-medium text-purple-700">
                    Unavailable
                  </span>
                </div>
                <CardDescription className="mt-1 text-xs">
                  Codex is currently unavailable.
                </CardDescription>
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
          </div>
        </DialogContent>
      </Dialog>

      {/*
        Thread switcher used to slide in/out with framer-motion. Per design
        feedback we now swap views instantly — no animation.
      */}
      {showThreadList ? (
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
            {/* Header with back button and thread title */}
            <div className="group flex-shrink-0 border-b border-border/60 bg-transparent px-4 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowThreadList(true);
                  }}
                  type="button"
                  aria-label="All threads"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
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
                              semanticIdentifier: projectSemanticIdentifier,
                              threadId: activeThread._id,
                              title: editingTitle || "",
                            });
                          }
                          setIsEditingTitle(false);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            if (activeThread._id) {
                              await updateThreadTitle({
                                semanticIdentifier: projectSemanticIdentifier,
                                threadId: activeThread._id,
                                title: editingTitle || "",
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
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
                          {activeThread.title || "Untitled Thread"}
                        </span>
                        <span className="hidden items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                          freebuff agent 2.0
                        </span>
                        <button
                          onClick={() => {
                            setEditingTitle(
                              activeThread.title || "Untitled Thread",
                            );
                            setIsEditingTitle(true);
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                          title="Edit title"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <TooltipProvider delayDuration={200}>
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                            handleCreateNewThread();
                          }}
                          type="button"
                          aria-label="New thread"
                          disabled={isProcessing}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                </TooltipProvider>
              </div>
            </div>

            {/* Messages - Lazy loaded */}
            <Suspense fallback={<ChatSkeleton />}>
              <ChatMessages
                ref={chatMessagesRef}
                project={project}
                threadMessages={threadMessages}
                streamedMessages={streamedMessages}
                projectSemanticIdentifier={projectSemanticIdentifier}
                onSendMessage={sendMessageCallback}
                revertToCommit={async (args) => {
                  await revertToCommitRef.current(args);
                }}
                messagesStatus={
                  messagesStatus === "LoadingFirstPage"
                    ? undefined
                    : messagesStatus
                }
                loadMoreThreadMessages={loadMoreThreadMessages}
              />
            </Suspense>

            {/* Shared container for selected node and uploaded images */}
            {(selectedNodeInfo || uploadedImages.length > 0) && (
              <div className="mx-4 mb-2 flex items-center justify-center gap-2">
                {/* Uploaded images */}
                {uploadedImages.length > 0 && (
                  <div className="flex gap-2">
                    {uploadedImages.map((storageId, index) => (
                      <UploadedImagePreview
                        key={index}
                        storageId={storageId}
                        onRemove={() => removeImage(index)}
                      />
                    ))}
                  </div>
                )}

                {/* Selected node preview */}
                {selectedNodeInfo && (
                  <div className="inline-flex items-center gap-2 rounded border border-[#7CFF3F]/30 bg-[#7CFF3F]/10 px-3 py-1 text-xs font-medium text-[#7CFF3F] shadow-sm dark:border-[#575757] dark:bg-[#282828] dark:text-zinc-100">
                    {/* Bullseye/target icon on the left */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="flex-shrink-0"
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
                      <span className="truncate">
                        {selectedNodeInfo.reactHierarchyFormatted &&
                        selectedNodeInfo.reactHierarchyFormatted !==
                          "No React components found for this element."
                          ? `Selected node: ${selectedNodeInfo.reactHierarchyFormatted.split(":")[1]?.split("child of")[0]?.trim() || selectedNodeInfo.selector} (selector: ${selectedNodeInfo.selector})`
                          : `Selected node: ${selectedNodeInfo.selector}`}
                      </span>
                    )}
                    <button
                      className="ml-auto text-[#7CFF3F] hover:text-[#7CFF3F]/70 dark:text-zinc-200 dark:hover:text-zinc-100"
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
                )}
              </div>
            )}

            {/* Legacy chats are read-only: suggestion chips and the automated
                runtime/build error fixers are intentionally not rendered here so
                nothing can dispatch work to the retired agent. */}

            {/* Legacy chats are read-only. The original "vly agent 2.0" has been
                retired, so we remove the input entirely and offer a single
                action: start a fresh thread on the Freebuff agent. */}
            <div className="flex-shrink-0 border-t border-border/40 bg-transparent px-4 py-4">
              <div className="mb-3 flex items-start justify-center gap-2 text-center text-xs leading-5 text-muted-foreground">
                <History className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  This is a legacy chat and is read-only. The original agent has
                  been retired — start a new thread to keep building with the
                  Freebuff agent.
                </span>
              </div>
              <button
                type="button"
                onClick={handleStartFreebuffAgent}
                disabled={isStartingFreebuff}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStartingFreebuff ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Start Freebuff agent
              </button>
            </div>

            {/* Divergence Resolution Dialog */}
            {project && divergenceInfo && (
              <DivergenceResolutionDialog
                projectId={project._id}
                isOpen={showDivergenceDialog}
                onClose={() => setShowDivergenceDialog(false)}
                onResolved={() => {
                  setShowDivergenceDialog(false);
                  setDivergenceInfo(null);
                }}
                divergenceInfo={divergenceInfo}
              />
            )}
            <IssueReportButton
              source="chat"
              projectId={project?._id}
              projectSemanticIdentifier={projectSemanticIdentifier}
              threadId={
                project?.active_thread
                  ? String(project.active_thread)
                  : undefined
              }
            />
        </div>
      )}
    </>
  );
}

// Simple component to display uploaded images in ChatShell
const UploadedImagePreview: React.FC<{
  storageId: Id<"_storage">;
  onRemove: () => void;
}> = ({ storageId, onRemove }) => {
  const imageUrl = getImageUrl(storageId);

  return (
    <div className="group relative">
      <img
        src={imageUrl}
        alt="Uploaded"
        className="h-16 w-16 rounded-lg border border-[#7CFF3F]/20 object-cover shadow-sm dark:border-[#575757]"
        draggable={false}
      />
      <button
        onClick={onRemove}
        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-[#7CFF3F] text-white shadow-sm hover:bg-[#7CFF3F]/80 group-hover:flex dark:bg-[#4a4a4a] dark:hover:bg-[#5a5a5a]"
        title="Remove image"
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};
