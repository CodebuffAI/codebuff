"use client";

import { Button } from "@/vly/components/ui/button";
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
import { Id } from "@/convex/_generated/dataModel";
import { useAction } from "convex/react";
import { Loader, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DeleteDeploymentButtonProps {
  deploymentId: Id<"deployments">;
  domain: string;
  onDeleted?: () => void;
  className?: string;
}

export const DeleteDeploymentButton = ({
  deploymentId,
  domain,
  onDeleted,
  className,
}: DeleteDeploymentButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteDeployment = useAction(api.deployment.deleteDeployment);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteDeployment({ deploymentId });
      toast.success(result.message);
      setIsOpen(false);
      onDeleted?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete deployment";
      toast.error(errorMessage);
      console.error("Delete error:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 ${className}`}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <Loader className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Delete
      </Button>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deployment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the deployment{" "}
              <span className="font-mono font-bold">{domain}</span> and make
              your app inaccessible.
              <br />
              <br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? (
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin" />
                  Deleting...
                </div>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
