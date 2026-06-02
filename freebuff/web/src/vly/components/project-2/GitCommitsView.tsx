"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAction, useConvexAuth } from "convex/react";
import { Commit } from "@/vly/codebase-utils/codebase/Codebase";
import { Button } from "@/vly/components/ui/button";
import { ScrollArea } from "@/vly/components/ui/scroll-area";
import { Skeleton } from "@/vly/components/ui/skeleton";
import { Badge } from "@/vly/components/ui/badge";

import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import {
  Loader,
  GitCommit,
  Clock,
  User,
  Hash,
  Activity,
  Plus,
  Rewind,
  MessageSquare,
  Hammer,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";
import { toast } from "sonner";

type ProcessedCommit = Commit & {
  isRevert: boolean;
  revertedCommit?: string;
  groupId?: string;
};

const stripRevertPrefix = (message: string): string => {
  let result = message.replace(/\s*\[group:[a-f0-9-]+\]\s*$/, "");

  while (true) {
    const previous = result;

    result = result.replace(/^Revert\s+to\s*:\s*/i, "");
    result = result.replace(/^Revert\s+to\s+/i, "");
    result = result.replace(/^Revert\s+/i, "");
    result = result.replace(/^"(.+)"$/, "$1");
    result = result.replace(/^"/g, "");
    result = result.trim();

    if (result === previous) {
      break;
    }
  }

  return result;
};

const parseRevertMessage = (
  message: string,
): { isRevert: boolean; revertedCommit?: string; groupId?: string } => {
  const revertPattern = /^Revert\s/i;
  const hashPattern = /This reverts commit ([a-f0-9]+)/i;
  const groupIdPattern = /\[group:([a-f0-9-]+)\]/;

  if (revertPattern.test(message)) {
    const hashMatch = message.match(hashPattern);
    const groupMatch = message.match(groupIdPattern);
    return {
      isRevert: true,
      revertedCommit: hashMatch ? hashMatch[1] : undefined,
      groupId: groupMatch ? groupMatch[1] : undefined,
    };
  }

  return { isRevert: false };
};

interface GitCommitsViewProps {
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>;
}

function GitCommitsView({ project }: GitCommitsViewProps) {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const [commits, setCommits] = useState<Commit[] | undefined>(undefined);
  const [confirmingRevert, setConfirmingRevert] = useState<string | null>(null);
  const [slidingOut, setSlidingOut] = useState(false);
  const [revertingCommit, setRevertingCommit] = useState<string | null>(null);
  const [justAddedCommit, setJustAddedCommit] = useState<string | null>(null);
  const getCommits = useAction(api.codesandbox.versionControl.getCommits);
  const revertToCommit = useAction(api.codesandbox.versionControl.revert);

  const handleRevert = async (commitHash: string, commitMessage: string) => {
    setConfirmingRevert(null);
    setSlidingOut(false);
    setRevertingCommit(commitHash);
    const loadingToast = toast.loading("Reverting...");
    try {
      await revertToCommit({
        semanticIdentifier: project.semantic_identifier,
        commitHash,
        source: "versions_page",
      });
      toast.success(`Reverted to "${commitMessage}"`, { id: loadingToast });
    } catch (error) {
      toast.error("Failed to revert", { id: loadingToast });
    } finally {
      setRevertingCommit(null);
    }
  };

  useEffect(() => {
    if (project && isAuthenticated) {
      getCommits({
        semanticIdentifier: project.semantic_identifier,
      }).then((newCommits) => {
        if (commits && newCommits && newCommits[0]?.hash !== commits[0]?.hash) {
          setJustAddedCommit(newCommits[0].hash);
          setTimeout(() => setJustAddedCommit(null), 2000);
        }
        setCommits(newCommits);
      });
    }
  }, [project, getCommits, isAuthenticated]);

  // Process commits to identify reverts and group them
  const processedCommits = useMemo(() => {
    if (!commits) return undefined;

    return commits.map((commit) => {
      const { isRevert, revertedCommit, groupId } = parseRevertMessage(
        commit.message,
      );
      return {
        ...commit,
        isRevert,
        revertedCommit,
        groupId,
      };
    });
  }, [commits]);

  // Get commit statistics
  const commitStats = useMemo(() => {
    if (!processedCommits) return { total: 0, reverts: 0, features: 0 };

    const reverts = processedCommits.filter((c) => c.isRevert).length;
    const features = processedCommits.filter(
      (c) =>
        !c.isRevert &&
        (c.message.toLowerCase().includes("feat") ||
          c.message.toLowerCase().includes("add") ||
          c.message.toLowerCase().includes("initial")),
    ).length;

    return {
      total: processedCommits.length,
      reverts,
      features,
    };
  }, [processedCommits]);

  if (isAuthLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader className="animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const getCommitTypeInfo = (commit: Commit & { isRevert?: boolean }) => {
    const message = commit.message.toLowerCase();

    if (commit.isRevert) {
      return {
        type: "revert",
        icon: Rewind,
        color: "text-orange-600 bg-orange-50 border-orange-200",
        label: "Revert",
        tooltip: "Reverted to a previous state",
      };
    }

    if (message.includes("work in progress - saved before revert")) {
      return {
        type: "wip-save",
        icon: Hammer,
        color: "text-amber-600 bg-amber-50 border-amber-200",
        label: "WIP Save",
        tooltip: "Work in progress automatically saved before reverting",
      };
    }

    if (message.startsWith("before:")) {
      return {
        type: "checkpoint",
        icon: MessageSquare,
        color: "text-purple-600 bg-purple-50 border-purple-200",
        label: "Pre-message",
        tooltip: "Automatic checkpoint before processing user message",
      };
    }

    if (message.includes("feat") || message.includes("add")) {
      return {
        type: "feature",
        icon: Plus,
        color: "text-green-600 bg-green-50 border-green-200",
        label: "Feature",
        tooltip: "New feature or functionality added",
      };
    }

    if (message.includes("fix")) {
      return {
        type: "fix",
        icon: Activity,
        color: "text-blue-600 bg-blue-50 border-blue-200",
        label: "Fix",
        tooltip: "Bug fix or issue resolved",
      };
    }

    return {
      type: "other",
      icon: GitCommit,
      color: "text-gray-600 bg-gray-50 border-gray-200",
      label: "Update",
      tooltip: "General update or change",
    };
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp * 1000;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Enhanced Header */}
      <div className="w-full overflow-hidden border-b bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
              Version History
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Track all changes and checkpoint your project
            </p>
          </div>
          <div className="flex items-center gap-3">
            {processedCommits && (
              <div className="flex gap-3 sm:gap-4">
                <div className="text-center">
                  <div className="text-base font-semibold text-slate-900 sm:text-lg">
                    {commitStats.total}
                  </div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-base font-semibold text-green-600 sm:text-lg">
                    {commitStats.features}
                  </div>
                  <div className="text-xs text-slate-500">Features</div>
                </div>
                <div className="text-center">
                  <div className="text-base font-semibold text-orange-600 sm:text-lg">
                    {commitStats.reverts}
                  </div>
                  <div className="text-xs text-slate-500">Reverts</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {processedCommits === undefined ? (
          <div className="space-y-3 p-3 sm:p-6">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="flex items-center space-x-3 p-3 sm:space-x-4 sm:p-4"
              >
                <Skeleton className="h-8 w-8 rounded-full sm:h-10 sm:w-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-16 sm:w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full divide-y divide-slate-100 overflow-hidden">
            {processedCommits?.map((commit, index) => {
              const typeInfo = getCommitTypeInfo(commit);
              const Icon = typeInfo.icon;
              const isLatest = index === 0;
              const isReverting = revertingCommit === commit.hash;
              const isJustAdded = justAddedCommit === commit.hash;

              return (
                <div
                  key={commit.hash}
                  className={`duration-2000 p-3 transition-colors hover:bg-slate-50/50 sm:p-4 ${isLatest && !isJustAdded ? "bg-blue-50/30" : ""} ${isReverting ? "animate-pulse bg-orange-100" : ""} ${isJustAdded ? "bg-orange-100" : ""} w-full overflow-hidden`}
                >
                  {confirmingRevert === commit.hash ? (
                    /* Confirmation Panel replacing row content */
                    <div
                      className={`-m-3 flex w-full items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 sm:-m-4 sm:gap-4 sm:p-4 ${slidingOut ? "duration-300 animate-out slide-out-to-right-full" : "duration-300 animate-in slide-in-from-right-full"}`}
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
                        <Rewind className="h-4 w-4 text-orange-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="mb-2 text-sm font-medium leading-tight text-orange-900 sm:text-base">
                          Revert to "
                          <span className="font-semibold text-green-600">
                            {stripRevertPrefix(commit.message)}
                          </span>
                          "?
                        </p>
                        <div className="mt-2 flex flex-col gap-2 text-xs text-orange-800 sm:text-sm">
                          <div className="flex items-center gap-1">
                            <div className="h-1 w-1 flex-shrink-0 rounded-full bg-orange-600" />
                            <p>Creates commits undoing changes after this</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="h-1 w-1 flex-shrink-0 rounded-full bg-red-600" />
                            <p>Disables undo buttons in chat after this</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 gap-2 self-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSlidingOut(true);
                            setTimeout(() => {
                              setConfirmingRevert(null);
                              setSlidingOut(false);
                            }, 300);
                          }}
                          className="h-7 whitespace-nowrap border-orange-300 px-2 text-xs text-orange-700 hover:bg-orange-100 sm:h-8 sm:px-3 sm:text-sm"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const commitMessage =
                              stripRevertPrefix(commit.message) || "checkpoint";
                            handleRevert(commit.hash, commitMessage);
                          }}
                          className="h-7 whitespace-nowrap bg-orange-600 px-2 text-xs hover:bg-orange-700 sm:h-8 sm:px-3 sm:text-sm"
                        >
                          Revert
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Original commit row content */
                    <div className="flex w-full items-start gap-3 overflow-hidden py-3 sm:gap-4">
                      {/* Icon and Type Badge */}
                      <div className="flex flex-shrink-0 flex-col items-center gap-1 sm:gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`rounded-full border p-1.5 sm:p-2 ${typeInfo.color}`}
                              >
                                <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{typeInfo.tooltip}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {isLatest && (
                          <Badge
                            variant="secondary"
                            className="whitespace-nowrap bg-blue-100 px-1.5 py-0 text-xs text-blue-700 sm:px-2"
                          >
                            Latest
                          </Badge>
                        )}
                      </div>

                      {/* Commit Info */}
                      <div className="w-full min-w-0 flex-1 overflow-hidden">
                        <div className="flex w-full flex-col gap-3 overflow-hidden sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                            {/* Message */}
                            <p
                              className="overflow-hidden text-sm font-medium leading-tight text-slate-900 sm:text-base"
                              style={{
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                                maxWidth: "100%",
                              }}
                            >
                              {stripRevertPrefix(commit.message)}
                            </p>

                            {/* Meta Info */}
                            <div className="mt-2 flex flex-col gap-2 overflow-hidden text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-4 sm:text-sm">
                              <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                                <User className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">
                                  {commit.author}
                                </span>
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span className="whitespace-nowrap">
                                  {formatRelativeTime(commit.timestamp)}
                                </span>
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-1">
                                <Hash className="h-3 w-3" />
                                <code className="break-all rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
                                  {commit.hash.substring(0, 7)}
                                </code>
                              </div>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="flex-shrink-0 self-start">
                            {index > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 whitespace-nowrap px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
                                      onClick={() => {
                                        setConfirmingRevert(commit.hash);
                                      }}
                                    >
                                      <Rewind className="h-3 w-3 sm:mr-1" />
                                      <span className="hidden sm:inline">
                                        Revert
                                      </span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Revert to this checkpoint</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default GitCommitsView;
