"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, Plus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Integration {
  _id: Id<"integration">;
  title: string;
  description: string;
  tags: string[];
  type: string;
  public: boolean;
  approval_status?: "pending" | "approved" | "rejected";
  documentation_urls: string[];
  llm_instructions: string;
  user_instructions: string;
  human_added_notes?: string;
  cover_image?: string;
  env_variables?: Array<{
    id: string;
    description: string;
  }>;
  creator?: Id<"project">;
  last_updated: number;
  _creationTime: number;
}

interface IntegrationApprovalDialogProps {
  integration: Integration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

export function IntegrationApprovalDialog({
  integration,
  open,
  onOpenChange,
  onUpdate,
}: IntegrationApprovalDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [documentationUrls, setDocumentationUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [llmInstructions, setLlmInstructions] = useState("");
  const [userInstructions, setUserInstructions] = useState("");
  const [humanAddedNotes, setHumanAddedNotes] = useState("");
  const [envVariables, setEnvVariables] = useState<
    Array<{ id: string; description: string }>
  >([]);
  const [approvalStatus, setApprovalStatus] = useState<
    "pending" | "approved" | "rejected"
  >("pending");

  // Mutations
  const updateIntegration = useMutation(api.integrations.updateIntegration);
  const deleteIntegration = useMutation(api.integrations.deleteIntegration);

  // Initialize form when integration changes
  useEffect(() => {
    if (integration) {
      setTitle(integration.title);
      setDescription(integration.description);
      setTags(integration.tags || []);
      setDocumentationUrls(integration.documentation_urls || []);
      setLlmInstructions(integration.llm_instructions || "");
      setUserInstructions(integration.user_instructions || "");
      setHumanAddedNotes(integration.human_added_notes || "");
      setEnvVariables(integration.env_variables || []);
      setApprovalStatus(integration.approval_status || "pending");
    }
  }, [integration]);

  // Memoized handlers to prevent unnecessary re-renders
  const handleSave = useCallback(async () => {
    if (!integration) return;

    try {
      setIsSaving(true);

      await updateIntegration({
        integrationId: integration._id,
        title,
        description,
        tags,
        documentation_urls: documentationUrls,
        llm_instructions: llmInstructions,
        user_instructions: userInstructions,
        human_added_notes: humanAddedNotes,
        env_variables: envVariables,
        approval_status: approvalStatus,
      });

      toast({
        title: "Changes saved",
        description: `Integration updated successfully. Status: ${approvalStatus}`,
      });
      onUpdate?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    integration,
    updateIntegration,
    title,
    description,
    tags,
    documentationUrls,
    llmInstructions,
    userInstructions,
    humanAddedNotes,
    envVariables,
    approvalStatus,
    toast,
    onUpdate,
    onOpenChange,
  ]);

  const handleCancel = useCallback(() => {
    if (integration) {
      setTitle(integration.title);
      setDescription(integration.description);
      setTags(integration.tags || []);
      setDocumentationUrls(integration.documentation_urls || []);
      setLlmInstructions(integration.llm_instructions || "");
      setUserInstructions(integration.user_instructions || "");
      setHumanAddedNotes(integration.human_added_notes || "");
      setEnvVariables(integration.env_variables || []);
      setApprovalStatus(integration.approval_status || "pending");
    }
    onOpenChange(false);
  }, [integration, onOpenChange]);

  const handleDelete = useCallback(async () => {
    if (!integration) return;
    if (!confirm("Are you sure you want to delete this integration?")) return;

    try {
      setIsSaving(true);
      await deleteIntegration({ integrationId: integration._id });
      toast({
        title: "Integration deleted",
        description: "The integration has been permanently deleted.",
      });
      onUpdate?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete integration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [integration, deleteIntegration, toast, onUpdate, onOpenChange]);

  const addTag = useCallback(() => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const removeTag = useCallback(
    (tag: string) => {
      setTags(tags.filter((t) => t !== tag));
    },
    [tags],
  );

  const addUrl = useCallback(() => {
    if (urlInput.trim() && !documentationUrls.includes(urlInput.trim())) {
      setDocumentationUrls([...documentationUrls, urlInput.trim()]);
      setUrlInput("");
    }
  }, [urlInput, documentationUrls]);

  const removeUrl = useCallback(
    (url: string) => {
      setDocumentationUrls(documentationUrls.filter((u) => u !== url));
    },
    [documentationUrls],
  );

  const addEnvVariable = useCallback(() => {
    setEnvVariables([...envVariables, { id: "", description: "" }]);
  }, [envVariables]);

  const updateEnvVariable = useCallback(
    (index: number, field: "id" | "description", value: string) => {
      const updated = [...envVariables];
      updated[index][field] = value;
      setEnvVariables(updated);
    },
    [envVariables],
  );

  const removeEnvVariable = useCallback(
    (index: number) => {
      setEnvVariables(envVariables.filter((_, i) => i !== index));
    },
    [envVariables],
  );

  if (!integration) return null;

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle>Review & Edit Integration</DialogTitle>
              <div className="flex items-center gap-2">
                <Label className="text-sm font-normal">Status:</Label>
                <Select
                  value={approvalStatus}
                  onValueChange={(value: "pending" | "approved" | "rejected") =>
                    setApprovalStatus(value)
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        Pending
                      </span>
                    </SelectItem>
                    <SelectItem value="approved">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Approved
                      </span>
                    </SelectItem>
                    <SelectItem value="rejected">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Rejected
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogDescription>
            Edit integration details and update status. Changes are saved when
            you click Save, Approve, or Reject.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-200px)] pr-4">
          <div className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              <div>
                <div className="mb-2 flex gap-2">
                  <Input
                    placeholder="Add tag"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" onClick={addTag} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeTag(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Environment Variables */}
            <div className="space-y-2">
              <Label>Environment Variables</Label>
              <div className="space-y-2">
                {envVariables.map((envVar, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Input
                      placeholder="Variable name (e.g., API_KEY)"
                      value={envVar.id}
                      onChange={(e) =>
                        updateEnvVariable(index, "id", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Description"
                      value={envVar.description}
                      onChange={(e) =>
                        updateEnvVariable(index, "description", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEnvVariable(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEnvVariable}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Variable
                </Button>
              </div>
            </div>

            {/* Documentation URLs */}
            <div className="space-y-2">
              <Label>Documentation URLs</Label>
              <div>
                <div className="mb-2 flex gap-2">
                  <Input
                    placeholder="Add URL"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addUrl();
                      }
                    }}
                  />
                  <Button type="button" onClick={addUrl} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {documentationUrls.map((url) => (
                    <div key={url} className="flex items-center gap-2 text-sm">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate text-blue-600 hover:underline"
                      >
                        {url}
                      </a>
                      <X
                        className="h-4 w-4 cursor-pointer"
                        onClick={() => removeUrl(url)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* User Instructions */}
            <div className="space-y-2">
              <Label htmlFor="user_instructions">User Instructions</Label>
              <Textarea
                id="user_instructions"
                value={userInstructions}
                onChange={(e) => setUserInstructions(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            {/* LLM Instructions */}
            <div className="space-y-2">
              <Label htmlFor="llm_instructions">LLM Instructions</Label>
              <Textarea
                id="llm_instructions"
                value={llmInstructions}
                onChange={(e) => setLlmInstructions(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>

            {/* Admin Notes */}
            <div className="space-y-2">
              <Label htmlFor="human_added_notes">Admin Notes (Optional)</Label>
              <Textarea
                id="human_added_notes"
                value={humanAddedNotes}
                onChange={(e) => setHumanAddedNotes(e.target.value)}
                rows={3}
                placeholder="Add any additional notes or context..."
              />
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label>Type</Label>
                <p className="text-muted-foreground">{integration.type}</p>
              </div>
              <div>
                <Label>Public</Label>
                <p className="text-muted-foreground">
                  {integration.public ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <Label>Created</Label>
                <p className="text-muted-foreground">
                  {new Date(integration._creationTime).toLocaleString()}
                </p>
              </div>
              <div>
                <Label>Last Updated</Label>
                <p className="text-muted-foreground">
                  {new Date(integration.last_updated).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isSaving}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
