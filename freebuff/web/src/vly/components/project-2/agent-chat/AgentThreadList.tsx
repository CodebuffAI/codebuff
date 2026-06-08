"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronDown, Plus, Loader2, Archive } from "lucide-react";
import { cn } from "@/vly/lib/utils";
import { useState, type MouseEvent } from "react";

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
  // Archived (legacy) threads are collapsed by default so the list focuses on
  // active Freebuff threads.
  const [showArchived, setShowArchived] = useState(false);

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

  // Legacy threads (old "vly agent 2.0" chats) are read-only and tucked into an
  // Archived section; only new Freebuff agent threads show in the main list.
  const activeThreads = threadsWithPreview.filter(
    (item) => item.thread.threadType === "agent_thread",
  );
  const archivedThreads = threadsWithPreview.filter(
    (item) => item.thread.threadType === "thread",
  );

  const categories = categorizeThreads(activeThreads);
  const sections = [
    { label: "Today", items: categories.today },
    { label: "Yesterday", items: categories.yesterday },
    { label: "This week", items: categories.thisWeek },
    { label: "Earlier", items: categories.before },
  ].filter((section) => section.items.length > 0);

  type ThreadPreviewItem = (typeof threadsWithPreview)[number];

  const handleCreateClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isProcessing) {
      onCreateNewThread();
    }
  };

  const renderThreadRow = (item: ThreadPreviewItem) => {
    const isActive = activeThreadId === item.thread._id;
    const title = item.thread.title || "Untitled Thread";
    const preview = item.latestUserMessage?.trim();
    const agentLabel =
      item.thread.threadType === "agent_thread"
        ? item.thread.agent_type || "Freebuff"
        : "Legacy";
    const processing =
      "isProcessing" in item.thread && Boolean(item.thread.isProcessing);

    return (
      <button
        key={item.thread._id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectThread(item.thread._id, item.thread.threadType);
        }}
        type="button"
        className={cn(
          "group w-full rounded-md border border-transparent px-3 py-3 text-left transition-colors",
          "hover:border-border/70 hover:bg-muted/45",
          isActive && "border-border/70 bg-muted/60",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/30",
              isActive && "bg-primary",
              processing && "animate-pulse bg-primary",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {agentLabel}
              </span>
              {processing && (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              )}
            </div>
            {preview && (
              <div className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {preview}
              </div>
            )}
          </div>
          <time className="shrink-0 pt-0.5 text-xs text-muted-foreground">
            {formatTime(item.thread.last_edited_timestamp)}
          </time>
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }}
          type="button"
          aria-label="Back to thread"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          Threads
        </h2>
        <button
          onClick={handleCreateClick}
          type="button"
          aria-label="New thread"
          disabled={isProcessing}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {threadsWithPreview.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="max-w-xs text-center">
              <p className="mb-2 text-sm font-medium text-foreground">
                No threads yet
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                Start a thread when you want Freebuff to work on a new task.
              </p>
              <button
                onClick={handleCreateClick}
                type="button"
                disabled={isProcessing}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border/70 px-3 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                New thread
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map((section, index) => (
              <section key={section.label}>
                <div
                  className={cn(
                    "mb-2 flex items-center gap-3 px-1",
                    index > 0 && "border-t border-border/40 pt-4",
                  )}
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {section.label}
                  </h3>
                  <div className="h-px flex-1 bg-border/30" />
                </div>
                <div className="space-y-1">{section.items.map(renderThreadRow)}</div>
              </section>
            ))}

            {activeThreads.length === 0 && archivedThreads.length > 0 && (
              <p className="px-1 text-sm text-muted-foreground">
                No active threads yet. Start a new Freebuff thread, or browse
                your archived legacy chats below.
              </p>
            )}

            {/* Archived (legacy) threads — collapsed, harder to reach on purpose */}
            {archivedThreads.length > 0 && (
              <section
                className={cn(sections.length > 0 && "border-t border-border/40 pt-4")}
              >
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  aria-expanded={showArchived}
                  className="mb-2 flex w-full items-center gap-2 px-1 text-left"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      !showArchived && "-rotate-90",
                    )}
                  />
                  <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Archived
                  </h3>
                  <span className="rounded-full bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {archivedThreads.length}
                  </span>
                  <div className="h-px flex-1 bg-border/30" />
                </button>
                {showArchived && (
                  <div className="space-y-1">
                    {archivedThreads.map(renderThreadRow)}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
