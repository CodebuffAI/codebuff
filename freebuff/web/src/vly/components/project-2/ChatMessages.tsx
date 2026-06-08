"use client";

import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import {
  CheckCircle2,
  ChevronDown,
  Loader,
  TriangleAlert,
  Undo,
} from "lucide-react";
import React, { useImperativeHandle, useMemo, forwardRef } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { useMutation, useQuery } from "convex/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";

const ChatMessage = React.lazy(() =>
  import("@/vly/components/project-2/ChatMessage").then((m) => ({
    default: m.ChatMessage,
  })),
);

// Memoized wrapper for ChatMessage to prevent unnecessary re-renders
const MemoizedChatMessage = React.memo(ChatMessage);
MemoizedChatMessage.displayName = "MemoizedChatMessage";

// Processing indicator that appears at the bottom of the chat
const ChatProcessingIndicator: React.FC = () => {
  return (
    <div className="px-4 py-1">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Loader className="h-4 w-4 animate-spin text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-500">Processing...</p>
      </div>
    </div>
  );
};

// Scroll to Bottom Button Component
const ScrollToBottomButton: React.FC<{ onClick: () => void }> = ({
  onClick,
}) => (
  <div className="pointer-events-none absolute bottom-20 right-6 z-50 mb-4">
    <button
      onClick={onClick}
      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-zinc-800 shadow-md transition-shadow hover:shadow-lg"
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="h-5 w-5" />
    </button>
  </div>
);

const CompactionTranscriptMessage: React.FC<{
  status: "loading" | "complete";
  compactedHistoryMessageCount?: number | null;
}> = ({ status, compactedHistoryMessageCount }) => {
  const description =
    status === "loading"
      ? "Compacting earlier chat history to keep context small."
      : compactedHistoryMessageCount && compactedHistoryMessageCount > 0
        ? `Compacted earlier chat history to keep context small. ${compactedHistoryMessageCount} messages are now folded into the running summary.`
        : "Compacted earlier chat history to keep context small.";

  return (
    <div className="mt-2 flex w-full flex-col items-start">
      <div className="w-full">
        <div className="my-1 flex items-center gap-2 text-xs leading-normal text-zinc-500">
          {status === "loading" ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span>{description}</span>
        </div>
      </div>
    </div>
  );
};

export interface ChatMessagesRef {
  scrollToBottom: () => void;
}

interface ChatMessagesProps {
  project: FunctionReturnType<typeof api.project.getProjectData>;
  threadMessages: FunctionReturnType<typeof api.project.getThreadMessages>;
  streamedMessages: FunctionReturnType<typeof api.project.getStreamedMessages>;
  projectSemanticIdentifier: string;
  onSendMessage: (message: string) => void;
  revertToCommit: (args: {
    semanticIdentifier: string;
    commitHash: string;
    source?: "chat" | "versions_page";
  }) => Promise<void>;
  messagesStatus?:
    | "LoadingFirstPage"
    | "CanLoadMore"
    | "LoadingMore"
    | "Exhausted"
    | undefined;
  loadMoreThreadMessages?: (n: number) => void;
}

export const ChatMessages = forwardRef<ChatMessagesRef, ChatMessagesProps>(
  function ChatMessages(
    {
      project,
      threadMessages,
      streamedMessages,
      projectSemanticIdentifier,
      onSendMessage,
      revertToCommit,
      messagesStatus,
      loadMoreThreadMessages,
    },
    ref,
  ) {
    const { scrollRef, contentRef, scrollToBottom, isAtBottom } =
      useStickToBottom({
        initial: "smooth",
        resize: "smooth",
      });

    // Refs to preserve scroll position when prepending older messages
    const beforeHeightRef = React.useRef<number>(0);
    const beforeTopRef = React.useRef<number>(0);
    const pendingAdjustRef = React.useRef<boolean>(false);
    const isLoadingMoreRef = React.useRef<boolean>(false);

    // Load older messages when reaching top, preserving viewport position
    React.useEffect(() => {
      const el = scrollRef.current as unknown as HTMLElement | null;
      if (!el || !loadMoreThreadMessages) return;
      const onScroll = () => {
        if (
          el.scrollTop <= 8 &&
          messagesStatus === "CanLoadMore" &&
          !isLoadingMoreRef.current
        ) {
          // Capture current geometry before loading more
          beforeHeightRef.current = el.scrollHeight;
          beforeTopRef.current = el.scrollTop;
          pendingAdjustRef.current = true;
          isLoadingMoreRef.current = true;
          loadMoreThreadMessages(10);
        }
      };
      el.addEventListener("scroll", onScroll);
      return () => el.removeEventListener("scroll", onScroll);
    }, [scrollRef, loadMoreThreadMessages, messagesStatus]);

    // After loading completes, adjust scrollTop to keep the same content in view
    React.useEffect(() => {
      if (messagesStatus !== "LoadingMore" && pendingAdjustRef.current) {
        const el = scrollRef.current as unknown as HTMLElement | null;
        if (el) {
          const afterHeight = el.scrollHeight;
          const delta = afterHeight - (beforeHeightRef.current || 0);
          el.scrollTop = (beforeTopRef.current || 0) + delta;
        }
        pendingAdjustRef.current = false;
        isLoadingMoreRef.current = false;
      }
    }, [messagesStatus, scrollRef]);

    const deactivateMessageMutation = useMutation(
      api.messages.deactivateMessageAndAfter,
    );
    const [isRevertDialogOpen, setIsRevertDialogOpen] =
      React.useState(false);

    const latestExternalChangeTimestamp = useQuery(
      api.thread.getLatestExternalChangeTimestamp,
      { semanticIdentifier: projectSemanticIdentifier },
    );
    const activeThreadCompactionStatus = useQuery(
      api.thread.getActiveThreadCompactionStatus,
      { semanticIdentifier: projectSemanticIdentifier },
    );

    // Expose scrollToBottom function to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom,
      }),
      [scrollToBottom],
    );

    // Loading state for messages
    const isLoading =
      threadMessages === undefined || streamedMessages === undefined;

    const isProcessing = project?.state === "processing";

    // Memoize sorted messages to prevent recalculation on every render
    const sortedMessages = useMemo(() => {
      if (!threadMessages || !streamedMessages) return [];

      const allMessages = [...threadMessages, ...streamedMessages];
      return allMessages.sort((a, b) => a.date - b.date);
    }, [threadMessages, streamedMessages]);

    const lastUserMessage = useMemo(() => {
      for (let i = sortedMessages.length - 1; i >= 0; i--) {
        if (sortedMessages[i].role === "user") {
          return sortedMessages[i];
        }
      }
      return null;
    }, [sortedMessages]);
    const isCompactingHistory = useMemo(
      () =>
        sortedMessages.some(
          (message) =>
            message.role === "assistant" &&
            message.message_state?.message === "compacting...",
        ),
      [sortedMessages],
    );

    const loadingActivityKey = useMemo(() => {
      for (let i = sortedMessages.length - 1; i >= 0; i--) {
        const message = sortedMessages[i];
        const isEmptyAssistantPlaceholder =
          message.role === "assistant" &&
          !message.content &&
          !(message as any).has_execution_details &&
          !message.message_state;

        if (isEmptyAssistantPlaceholder) continue;

        return [
          message._id,
          message.date,
          message.message_state?.timestamp ?? "",
          message.message_state?.status ?? "",
          (message as any).has_execution_details ? "execution" : "",
          (message as any).has_thinking ? "thinking" : "",
          (message as any).has_usage ? "usage" : "",
        ].join(":");
      }

      return undefined;
    }, [sortedMessages]);

    const shouldShowCompactionSuccess = useMemo(() => {
      if (isCompactingHistory || !lastUserMessage) {
        return false;
      }

      const compactedHistoryUpdatedAt =
        activeThreadCompactionStatus?.compactedHistoryUpdatedAt ?? null;
      if (!compactedHistoryUpdatedAt) {
        return false;
      }

      return compactedHistoryUpdatedAt >= lastUserMessage.date;
    }, [activeThreadCompactionStatus, isCompactingHistory, lastUserMessage]);

    // Memoize rollback callbacks to prevent recreating on every render
    const rollbackCallbacks = useMemo(() => {
      const callbacks = new Map<string, () => Promise<void>>();

      // Create restore callbacks for all user messages
      sortedMessages.forEach((message) => {
        if (message.role === "user") {
          // Hide undo button for messages that existed before the latest external change
          // (e.g., versions page revert, git sync). These messages came before the external
          // change, so clicking undo would revert the external change, not just the message.
          if (
            latestExternalChangeTimestamp &&
            message.date < latestExternalChangeTimestamp
          ) {
            return; // Don't add callback for this message
          }

          callbacks.set(message._id, async () => {
            // If message has a valid checkpoint, revert to it
            if (
              message.commit_hash &&
              message.commit_hash !== "creating" &&
              message.commit_hash !== "failed"
            ) {
              await revertToCommit({
                semanticIdentifier: projectSemanticIdentifier,
                commitHash: message.commit_hash,
                source: "chat",
              });
            }
            // Otherwise, just deactivate the message
            else {
              await deactivateMessageMutation({
                messageId: message._id,
              });
            }
          });
        }
      });

      return callbacks;
    }, [
      sortedMessages,
      revertToCommit,
      projectSemanticIdentifier,
      deactivateMessageMutation,
      latestExternalChangeTimestamp,
    ]);

    const latestRollbackTarget = useMemo(() => {
      for (let i = sortedMessages.length - 1; i >= 0; i--) {
        const message = sortedMessages[i];
        if (message.role !== "user") continue;
        const onRollback = rollbackCallbacks.get(message._id);
        if (!onRollback) continue;
        return {
          message,
          onRollback,
          hasCheckpoint:
            !!message.commit_hash &&
            message.commit_hash !== "creating" &&
            message.commit_hash !== "failed",
        };
      }
      return null;
    }, [rollbackCallbacks, sortedMessages]);

    return (
      <>
        {latestRollbackTarget && (
          <div className="pointer-events-none absolute right-4 top-14 z-30">
            <Dialog
              open={isRevertDialogOpen}
              onOpenChange={setIsRevertDialogOpen}
            >
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/95 text-muted-foreground shadow-sm shadow-black/20 hover:bg-muted hover:text-foreground"
                  title="Restore latest checkpoint"
                  aria-label="Restore latest checkpoint"
                >
                  <Undo className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Restore to checkpoint</DialogTitle>
                  <div className="space-y-3 pt-2">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                        <div className="space-y-1 text-sm text-amber-900">
                          <div className="font-medium">
                            This will revert your project
                          </div>
                          <div className="text-xs">
                            {latestRollbackTarget.hasCheckpoint
                              ? "All code changes, file edits, and modifications made after the latest checkpoint will be undone."
                              : "The latest user message and all messages after it will be removed from the chat."}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                        <div>Your chat history will be preserved</div>
                      </div>
                      {latestRollbackTarget.hasCheckpoint && (
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                          <div>
                            You can re-apply reverted changes from the Versions
                            page
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={async (e) => {
                      const button = e.currentTarget;
                      button.disabled = true;
                      button.textContent = "Restoring...";
                      try {
                        await latestRollbackTarget.onRollback();
                        setIsRevertDialogOpen(false);
                      } finally {
                        button.disabled = false;
                        button.textContent = "Restore";
                      }
                    }}
                  >
                    Restore
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div ref={contentRef} className="px-4 py-4">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            ) : (
              <>
                {/* Render all messages using memoized sorted list */}
                {sortedMessages.length > 0 ? (
                  <>
                    {/* Render real messages from backend */}
                    {sortedMessages.map((message, index) => {
                      const isEmptyAssistantMessage =
                        message.role === "assistant" &&
                        !message.content &&
                        !(message as any).has_execution_details;

                      // Find the LAST empty assistant message index
                      const lastEmptyAssistantIndex =
                        sortedMessages.findLastIndex(
                          (msg) =>
                            msg.role === "assistant" &&
                            !msg.content &&
                            !(msg as any).has_execution_details,
                        );

                      // Only show loading state for THE last empty assistant message when processing
                      // AND if there's no message_state (which takes precedence)
                      const shouldShowLoadingState =
                        isEmptyAssistantMessage &&
                        isProcessing &&
                        index === lastEmptyAssistantIndex &&
                        !message.message_state;

                      // For user messages, always provide rollback callback
                      let rollbackCallback = undefined;
                      if (message.role === "user") {
                        rollbackCallback = rollbackCallbacks.get(message._id);
                      }

                      return (
                        <div key={message._id} className="mb-2 last:mb-0">
                          <MemoizedChatMessage
                            message={message}
                            shouldShowLoadingState={shouldShowLoadingState}
                            loadingActivityKey={loadingActivityKey}
                            onRollback={rollbackCallback}
                            onSendMessage={onSendMessage}
                            projectSemanticIdentifier={
                              projectSemanticIdentifier
                            }
                          />
                        </div>
                      );
                    })}
                  </>
                ) : (
                  !isProcessing && (
                    <p className="pt-4 text-center text-sm italic text-zinc-500">
                      No messages yet. Start the conversation!
                    </p>
                  )
                )}
                {isCompactingHistory && (
                  <CompactionTranscriptMessage status="loading" />
                )}
                {shouldShowCompactionSuccess && (
                  <CompactionTranscriptMessage
                    status="complete"
                    compactedHistoryMessageCount={
                      activeThreadCompactionStatus?.compactedHistoryMessageCount
                    }
                  />
                )}
                {isProcessing && (
                  <div className="flex justify-start">
                    <ChatProcessingIndicator />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {!isAtBottom && <ScrollToBottomButton onClick={scrollToBottom} />}
      </>
    );
  },
);
