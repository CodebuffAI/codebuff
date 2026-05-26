"use client";

import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/vly/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/vly/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Plus, Pencil, ChevronDown } from "lucide-react";
import { useState } from "react";
import { TooltipProvider } from "@/vly/components/ui/tooltip";
import { toast } from "sonner";
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

export const AgentThreadSelector = ({
  activeThreadId,
  setActiveThread,
  projectAgentThreads,
  isProcessing,
  projectSemanticIdentifier,
}: {
  activeThreadId: Id<"agent_thread"> | undefined;
  setActiveThread: (threadId: Id<"agent_thread">) => void;
  projectAgentThreads: Doc<"agent_thread">[];
  isProcessing: boolean;
  projectSemanticIdentifier: string;
}) => {
  // Don't query project here - it should be passed from parent
  // This component should not make its own queries to avoid conflicts
  const updateThreadTitle = useMutation(
    api.coding_agent.cli_agent.agent_thread.updateAgentThreadTitle,
  );
  const createNewAgentThread = useMutation(
    api.coding_agent.cli_agent.agent_thread.createNewAgentThread,
  );
  const [creatingThread, setCreatingThread] = useState(false);
  const [editingThreadId, setEditingThreadId] =
    useState<Id<"agent_thread"> | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [threadToDelete, setThreadToDelete] =
    useState<Id<"agent_thread"> | null>(null);
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);
  const [pendingModelSelection, setPendingModelSelection] = useState<
    "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff" | null
  >(null);

  const activeThread = projectAgentThreads.find(
    (t) => t._id === activeThreadId,
  );
  void activeThread; // Used in JSX below

  const handleCreateNewThread = () => {
    // Always open the model selection dialog when "New" is clicked
    setShowModelDialog(true);
  };

  // Actually create the thread (called after disclaimer acknowledgment)
  const createThreadAfterAcknowledgment = async (
    agentType: "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff",
  ) => {
    setCreatingThread(true);
    try {
      await createNewAgentThread({
        projectSemanticIdentifier,
        agentType,
      });

      // createNewAgentThread already sets active_agent_thread on the project
      setShowModelDialog(false);
    } catch {
      toast.error("Failed to create thread");
    } finally {
      setCreatingThread(false);
    }
  };

  const handleSelectModelAndCreateThread = async (
    agentType: "Claude Code" | "Codex" | "Gemini CLI" | "Freebuff",
  ) => {
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
  };

  // Handle disclaimer acknowledgment
  const handleDisclaimerAcknowledged = () => {
    if (pendingModelSelection) {
      createThreadAfterAcknowledgment(pendingModelSelection);
      setPendingModelSelection(null);
    }
  };

  const handleStartEditing = () => {
    const thread = projectAgentThreads.find((t) => t._id === activeThreadId);
    if (thread) {
      setEditingThreadId(thread._id);
      setEditingTitle(thread.title || "");
    }
  };

  const handleSaveTitle = async () => {
    if (!editingThreadId) return;

    try {
      await updateThreadTitle({
        threadId: editingThreadId,
        title: editingTitle || undefined,
      });
      setEditingThreadId(null);
      setEditingTitle("");
    } catch {
      toast.error("Failed to update thread title");
    }
  };

  const handleDeleteThread = async () => {
    if (!threadToDelete) return;

    try {
      // TODO: Implement delete agent thread mutation
      toast.info("Thread deletion not yet implemented");
      setShowDeleteDialog(false);
      setThreadToDelete(null);
    } catch {
      toast.error("Failed to delete thread");
    }
  };

  return (
    <div className="flex items-center justify-between border-b bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        {editingThreadId === activeThreadId ? (
          <div className="flex items-center gap-2">
            <Input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSaveTitle();
                } else if (e.key === "Escape") {
                  setEditingThreadId(null);
                  setEditingTitle("");
                }
              }}
              className="h-6 text-sm"
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={isProcessing}>
                <button className="flex items-center gap-1 text-sm font-semibold opacity-80 transition-opacity hover:opacity-100">
                  <span>
                    {activeThread?.title ??
                      (activeThread
                        ? `Thread ${new Date(activeThread.last_edited_timestamp).toLocaleString()}`
                        : "Agent Thread")}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {projectAgentThreads.map((t) => (
                  <DropdownMenuItem
                    key={t._id}
                    onClick={() => setActiveThread(t._id)}
                    className="text-xs"
                  >
                    {t.title ??
                      `Thread ${new Date(t.last_edited_timestamp).toLocaleString()}`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {activeThread && (
              <button
                onClick={handleStartEditing}
                disabled={isProcessing}
                className="opacity-60 transition-opacity hover:opacity-100"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNewThread}
              disabled={isProcessing || creatingThread}
              className="h-7 gap-2 px-3"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs">New</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Create New Agent Thread</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Thread</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this thread? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteThread}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <Dialog
        open={showModelDialog}
        onOpenChange={(open) => {
          setShowModelDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg">Select Model</DialogTitle>
            <DialogDescription className="text-sm">
              Choose a model for this new thread. The model will be used for all
              messages in this thread.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Card
              onClick={() => {
                if (!creatingThread) {
                  handleSelectModelAndCreateThread("Claude Code");
                }
              }}
              className={`transition-all ${
                creatingThread
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
                if (!creatingThread) {
                  handleSelectModelAndCreateThread("Codex");
                }
              }}
              className={`transition-all ${
                creatingThread
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
                  Cheapest, but best for intelligent features.
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

            <Card
              onClick={() => {
                if (!creatingThread) {
                  handleSelectModelAndCreateThread("Freebuff");
                }
              }}
              className={`transition-all ${
                creatingThread
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-primary hover:bg-accent/50 active:scale-[0.98]"
              }`}
            >
              <CardHeader className="px-4 py-3 pb-2">
                <div className="flex items-center gap-2">
                  <img
                    src="/favicon.svg"
                    alt="vly agent 2.0"
                    className="h-5 w-5 object-contain"
                  />
                  <CardTitle className="text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <span>vly agent 2.0</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700">
                        New
                      </span>
                    </span>
                  </CardTitle>
                </div>
                <CardDescription className="mt-1 text-xs">
                  vly agent 2.0 default workflow.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
