"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import FileUpload from "@/components/FileUpload";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSemanticIdentifier?: string;
}

export default function CreateTicketDialog({
  open,
  onOpenChange,
  projectSemanticIdentifier,
}: CreateTicketDialogProps) {
  const project = useQuery(
    api.project.getProjectData,
    projectSemanticIdentifier
      ? { semanticIdentifier: projectSemanticIdentifier }
      : "skip",
  );

  const createTicket = useMutation(api.tickets.create);
  const { hasAccess } = useFeatureAccess("in_app_support");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [attachmentIds, setAttachmentIds] = useState<Id<"_storage">[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?._id) {
      toast.error("Project not found. Please contact support.");
      return;
    }

    // Extra protection: check feature access before calling mutation
    if (!hasAccess) {
      toast.error("In-app Support is not available on your current plan.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createTicket({
        title,
        description,
        projectId: project?._id as Id<"project">,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
      });
      toast.success("Ticket created successfully");
      setTitle("");
      setDescription("");

      setAttachmentIds([]);
      onOpenChange(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create ticket";
      toast.error(errorMessage);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide detailed information about your issue"
              rows={6}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachments">Attachments</Label>
            <FileUpload
              files={attachmentIds}
              onFilesChange={setAttachmentIds}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Ticket"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
