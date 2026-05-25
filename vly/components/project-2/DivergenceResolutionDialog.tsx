"use client";

import React, { useState, useCallback } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Github,
  RotateCcw,
  Loader,
  CheckCircle,
} from "lucide-react";

interface DivergenceInfo {
  isDivergent: boolean;
  localCommits: number;
  remoteCommits: number;
  divergenceType: string;
  canFastForward: boolean;
}

interface DivergenceResolutionDialogProps {
  projectId: Id<"project">;
  isOpen: boolean;
  onClose: () => void;
  onResolved: () => void;
  divergenceInfo: DivergenceInfo;
}

export default function DivergenceResolutionDialog({
  projectId,
  isOpen,
  onClose,
  onResolved,
  divergenceInfo,
}: DivergenceResolutionDialogProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [isResolving, setIsResolving] = useState(false);
  const [backupBranches, setBackupBranches] = useState<string[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string>("");
  const { toast } = useToast();

  const resolveConflicts = useAction(api.github.sync.index.resolveConflicts);
  const getResolutionOptions = useAction(
    api.github.sync.index.getResolutionOptions,
  );

  const loadResolutionOptions = useCallback(async () => {
    try {
      const options = await getResolutionOptions({ projectId });
      setBackupBranches(options.availableBackups || []);
    } catch (error) {
      console.error("Failed to load resolution options:", error);
    }
  }, [getResolutionOptions, projectId]);

  // Load resolution options when dialog opens
  React.useEffect(() => {
    if (isOpen && divergenceInfo) {
      loadResolutionOptions();
    }
  }, [isOpen, divergenceInfo, loadResolutionOptions]);

  // Don't render if no divergence info
  if (!divergenceInfo) {
    return null;
  }

  const handleResolve = async () => {
    if (!selectedStrategy) {
      toast({
        title: "Please choose an option",
        description: "Select which version you'd like to use before continuing",
        variant: "destructive",
      });
      return;
    }

    if (selectedStrategy === "use_backup_version" && !selectedBackup) {
      toast({
        title: "Please select a version",
        description: "Choose which previous version you'd like to go back to",
        variant: "destructive",
      });
      return;
    }

    setIsResolving(true);
    try {
      const result = await resolveConflicts({
        projectId,
        resolutionType: "divergence",
        divergenceStrategy: selectedStrategy as any,
        backupBranch:
          selectedStrategy === "use_backup_version"
            ? selectedBackup
            : undefined,
      });

      if (result.success) {
        toast({
          title: "✅ Changes merged successfully!",
          description:
            "Your project is now ready to continue building. All work has been safely preserved.",
        });
        onResolved();
        onClose();
      } else {
        toast({
          title: "Something went wrong",
          description:
            result.message ||
            "We couldn't merge the changes. Please try again or contact support if this continues.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to resolve divergence:", error);
      toast({
        title: "Connection issue",
        description:
          "We couldn't connect to GitHub right now. Please check your internet connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsResolving(false);
    }
  };

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case "use_github_version":
        return <Github className="h-5 w-5 text-slate-600" />;
      case "use_local_version":
        return <img src="/logo.svg" alt="vly.ai logo" className="h-5 w-5" />;
      case "use_backup_version":
        return <RotateCcw className="h-5 w-5 text-slate-600" />;
      default:
        return null;
    }
  };

  const getStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case "use_github_version":
        return "Use the version that's on GitHub and set aside your current changes. Your work will be safely backed up first, so you can always get it back later if needed.";
      case "use_local_version":
        return "Keep the version you have here and update GitHub to match. The GitHub version will be backed up first, so nothing is permanently lost.";
      case "use_backup_version":
        return "Go back to a previous version that was automatically saved. Your current work will be backed up before switching.";
      default:
        return "";
    }
  };

  const strategies = [
    {
      id: "use_github_version",
      title: "Use What's on GitHub",
      description: getStrategyDescription("use_github_version"),
      impact: "Safe - Your work is backed up first",
      recommended: divergenceInfo?.divergenceType === "behind",
    },
    {
      id: "use_local_version",
      title: "Use Current vly.ai Version",
      description: getStrategyDescription("use_local_version"),
      impact: "Safe - GitHub version is backed up first",
      recommended: divergenceInfo?.divergenceType === "ahead",
    },
  ];

  if (backupBranches.length > 0) {
    strategies.push({
      id: "use_backup_version",
      title: "Go Back to a Previous Version",
      description: getStrategyDescription("use_backup_version"),
      impact: "Safe - Current work is backed up first",
      recommended: false,
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Project Changes Need to be Merged
          </DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            Your project has changes in two places that need to be combined.
            {divergenceInfo?.localCommits > 0 &&
            divergenceInfo?.remoteCommits > 0
              ? ` You have ${divergenceInfo.localCommits} change${divergenceInfo.localCommits > 1 ? "s" : ""} here, and ${divergenceInfo.remoteCommits} change${divergenceInfo.remoteCommits > 1 ? "s" : ""} on GitHub.`
              : divergenceInfo?.localCommits > 0
                ? ` You have ${divergenceInfo.localCommits} change${divergenceInfo.localCommits > 1 ? "s" : ""} that haven't been saved to GitHub yet.`
                : divergenceInfo?.remoteCommits > 0
                  ? ` There are ${divergenceInfo.remoteCommits} new change${divergenceInfo.remoteCommits > 1 ? "s" : ""} on GitHub that you don't have yet.`
                  : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] flex-1 space-y-4 overflow-y-auto p-1">
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-orange-600" />
              <div>
                <h4 className="font-medium text-orange-800">What happened?</h4>
                <p className="mt-1 text-sm leading-relaxed text-orange-700">
                  Your project has changes in two different places that can't be
                  automatically combined. This usually happens when someone else
                  worked on the project while you were also making changes.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-1">
            {strategies.map((strategy) => (
              <Card
                key={strategy.id}
                className={`cursor-pointer transition-all ${
                  selectedStrategy === strategy.id
                    ? "border-slate-300 ring-2 ring-slate-400"
                    : "border-gray-200 hover:border-gray-300"
                } ${strategy.recommended ? "border-slate-200 bg-slate-50" : ""}`}
                onClick={() => setSelectedStrategy(strategy.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStrategyIcon(strategy.id)}
                      <CardTitle className="text-base">
                        {strategy.title}
                      </CardTitle>
                      {strategy.recommended && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="flex items-center">
                      {selectedStrategy === strategy.id ? (
                        <CheckCircle className="h-5 w-5 text-slate-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="mb-2 text-sm text-gray-600">
                    {strategy.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Safety:</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {strategy.impact}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedStrategy === "use_backup_version" &&
            backupBranches.length > 0 && (
              <Card className="border-slate-200 bg-slate-50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <RotateCcw className="h-4 w-4" />
                    Choose Which Previous Version
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="mb-3 text-sm text-slate-600">
                    These are automatically saved versions of your project from
                    different points in time:
                  </p>
                  <div className="grid gap-2">
                    {backupBranches.map((branch) => (
                      <div
                        key={branch}
                        className={`cursor-pointer rounded-lg p-3 transition-all ${
                          selectedBackup === branch
                            ? "border-2 border-slate-300 bg-slate-100"
                            : "border border-gray-200 bg-white hover:border-gray-300"
                        }`}
                        onClick={() => setSelectedBackup(branch)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">
                              {branch
                                .replace(/backup-|backup_/g, "")
                                .replace(/-/g, " ")}
                            </span>
                            <div className="text-xs text-gray-500">
                              Saved version
                            </div>
                          </div>
                          {selectedBackup === branch && (
                            <CheckCircle className="h-4 w-4 text-slate-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isResolving}>
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={isResolving || !selectedStrategy}
          >
            {isResolving ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Merging Changes...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Merge Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
