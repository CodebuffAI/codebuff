import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import {
  Plus,
  MessageCircleHeart,
  Pencil,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { useState, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

export const ThreadSelector = ({
  onPageSelectedForEdit,
  activeThreadId,
  setActiveThread,
  projectThreads,
  isProcessing,
  expandedPageNodeId,
  projectSemanticIdentifier,
  createNewThreadFromEntryPoint,
  onSwitchToNewAgent,
}: {
  onPageSelectedForEdit: (id: Id<"entry_point"> | null) => void;
  activeThreadId: Id<"thread"> | undefined;
  setActiveThread: (threadId: Id<"thread">) => void;
  projectThreads: Doc<"thread">[];
  isProcessing: boolean;
  expandedPageNodeId: Id<"entry_point"> | null;
  projectSemanticIdentifier: string;
  createNewThreadFromEntryPoint: (args: {
    projectSemanticIdentifier: string;
    entryPointId: Id<"entry_point">;
  }) => Promise<any>;
  onSwitchToNewAgent?: () => void;
}) => {
  const createNewThread = useMutation(api.thread.createNewThreadMain);
  const updateThreadTitle = useMutation(api.thread.updateThreadTitle);
  const deleteThread = useMutation(api.thread.deleteThread);
  const [creatingThread, setCreatingThread] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<Id<"thread"> | null>(
    null,
  );
  const [editingTitle, setEditingTitle] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<Id<"thread"> | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);
  const handleCreateNewThread = async () => {
    setCreatingThread(true);
    try {
      if (expandedPageNodeId) {
        await createNewThreadFromEntryPoint({
          projectSemanticIdentifier,
          entryPointId: expandedPageNodeId,
        });
        onPageSelectedForEdit(expandedPageNodeId);
      } else {
        await createNewThread({
          projectSemanticIdentifier,
        });
        onPageSelectedForEdit(null);
      }
    } catch {
      // error handling
    } finally {
      setCreatingThread(false);
    }
  };

  const handleStartEditing = () => {
    const activeThread = projectThreads.find((t) => t._id === activeThreadId);
    if (activeThread) {
      setEditingThreadId(activeThread._id);
      setEditingTitle(activeThread.title || "");
      // Also set threadToDelete in case user wants to delete immediately
      setThreadToDelete(activeThread._id);
    }
  };

  const handleSaveTitle = async () => {
    // Don't save if we're in the process of deleting
    if (isDeletingRef.current) {
      return;
    }

    if (!editingThreadId) {
      setEditingThreadId(null);
      setEditingTitle("");
      return;
    }

    // Allow saving empty titles (they'll be shown as "Untitled")
    const titleToSave = editingTitle.trim() || "";

    try {
      await updateThreadTitle({
        semanticIdentifier: projectSemanticIdentifier,
        threadId: editingThreadId,
        title: titleToSave,
      });
    } catch (error) {
      console.error("Failed to update thread title:", error);
    } finally {
      setEditingThreadId(null);
      setEditingTitle("");
    }
  };

  const handleCancelEditing = () => {
    setEditingThreadId(null);
    setEditingTitle("");
  };

  const handleDeleteThread = async () => {
    const threadIdToDelete =
      threadToDelete || editingThreadId || activeThreadId;

    if (!threadIdToDelete) {
      console.error("No thread ID to delete");
      toast.error("No thread selected for deletion");
      return;
    }

    console.log("Starting thread deletion", {
      threadId: threadIdToDelete,
      semanticIdentifier: projectSemanticIdentifier,
    });

    setIsDeleting(true);
    try {
      const result = await deleteThread({
        semanticIdentifier: projectSemanticIdentifier,
        threadId: threadIdToDelete,
      });
      console.log("Delete thread result:", result);

      if (result?.success) {
        toast.success("Thread deleted");
        setShowDeleteDialog(false);
        setThreadToDelete(null);
        setEditingThreadId(null);
        setEditingTitle("");
      } else {
        throw new Error("Delete returned unsuccessful result");
      }
    } catch (error) {
      console.error("Failed to delete thread:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete thread";
      toast.error(`Failed to delete thread: ${errorMessage}`);
      // Don't close dialog on error so user can try again
    } finally {
      setIsDeleting(false);
    }
  };

  const activeThread = projectThreads.find((t) => t._id === activeThreadId);

  return (
    <div className="mt-1 flex w-full items-center justify-between px-2 py-1.5">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2">
          <MessageCircleHeart className="h-3 w-3 opacity-80" />

          {editingThreadId === activeThreadId ? (
            <div className="flex flex-1 items-center gap-1">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveTitle();
                }}
                className="flex-1"
              >
                <Input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  autoFocus
                  onBlur={(e) => {
                    // Don't save if clicking on delete button
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    if (
                      relatedTarget?.closest('button[title="Delete thread"]')
                    ) {
                      return;
                    }
                    handleSaveTitle();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      handleCancelEditing();
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveTitle();
                    }
                  }}
                  className="h-6 min-w-[120px] px-2 text-sm"
                  disabled={isProcessing}
                />
              </form>
              <button
                onMouseDown={(e) => {
                  // Prevent input blur when clicking delete
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const threadIdToDelete = editingThreadId || activeThreadId;
                  console.log("Delete button clicked", {
                    editingThreadId,
                    activeThreadId,
                    threadIdToDelete,
                  });
                  if (threadIdToDelete) {
                    isDeletingRef.current = true;
                    setThreadToDelete(threadIdToDelete);
                    setShowDeleteDialog(true);
                    console.log("Delete dialog should open");
                  } else {
                    console.error("No thread ID available for deletion");
                    toast.error("Unable to delete: No thread selected");
                  }
                }}
                disabled={isProcessing || isDeleting}
                className="text-red-600 opacity-60 transition-opacity hover:text-red-700 hover:opacity-100"
                title="Delete thread"
                type="button"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={isProcessing}>
                  <button className="flex items-center gap-1 text-sm font-semibold opacity-80 transition-opacity hover:opacity-100">
                    <span>
                      {activeThread?.title ??
                        (activeThread
                          ? `Untitled (${new Date(activeThread._creationTime).toLocaleString()})`
                          : "Thread")}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {projectThreads.map((thread) => (
                    <DropdownMenuItem
                      key={thread._id}
                      onClick={() => setActiveThread(thread._id)}
                      className="text-xs"
                    >
                      {thread.title ??
                        `Untitled (${new Date(
                          thread._creationTime,
                        ).toLocaleString()})`}
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
        <div className="flex items-center gap-2">
          {onSwitchToNewAgent && (
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={onSwitchToNewAgent}
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              <span>Switch to New Agent</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700">
                New
              </span>
            </Button>
          )}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={creatingThread || isProcessing}
                  variant="ghost"
                  size="sm"
                  className="h-auto border-0 p-1"
                  onClick={handleCreateNewThread}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New Thread</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <AlertDialog
        open={showDeleteDialog && !!threadToDelete}
        onOpenChange={(open) => {
          console.log("AlertDialog onOpenChange", {
            open,
            threadToDelete,
            showDeleteDialog,
          });
          setShowDeleteDialog(open);
          if (!open) {
            setThreadToDelete(null);
            isDeletingRef.current = false;
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Thread?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this thread? This will permanently
              delete the thread and all its messages.
              <br />
              <br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteThread}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
