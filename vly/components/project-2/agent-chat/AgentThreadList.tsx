"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { ChevronLeft, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AgentThreadListProps {
  projectSemanticIdentifier: string;
  activeThreadId: Id<"agent_thread"> | Id<"thread"> | undefined;
  onSelectThread: (
    threadId: Id<"agent_thread"> | Id<"thread">,
    threadType: "agent_thread" | "thread",
  ) => void;
  onCreateNewThread: () => void;
  onBack: () => void;
  isProcessing: boolean;
}

// Helper function to categorize threads by date
const categorizeThreads = <
  T extends { thread: { last_edited_timestamp: number } },
>(
  threads: T[],
) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

  const categories: {
    today: typeof threads;
    yesterday: typeof threads;
    thisWeek: typeof threads;
    before: typeof threads;
  } = {
    today: [],
    yesterday: [],
    thisWeek: [],
    before: [],
  };

  threads.forEach((item) => {
    const timestamp = item.thread.last_edited_timestamp;
    if (timestamp >= todayStart) {
      categories.today.push(item);
    } else if (timestamp >= yesterdayStart) {
      categories.yesterday.push(item);
    } else if (timestamp >= weekStart) {
      categories.thisWeek.push(item);
    } else {
      categories.before.push(item);
    }
  });

  return categories;
};

// Format time for display
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export function AgentThreadList({
  projectSemanticIdentifier,
  activeThreadId,
  onSelectThread,
  onCreateNewThread,
  onBack,
  isProcessing,
}: AgentThreadListProps) {
  // Skip query if projectSemanticIdentifier is empty/invalid to prevent server errors
  const threadsWithPreview = useQuery(
    api.coding_agent.cli_agent.queries.getUnifiedThreadsWithPreview,
    projectSemanticIdentifier
      ? { semanticIdentifier: projectSemanticIdentifier }
      : "skip",
  );

  if (threadsWithPreview === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-xs text-zinc-500">
          Loading threads...
        </div>
      </div>
    );
  }

  const categories = categorizeThreads(threadsWithPreview);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-white px-4 py-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }}
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-zinc-100"
        >
          <ChevronLeft className="h-4 w-4 text-zinc-600" />
        </button>
        <h2 className="flex-1 text-sm font-semibold text-zinc-900">Threads</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isProcessing) {
                onCreateNewThread();
              }
            }}
            type="button"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            New
          </Button>
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {threadsWithPreview.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="text-center">
              <p className="mb-2 text-sm font-medium text-zinc-700">
                No threads yet
              </p>
              <p className="mb-4 text-xs text-zinc-500">
                Create a new thread to get started
              </p>
              <Button onClick={onCreateNewThread} size="sm" className="text-xs">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Thread
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {/* Today */}
            {categories.today.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Today
                </div>
                {categories.today.map((item) => (
                  <button
                    key={item.thread._id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectThread(item.thread._id, item.thread.threadType);
                    }}
                    type="button"
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50",
                      activeThreadId === item.thread._id && "bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-900">
                            {item.thread.title || "Untitled Thread"}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {item.thread.agent_type}
                          </span>
                          {"isProcessing" in item.thread &&
                            item.thread.isProcessing && (
                              <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                            )}
                        </div>
                        {item.latestUserMessage && (
                          <div className="truncate text-xs text-zinc-600">
                            {item.latestUserMessage}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-[10px] text-zinc-400">
                        {formatTime(item.thread.last_edited_timestamp)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Yesterday */}
            {categories.yesterday.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Yesterday
                </div>
                {categories.yesterday.map((item) => (
                  <button
                    key={item.thread._id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectThread(item.thread._id, item.thread.threadType);
                    }}
                    type="button"
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50",
                      activeThreadId === item.thread._id && "bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-900">
                            {item.thread.title || "Untitled Thread"}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {item.thread.agent_type}
                          </span>
                          {"isProcessing" in item.thread &&
                            item.thread.isProcessing && (
                              <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                            )}
                        </div>
                        {item.latestUserMessage && (
                          <div className="truncate text-xs text-zinc-600">
                            {item.latestUserMessage}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-[10px] text-zinc-400">
                        {formatTime(item.thread.last_edited_timestamp)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* This Week */}
            {categories.thisWeek.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  This Week
                </div>
                {categories.thisWeek.map((item) => (
                  <button
                    key={item.thread._id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectThread(item.thread._id, item.thread.threadType);
                    }}
                    type="button"
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50",
                      activeThreadId === item.thread._id && "bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-900">
                            {item.thread.title || "Untitled Thread"}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {item.thread.agent_type}
                          </span>
                          {"isProcessing" in item.thread &&
                            item.thread.isProcessing && (
                              <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                            )}
                        </div>
                        {item.latestUserMessage && (
                          <div className="truncate text-xs text-zinc-600">
                            {item.latestUserMessage}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-[10px] text-zinc-400">
                        {formatTime(item.thread.last_edited_timestamp)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Before */}
            {categories.before.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Earlier
                </div>
                {categories.before.map((item) => (
                  <button
                    key={item.thread._id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectThread(item.thread._id, item.thread.threadType);
                    }}
                    type="button"
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50",
                      activeThreadId === item.thread._id && "bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-900">
                            {item.thread.title || "Untitled Thread"}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {item.thread.agent_type}
                          </span>
                        </div>
                        {item.latestUserMessage && (
                          <div className="truncate text-xs text-zinc-600">
                            {item.latestUserMessage}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-[10px] text-zinc-400">
                        {formatTime(item.thread.last_edited_timestamp)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
