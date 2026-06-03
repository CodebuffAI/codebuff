"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Textarea } from "@/vly/components/ui/textarea";
import { Label } from "@/vly/components/ui/label";
import { Badge } from "@/vly/components/ui/badge";
import {
  Check,
  Loader2,
  X,
  ExternalLink,
  AlertCircle,
  UploadCloud,
  Folder,
  Globe2,
} from "lucide-react";
import { cn } from "@/vly/lib/utils";

interface PublishProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedProjectId?: Id<"project">;
}

const SUGGESTED_TAGS = [
  "AI",
  "Dashboard",
  "E-commerce",
  "Portfolio",
  "SaaS",
  "Landing Page",
  "Blog",
  "Game",
  "Productivity",
  "Social",
  "Education",
  "Finance",
  "Health",
  "Music",
  "Art",
];

export default function PublishProjectDialog({
  open,
  onOpenChange,
  preselectedProjectId,
}: PublishProjectDialogProps) {
  const [step, setStep] = useState<"select" | "details" | "success">(
    preselectedProjectId ? "details" : "select",
  );
  const [selectedProject, setSelectedProject] = useState<Id<"project"> | null>(
    preselectedProjectId || null,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedPostId, setPublishedPostId] =
    useState<Id<"community_posts"> | null>(null);

  const projects = useQuery(api.community.getUnpublishedProjects);
  const publishProject = useMutation(api.community.publishProject);

  const selectedProjectData = projects?.find((p) => p._id === selectedProject);

  const handleSelectProject = (projectId: Id<"project">) => {
    const project = projects?.find((p) => p._id === projectId);
    if (!project?.hasDeployment) {
      toast.error(
        "Please deploy your project first before publishing to community",
      );
      return;
    }
    setSelectedProject(projectId);
    setTitle(project?.name || project?.semanticIdentifier || "");
    setStep("details");
  };

  const handleAddTag = (tag: string) => {
    if (tags.length >= 5) {
      toast.error("Maximum 5 tags allowed");
      return;
    }
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAddCustomTag = () => {
    if (customTag.trim()) {
      handleAddTag(customTag.trim());
      setCustomTag("");
    }
  };

  const handlePublish = async () => {
    if (!selectedProject || !title.trim() || !description.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsPublishing(true);
    try {
      const postId = await publishProject({
        projectId: selectedProject,
        title: title.trim(),
        description: description.trim(),
        tags,
      });

      setPublishedPostId(postId);
      setStep("success");
      toast.success("Project published successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to publish project";
      if (errorMessage.includes("deployed")) {
        toast.error(
          "Please deploy your project first before publishing to community",
        );
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation
    setTimeout(() => {
      setStep(preselectedProjectId ? "details" : "select");
      setSelectedProject(preselectedProjectId || null);
      setTitle("");
      setDescription("");
      setTags([]);
      setCustomTag("");
      setPublishedPostId(null);
    }, 200);
  };

  const handleViewPost = () => {
    if (publishedPostId) {
      window.location.href = `/web/community/project/${publishedPostId}`;
    }
  };

  // Use deployed URL for preview if available
  const previewUrl =
    selectedProjectData?.deployedUrl || selectedProjectData?.previewUrl;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card text-card-foreground sm:max-w-xl">
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <UploadCloud className="h-5 w-5 text-primary" />
                Publish project
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Select a deployed project to share with the Freebuff community
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              {!projects ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-border/60 bg-muted/25">
                    <Folder className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium">No projects yet</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Create a project first to share it with the community
                  </p>
                  <Button
                    onClick={() => (window.location.href = "/web/dashboard")}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Go to dashboard
                  </Button>
                </div>
              ) : (
                projects.map((project) => (
                  <button
                    key={project._id}
                    onClick={() => handleSelectProject(project._id)}
                    disabled={project.isPublished}
                    className={cn(
                      "group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all",
                      project.isPublished
                        ? "cursor-not-allowed border-border/40 bg-muted/15 opacity-70"
                        : !project.hasDeployment
                          ? "border-amber-400/35 bg-amber-500/10"
                          : "border-border/60 bg-background hover:border-primary/45 hover:bg-muted/25",
                    )}
                  >
                    {/* Preview thumbnail */}
                    <div className="relative flex h-16 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/45">
                      <Folder className="h-6 w-6 text-muted-foreground" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate font-medium text-foreground group-hover:text-primary">
                          {project.name || project.semanticIdentifier}
                        </h4>
                        {project.isPublished && (
                          <Badge
                            variant="outline"
                            className="border-emerald-400/35 bg-emerald-500/15 text-emerald-300"
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Published
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-sm text-gray-500">
                        {project.semanticIdentifier}
                      </p>
                      {!project.hasDeployment && !project.isPublished && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          Deploy first to publish
                        </div>
                      )}
                      {project.hasDeployment &&
                        !project.isPublished &&
                        project.deployedUrl && (
                          <p className="mt-1 truncate text-xs text-primary">
                            {project.deployedUrl.replace("https://", "")}
                          </p>
                        )}
                    </div>

                    {/* Open project button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(
                          `/web/project/${project.semanticIdentifier}`,
                          "_blank",
                        );
                      }}
                      className="flex-shrink-0 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="mr-1 inline h-3 w-3" />
                      Open
                    </button>

                    {!project.isPublished && project.hasDeployment && (
                      <div className="text-muted-foreground transition-colors group-hover:text-primary">
                        <UploadCloud className="h-5 w-5" />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <UploadCloud className="h-5 w-5 text-primary" />
                Project Details
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Add a title, description, and tags to help others discover your
                project
              </DialogDescription>
            </DialogHeader>

            {/* Preview - show deployed URL link */}
            {previewUrl && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background">
                    <Globe2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Live Site
                    </p>
                    <p className="max-w-xs truncate text-xs text-muted-foreground">
                      {previewUrl}
                    </p>
                  </div>
                </div>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="title" className="text-foreground">
                  Title <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Awesome Project"
                  className="mt-1.5 border-border/60 bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
                  maxLength={100}
                />
              </div>

              <div>
                <Label htmlFor="description" className="text-foreground">
                  Description <span className="text-rose-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what your project does, the technologies used, and what makes it special..."
                  className="mt-1.5 min-h-24 border-border/60 bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {description.length}/500 characters
                </p>
              </div>

              <div>
                <Label className="text-foreground">
                  Tags <span className="text-muted-foreground">(up to 5)</span>
                </Label>

                {/* Selected tags */}
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="border-primary/35 bg-primary/10 text-primary"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1.5 hover:text-primary/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Custom tag input */}
                <div className="mt-2 flex gap-2">
                  <Input
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCustomTag()}
                    placeholder="Add custom tag..."
                    className="border-border/60 bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
                    maxLength={20}
                  />
                  <Button
                    onClick={handleAddCustomTag}
                    variant="outline"
                    size="sm"
                    className="border-border/60 text-foreground hover:bg-muted disabled:border-border/60 disabled:bg-muted/25 disabled:text-muted-foreground"
                    disabled={!customTag.trim() || tags.length >= 5}
                  >
                    Add
                  </Button>
                </div>

                {/* Suggested tags */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.filter((tag) => !tags.includes(tag)).map(
                    (tag) => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        disabled={tags.length >= 5}
                        className="rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:bg-muted/10 disabled:text-muted-foreground/70"
                      >
                        {tag}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                onClick={() => setStep("select")}
                variant="outline"
                className="flex-1 border-border/60 text-foreground hover:bg-muted disabled:bg-muted/20 disabled:text-muted-foreground"
                disabled={!!preselectedProjectId}
              >
                Back
              </Button>
              <Button
                onClick={handlePublish}
                disabled={isPublishing || !title.trim() || !description.trim()}
                className="flex-1 gap-2 bg-primary text-primary-foreground shadow-none hover:bg-primary/90 disabled:border disabled:border-border/60 disabled:bg-muted/30 disabled:text-muted-foreground"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Publish
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg border border-emerald-400/35 bg-emerald-500/15">
              <Check className="h-8 w-8 text-emerald-300" />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-foreground">
              Project published
            </h3>
            <p className="mb-6 text-muted-foreground">
              Your project is now live on the Freebuff Community
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleClose}
                variant="outline"
                className="border-border/60 text-foreground hover:bg-muted"
              >
                Close
              </Button>
              <Button
                onClick={handleViewPost}
                className="gap-2 bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
              >
                View Project
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
