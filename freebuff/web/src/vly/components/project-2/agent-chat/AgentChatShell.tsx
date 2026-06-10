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
import { toast } from "sonner";
import { handleAgentSendError } from "@/vly/lib/agentErrorHandler";
import { useMessageQueue } from "@/vly/hooks/useMessageQueue";
import { AgentThreadList } from "./AgentThreadList";
import { ChatInput } from "../ChatInput";
import {
  ChevronLeft,
  X,
  AlertTriangle,
  ChevronDown,
  Pencil,
  Plus,
  History,
  Github,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/vly/components/ui/collapsible";
import { BuildErrors } from "@/vly/components/project-2/BuildErrors";
import {
  DEFAULT_FREEBUFF_MODEL_ID,
  resolveFreebuffModel,
} from "@codebuff/common/constants/freebuff-models";
import { resolveVisibleFreebuffModel } from "@/vly/components/project-2/FreebuffModelSelector";

const FREEBUFF_MODEL_STORAGE_KEY = "freebuff:selectedModel";

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
}: AgentChatShellProps) {
  const vlyAgentDisplayName = "freebuff agent 2.0";
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

  const handleFreebuffModelChange = useCallback((modelId: string) => {
    const resolved = resolveFreebuffModel(modelId);
    setSelectedFreebuffModel(resolved);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FREEBUFF_MODEL_STORAGE_KEY, resolved);
    }
  }, []);

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

      // Get the agent type from the active thread, default to Codex if no thread
      const agentType = activeThread?.agent_type || "Codex";

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
    ],
  );

  // Wrapper for BuildErrors (expects (message: string) => Promise<unknown>)
  const sendAutomatedAgentMessage = useCallback(
    async (message: string) => {
      return handleSendMessage(message, []);
    },
    [handleSendMessage],
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

  // Only one agent (Freebuff) is available now. Creating a thread is a
  // one-click action — no model picker, no disclaimer dialog.
  const handleCreateNewThread = useCallback(async () => {
    if (!projectSemanticIdentifier || !project || isProcessing) return;
    try {
      await createNewAgentThread({
        projectSemanticIdentifier,
        agentType: "Freebuff",
      });
      setShowThreadList(false);
    } catch {
      toast.error("Failed to create new thread");
    }
  }, [
    project,
    isProcessing,
    createNewAgentThread,
    projectSemanticIdentifier,
  ]);

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

  // Codex / Claude Code / Gemini integrations have been removed — Freebuff
  // is now the only available agent.
  return (
    <TooltipProvider delayDuration={200}>
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
            onBack={() => setShowThreadList(false)}
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
              <div className="group flex-shrink-0 bg-transparent px-3 py-3 sm:px-4">
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

              {/*
                Codex device-auth banner and all related JSX removed —
                Freebuff is the only supported agent now.
              */}

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
              {selectedNodeInfo && (
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
                <div className="flex-shrink-0 border-t border-border/40 bg-transparent">
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
                    selectedFreebuffModel={selectedFreebuffModel}
                    onFreebuffModelChange={handleFreebuffModelChange}
                    syncStatus={undefined}
                    activeEntryPointId={undefined}
                    restoreMessage={messageToRestore}
                    compactMode={true}
                  />
                </div>
              )}
        </div>
      )}
    </TooltipProvider>
  );
}
