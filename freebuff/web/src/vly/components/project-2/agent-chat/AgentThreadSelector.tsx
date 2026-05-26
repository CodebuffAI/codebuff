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

  const activeThread = projectAgentThreads.find(
    (t) => t._id === activeThreadId,
  );
  void activeThread; // Used in JSX below

  // disclaimer). Freebuff is the only supported agent.
  const handleCreateNewThread = async () => {
    if (creatingThread) return;
    setCreatingThread(true);
    try {
      await createNewAgentThread({
        projectSemanticIdentifier,
        agentType: "Freebuff",
      });
    } catch {
      toast.error("Failed to create thread");
    } finally {
      setCreatingThread(false);
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
            <p>Create New Agent Thread (Claude Code or Codex)</p>
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

      {/* Model picker dialog removed: Freebuff is the only agent. */}
    </div>
  );
};
