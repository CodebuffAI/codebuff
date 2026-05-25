"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Heart,
  MessageCircle,
  Eye,
  ExternalLink,
  Share2,
  ArrowLeft,
  Trash2,
  Sparkles,
  MoreHorizontal,
  Edit3,
  Check,
  X,
  ThumbsUp,
  EyeOff,
  Globe,
  Lock,
  MousePointer,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { FeaturePaywallDialog } from "@/components/billing/FeaturePaywallDialog";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface ProjectDetailProps {
  postId: Id<"community_posts">;
}

export default function ProjectDetail({ postId }: ProjectDetailProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  const post = useQuery(api.community.getPost, { postId });
  const comments = useQuery(api.community.getComments, { postId });
  const relatedPosts = useQuery(api.community.getRelatedPosts, {
    postId,
    limit: 8,
  });

  const likePost = useMutation(api.community.likePost);
  const unlikePost = useMutation(api.community.unlikePost);
  const addComment = useMutation(api.community.addComment);
  const likeComment = useMutation(api.community.likeComment);
  const deletePost = useMutation(api.community.deletePost);
  const recordView = useMutation(api.community.recordView);
  const updatePost = useMutation(api.community.updatePost);
  const makePostPrivate = useMutation(api.community.makePostPrivate);
  const makePostPublic = useMutation(api.community.makePostPublic);
  const generateUploadUrl = useMutation(api.community.generateUploadUrl);
  const updatePostScreenshot = useMutation(api.community.updatePostScreenshot);

  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [hasRecordedView, setHasRecordedView] = useState(false);
  const [isIframeActive, setIsIframeActive] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const { hasAccess: hasPrivateProjectsAccess } =
    useFeatureAccess("private_projects");

  // Record view on mount - only once per page load
  useEffect(() => {
    if (post && !hasRecordedView) {
      setHasRecordedView(true);
      recordView({ postId }).catch(() => {
        // Silently ignore view recording errors
      });
    }
  }, [post, postId, hasRecordedView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deactivate iframe when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isIframeActive &&
        iframeContainerRef.current &&
        !iframeContainerRef.current.contains(event.target as Node)
      ) {
        setIsIframeActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isIframeActive]);

  const [optimisticLiked, setOptimisticLiked] = useState(false);
  const [optimisticLikes, setOptimisticLikes] = useState(0);

  useEffect(() => {
    if (post) {
      setOptimisticLiked(post.hasLiked);
      setOptimisticLikes(post.likesCount);
      setEditTitle(post.title);
      setEditDescription(post.description);
    }
  }, [post]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDescription && descriptionInputRef.current) {
      descriptionInputRef.current.focus();
    }
  }, [isEditingDescription]);

  const handleLike = async () => {
    if (!post) return;

    try {
      if (optimisticLiked) {
        setOptimisticLiked(false);
        setOptimisticLikes((prev) => Math.max(0, prev - 1));
        await unlikePost({ postId });
      } else {
        setOptimisticLiked(true);
        setOptimisticLikes((prev) => prev + 1);
        await likePost({ postId });
      }
    } catch {
      setOptimisticLiked(post.hasLiked);
      setOptimisticLikes(post.likesCount);
      toast.error("Please sign in to like projects");
    }
  };

  const handleSubmitComment = async () => {
    if (!comment.trim()) return;

    setIsSubmitting(true);
    try {
      await addComment({ postId, content: comment.trim() });
      setComment("");
      toast.success("Comment added!");
    } catch {
      toast.error("Please sign in to comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleDelete = async () => {
    // Check if user has access to private projects (required for deleting listings)
    if (!hasPrivateProjectsAccess) {
      setShowDeleteDialog(false);
      setShowPaywall(true);
      return;
    }

    setIsDeleting(true);
    try {
      await deletePost({ postId });
      toast.success("Project deleted");
      window.location.href = "/community";
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleToggleVisibility = async () => {
    if (!post) return;

    // Check if user is trying to make private and doesn't have access
    if (post.isPublic && !hasPrivateProjectsAccess) {
      setShowPaywall(true);
      return;
    }

    setIsTogglingVisibility(true);
    try {
      if (post.isPublic) {
        await makePostPrivate({ postId });
        toast.success("Project is now private");
      } else {
        await makePostPublic({ postId });
        toast.success("Project is now public");
      }
    } catch {
      toast.error("Failed to update visibility");
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!editTitle.trim() || !post) return;

    setIsSaving(true);
    try {
      await updatePost({ postId, title: editTitle.trim() });
      setIsEditingTitle(false);
      toast.success("Title updated!");
    } catch {
      toast.error("Failed to update title");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!post) return;

    setIsSaving(true);
    try {
      await updatePost({ postId, description: editDescription.trim() });
      setIsEditingDescription(false);
      toast.success("Description updated!");
    } catch {
      toast.error("Failed to update description");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelTitleEdit = () => {
    setEditTitle(post?.title || "");
    setIsEditingTitle(false);
  };

  const handleCancelDescriptionEdit = () => {
    setEditDescription(post?.description || "");
    setIsEditingDescription(false);
  };

  const handleCoverImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploadingCover(true);
    try {
      // Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Upload the file
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Upload failed:", response.status, errorText);
        throw new Error(`Failed to upload image: ${response.status}`);
      }

      const responseData = await response.json();
      const storageId = responseData.storageId;

      if (!storageId) {
        console.error("No storageId in response:", responseData);
        throw new Error("Upload succeeded but no storageId returned");
      }

      // Update the post with the new screenshot
      await updatePostScreenshot({
        postId,
        storageId: storageId as Id<"_storage">,
      });
      toast.success("Cover image updated!");
    } catch (error) {
      console.error("Cover image upload error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload cover image";
      toast.error(errorMessage);
    } finally {
      setIsUploadingCover(false);
      // Reset input
      if (coverImageInputRef.current) {
        coverImageInputRef.current.value = "";
      }
    }
  };

  if (post === undefined) {
    return (
      <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="mb-4 h-8 w-32 bg-gray-100" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="aspect-video w-full rounded-xl bg-gray-100" />
            <Skeleton className="mt-4 h-10 w-3/4 bg-gray-100" />
            <Skeleton className="mt-2 h-20 w-full bg-gray-100" />
          </div>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (post === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-50">
          <Sparkles className="h-10 w-10 text-rose-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          Project Not Found
        </h2>
        <p className="mb-6 text-gray-500">
          This project may have been removed or doesn't exist
        </p>
        <Link href="/community">
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-500">
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-12">
      {/* Back button */}
      <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/community"
          className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Community
        </Link>
      </div>

      {/* Main content - YouTube style layout */}
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-3">
          {/* Main video/content area */}
          <div className="xl:col-span-2">
            {/* Preview iframe with click-to-test overlay */}
            {post.previewUrl && (
              <div
                ref={iframeContainerRef}
                className="relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100 shadow-lg"
              >
                <iframe
                  src={post.previewUrl}
                  className={cn(
                    "absolute inset-0 h-full w-full origin-top-left scale-[0.83333]",
                    isIframeActive
                      ? "pointer-events-auto"
                      : "pointer-events-none",
                  )}
                  style={{ width: "120%", height: "120%" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />

                {/* Click-to-test overlay - shows when iframe is not active */}
                {!isIframeActive && (
                  <div
                    className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center bg-black/10 transition-colors hover:bg-black/5"
                    onClick={() => setIsIframeActive(true)}
                  >
                    <div className="flex items-center gap-3 rounded-lg border border-white/30 bg-white/95 px-4 py-3 shadow-lg">
                      <div className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-gray-100">
                        <MousePointer className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">
                          Click to test
                        </span>
                      </div>
                      <div className="h-6 w-px bg-gray-300"></div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(post.previewUrl, "_blank");
                        }}
                        className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-gray-100"
                      >
                        <ExternalLink className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">
                          Open in new tab
                        </span>
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      Project may take a moment to load.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Title - editable */}
            <div className="mt-4">
              {isEditingTitle && post.isOwner ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={titleInputRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="border-emerald-300 bg-white text-xl font-bold text-gray-900 focus:ring-emerald-200"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") handleCancelTitleEdit();
                    }}
                    disabled={isSaving}
                  />
                  <Button
                    onClick={handleSaveTitle}
                    size="icon"
                    className="h-9 w-9 bg-emerald-600 hover:bg-emerald-500"
                    disabled={isSaving}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleCancelTitleEdit}
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-gray-500 hover:text-gray-900"
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="group flex items-start gap-2">
                  <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                    {post.title}
                  </h1>
                  {post.isOwner && (
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="mt-1 rounded p-1 opacity-0 transition-opacity hover:bg-gray-100 group-hover:opacity-100"
                    >
                      <Edit3 className="h-4 w-4 text-gray-500" />
                    </button>
                  )}
                  {post.featured && (
                    <Badge className="ml-2 border-0 bg-gradient-to-r from-amber-400 to-orange-500 text-white">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Featured
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Stats and actions row */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {post.viewsCount.toLocaleString()} views
                </span>
                <span>•</span>
                <span>
                  {formatDistanceToNow(post.publishedAt, { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleLike}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    optimisticLiked
                      ? "bg-rose-50 text-rose-600"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  )}
                >
                  <ThumbsUp
                    className={cn("h-5 w-5", optimisticLiked && "fill-current")}
                  />
                  {optimisticLikes.toLocaleString()}
                </button>

                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  <Share2 className="h-5 w-5" />
                  Share
                </button>

                {/* Private indicator */}
                {!post.isPublic && (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                    <Lock className="h-4 w-4" />
                    Private
                  </div>
                )}

                {post.isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="border-gray-200 bg-white text-gray-900"
                    >
                      {/* Visibility toggle */}
                      <DropdownMenuItem
                        onClick={handleToggleVisibility}
                        disabled={isTogglingVisibility}
                        className="focus:bg-gray-50"
                      >
                        {post.isPublic ? (
                          <>
                            <EyeOff className="mr-2 h-4 w-4" />
                            <span>Make Private</span>
                            {!hasPrivateProjectsAccess && (
                              <span className="ml-auto rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[10px] font-medium text-purple-700">
                                Business
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <Globe className="mr-2 h-4 w-4" />
                            Make Public (Relist)
                          </>
                        )}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="bg-gray-100" />

                      {/* Delete */}
                      <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-rose-600 focus:bg-rose-50 focus:text-rose-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Delete Listing</span>
                        {!hasPrivateProjectsAccess && (
                          <span className="ml-auto rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[10px] font-medium text-purple-700">
                            Business
                          </span>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Author and description card */}
            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              {/* Author row */}
              <div className="mb-3 flex items-center justify-between">
                <Link
                  href={`/community/profile/${post.userId}`}
                  className="flex items-center gap-3 transition-opacity hover:opacity-80"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={post.userImage} />
                    <AvatarFallback className="bg-emerald-100 text-emerald-600">
                      {post.userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {post.userName}
                      </span>
                      {post.isPaidUser && (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-600"
                        >
                          PRO
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </div>

              {/* Description - editable */}
              {isEditingDescription && post.isOwner ? (
                <div className="mt-3">
                  <Textarea
                    ref={descriptionInputRef}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="min-h-24 border-violet-300 bg-white text-gray-700 focus:ring-violet-200"
                    placeholder="Add a description..."
                    disabled={isSaving}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      onClick={handleCancelDescriptionEdit}
                      variant="ghost"
                      size="sm"
                      className="text-gray-500 hover:text-gray-900"
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveDescription}
                      size="sm"
                      className="bg-violet-600 hover:bg-violet-500"
                      disabled={isSaving}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="group">
                  <p className="whitespace-pre-wrap text-sm text-gray-600">
                    {post.description ||
                      (post.isOwner
                        ? "Click to add a description..."
                        : "No description")}
                  </p>
                  {post.isOwner && (
                    <button
                      onClick={() => setIsEditingDescription(true)}
                      className="mt-2 flex items-center gap-1 text-xs text-violet-600 opacity-0 transition-opacity hover:text-violet-700 group-hover:opacity-100"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit description
                    </button>
                  )}
                </div>
              )}

              {/* Tags */}
              {post.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Cover image upload - owner only */}
              {post.isOwner && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <input
                    ref={coverImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => coverImageInputRef.current?.click()}
                    disabled={isUploadingCover}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploadingCover ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-4 w-4" />
                        {post.screenshotUrl
                          ? "Change cover image"
                          : "Upload cover image"}
                      </>
                    )}
                  </button>
                  {post.screenshotUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      <img
                        src={post.screenshotUrl}
                        alt="Current cover"
                        className="h-12 w-20 rounded object-cover"
                      />
                      <span className="text-xs text-gray-400">
                        Current cover
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Comments Section */}
            <div className="mt-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <MessageCircle className="h-5 w-5" />
                {comments?.length || 0} Comments
              </h2>

              {/* Comment input */}
              <div className="mb-6 flex gap-3">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="bg-violet-100 text-violet-600">
                    ?
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="min-h-10 resize-none border-0 border-b border-gray-200 bg-transparent px-0 text-gray-900 placeholder:text-gray-400 focus:border-violet-400 focus:ring-0"
                    rows={1}
                    onFocus={(e) => (e.target.rows = 3)}
                    onBlur={(e) => {
                      if (!comment) e.target.rows = 1;
                    }}
                  />
                  {comment && (
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        onClick={() => setComment("")}
                        variant="ghost"
                        size="sm"
                        className="text-gray-500 hover:text-gray-900"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSubmitComment}
                        disabled={!comment.trim() || isSubmitting}
                        size="sm"
                        className="bg-violet-600 hover:bg-violet-500"
                      >
                        {isSubmitting ? "Posting..." : "Comment"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Comments list */}
              {comments === undefined ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-lg bg-gray-100" />
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No comments yet. Be the first to share your thoughts!
                </p>
              ) : (
                <div className="space-y-4">
                  {comments.map((c) => (
                    <div key={c._id} className="flex gap-3">
                      <Link href={`/community/profile/${c.userId}`}>
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={c.userImage} />
                          <AvatarFallback className="bg-violet-100 text-sm text-violet-600">
                            {c.userName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/community/profile/${c.userId}`}
                            className="text-sm font-medium text-gray-900 hover:text-violet-600"
                          >
                            {c.userName}
                          </Link>
                          {c.isPaidUser && (
                            <Badge
                              variant="outline"
                              className="h-4 border-violet-200 bg-violet-50 px-1 py-0 text-[10px] text-violet-600"
                            >
                              PRO
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(c.createdAt, {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-700">
                          {c.content}
                        </p>
                        <button
                          onClick={() => likeComment({ commentId: c._id })}
                          className={cn(
                            "mt-2 flex items-center gap-1 text-xs transition-colors",
                            c.hasLiked
                              ? "text-rose-500"
                              : "text-gray-400 hover:text-gray-600",
                          )}
                        >
                          <ThumbsUp
                            className={cn(
                              "h-3.5 w-3.5",
                              c.hasLiked && "fill-current",
                            )}
                          />
                          {c.likesCount > 0 && c.likesCount}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Related projects */}
          <div className="xl:col-span-1">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              More Projects
            </h3>

            {relatedPosts === undefined ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : relatedPosts.length === 0 ? (
              <p className="text-sm text-gray-500">No other projects yet</p>
            ) : (
              <div className="space-y-3">
                {relatedPosts.map((p) => (
                  <Link
                    key={p._id}
                    href={`/community/project/${p._id}`}
                    className="group flex gap-3 rounded-lg p-2 transition-colors hover:bg-gray-50"
                  >
                    {/* Thumbnail */}
                    <div className="relative h-20 w-36 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                      {p.screenshotUrl ? (
                        <img
                          src={p.screenshotUrl}
                          alt={p.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-50 to-fuchsia-50 text-xl">
                          🚀
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-violet-600">
                        {p.title}
                      </h4>
                      <p className="mt-1 text-xs text-gray-500">{p.userName}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                        <span>{p.viewsCount} views</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Heart className="h-3 w-3" />
                          {p.likesCount}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Paywall Dialog */}
      <FeaturePaywallDialog
        featureId="private_projects"
        requiredPlan="Business"
        message="Making projects private and deleting community listings requires Business plan. Upgrade to unlock this feature."
        title="Unlock Private Projects"
        open={showPaywall}
        onOpenChange={setShowPaywall}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="border-gray-200 bg-white text-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              This will remove your project from the community and delete all
              associated comments and likes. Your actual project will NOT be
              deleted and you can re-publish it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {isDeleting ? "Deleting..." : "Delete Listing"}
              {!hasPrivateProjectsAccess && (
                <span className="ml-2 rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[10px] font-medium text-purple-700">
                  Business
                </span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
