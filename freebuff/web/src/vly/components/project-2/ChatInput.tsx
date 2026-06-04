import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { AgentMode } from "@/convex/utils/registry_validators";
import { FunctionReturnType } from "convex/server";
import { getImageUrl } from "@/vly/lib/image-utils";
import {
  ArrowUp,
  Loader,
  ImageIcon,
  X,
  Download,
  FileText,
  File,
  AlertTriangle,
  GitBranch,
  Image as ImageIconLucide,
  Package,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { QueuedMessage } from "@/vly/hooks/useMessageQueue";
import React, { useRef, useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { Button } from "@/vly/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/vly/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";
import { ReactAction } from "convex/react";
import EnvVarsView from "./EnvVarsView";
import MentionsEditor, {
  MentionProvider,
  MentionItem,
  serializeToText,
} from "@/vly/components/MentionsEditor";
import { useAssetsCache } from "@/vly/hooks/useAssetsCache";
import { useChatStorageContext } from "@/vly/contexts/ChatStorageContext";
import imageCompression from "browser-image-compression";
import { AgentModeSelector } from "./AgentModeSelector";
import { ContextLengthSelector, ContextLength } from "./ContextLengthSelector";
import { DEFAULT_CONTEXT_LENGTH } from "@/vly/lib/coding-agent/contextLengthPresets";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface ChatInputProps {
  isProcessing: boolean;
  handleSendMessage: (
    message: string,
    images: Id<"_storage">[],
  ) => Promise<boolean>;
  terminateThread: ReactAction<any>;
  projectSemanticIdentifier: string;
  isSelectingElement: boolean;
  setIsSelectingElement: (v: boolean) => void;
  projectId?: Id<"project">;
  onOpenDivergenceDialog?: () => void;
  queuedMessages?: QueuedMessage[];
  onRemoveQueuedMessage?: (messageId: string) => void;
  // Optional external selectedNodeInfo management
  externalSelectedNodeInfo?: {
    selector: string;
    reactHierarchyFormatted: string;
    image?: string;
  } | null;
  onSelectedNodeInfoChange?: (
    nodeInfo: {
      selector: string;
      reactHierarchyFormatted: string;
      image?: string;
    } | null,
  ) => void;
  // Callback to notify parent if user has input (for hiding suggestions)
  onUserInputChange?: (hasInput: boolean) => void;
  // Agent mode selection
  selectedAgentMode?: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  // Context length selection (Freebuff agent only)
  selectedContextLength?: ContextLength;
  onContextLengthChange?: (length: ContextLength) => void;
  syncStatus?: FunctionReturnType<
    typeof api.github.repositories.getProjectSyncStatus
  >;
  activeEntryPointId?: Id<"entry_point"> | null;
  // Message to restore to input (used when canceling a message)
  restoreMessage?: string | null;
  // Compact mode for agent chat
  compactMode?: boolean;
}

// Add new interface for pending images
interface PendingImage {
  file: File;
  preview: string;
  id: string;
  isCompressing?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = React.memo(
  ({
    isProcessing,
    handleSendMessage,
    projectSemanticIdentifier,
    terminateThread,
    isSelectingElement,
    setIsSelectingElement,
    onOpenDivergenceDialog,
    queuedMessages = [],
    onRemoveQueuedMessage,
    externalSelectedNodeInfo,
    onUserInputChange,
    selectedAgentMode = "POWERFUL",
    onAgentModeChange,
    selectedContextLength = DEFAULT_CONTEXT_LENGTH,
    onContextLengthChange,
    syncStatus,
    activeEntryPointId,
    restoreMessage,
    compactMode = false,
  }) => {
    // Use chat storage context for persistent state
    const {
      editorValue,
      uploadedImages,
      selection,
      selectedNodeInfo: internalSelectedNodeInfo,
      isHydrated,
      updateEditorValue,
      updateSelection,
      clearAllStorage,
    } = useChatStorageContext();

    // Use external selectedNodeInfo if provided, otherwise use internal
    const selectedNodeInfo =
      externalSelectedNodeInfo !== undefined
        ? externalSelectedNodeInfo
        : internalSelectedNodeInfo;

    // Add state for pending (not yet uploaded) images
    const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [showEnvVarsDialog, setShowEnvVarsDialog] = useState(false);
    const [editorKey, setEditorKey] = useState(0);
    const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const { resolvedTheme } = useTheme();
    const isProjectDark = resolvedTheme === "dark";

    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);
    const isSubmittingRef = useRef(false);
    const editorContainerRef = useRef<HTMLDivElement>(null);

    // Check for user input and notify parent
    useEffect(() => {
      const messageText = editorValue
        ? serializeToText(editorValue).trim()
        : "";
      const hasUserInput = Boolean(
        messageText.length > 0 ||
          uploadedImages.length > 0 ||
          pendingImages.length > 0 ||
          selectedNodeInfo,
      );

      onUserInputChange?.(hasUserInput);
    }, [
      editorValue,
      uploadedImages,
      pendingImages,
      selectedNodeInfo,
      onUserInputChange,
    ]);

    // Restore message when restoreMessage prop changes
    useEffect(() => {
      if (restoreMessage !== null && restoreMessage !== undefined) {
        // Convert text to Slate Descendant format with proper spacing
        const lines = restoreMessage.split("\n");
        const newValue =
          lines.length > 0
            ? lines.map((line) => ({
                type: "paragraph" as const,
                children: [{ text: line }],
              }))
            : [
                {
                  type: "paragraph" as const,
                  children: [{ text: restoreMessage }],
                },
              ];

        // Ensure at least one paragraph
        if (newValue.length === 0) {
          newValue.push({
            type: "paragraph" as const,
            children: [{ text: "" }],
          });
        }

        // Replace entire editor value
        updateEditorValue(newValue);

        // Reset editor key to force re-render with new content
        setEditorKey((prev) => prev + 1);
      }
    }, [restoreMessage, updateEditorValue]);

    // Track focus state of the editor
    useEffect(() => {
      const container = editorContainerRef.current;
      if (!container) return;

      const handleFocus = () => {
        setIsInputFocused(true);
      };

      const handleBlur = (e: FocusEvent) => {
        // Check if focus is moving to another element within the container
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (relatedTarget && container.contains(relatedTarget)) {
          return; // Focus is still within the container, don't hide indicator
        }
        setIsInputFocused(false);
      };

      // Listen for focus events on the editor element
      const editorElement = container.querySelector(
        "[data-slate-editor]",
      ) as HTMLElement;
      if (editorElement) {
        // Check if editor is already focused
        if (document.activeElement === editorElement) {
          setIsInputFocused(true);
        }

        editorElement.addEventListener("focus", handleFocus);
        editorElement.addEventListener("blur", handleBlur);
      }

      // Also listen on the container for clicks that focus the editor
      container.addEventListener("focusin", handleFocus);
      container.addEventListener("focusout", handleBlur);

      return () => {
        if (editorElement) {
          editorElement.removeEventListener("focus", handleFocus);
          editorElement.removeEventListener("blur", handleBlur);
        }
        container.removeEventListener("focusin", handleFocus);
        container.removeEventListener("focusout", handleBlur);
      };
    }, [editorKey]);

    const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
    const _deleteImage = useMutation(api.messages.deleteImage);
    void _deleteImage; // Available for future image deletion needs
    const refinePrompt = useAction(
      api.coding_agent.helpers.refinePrompt.refinePrompt,
    );
    const [isRefining, setIsRefining] = useState(false);

    // Load assets
    const { assets, isLoading: assetsLoading } = useAssetsCache(
      projectSemanticIdentifier,
    );

    // Load integrations
    const getProjectIntegrations = useQuery(
      api.integrations.getProjectIntegrations,
      {
        semanticIdentifier: projectSemanticIdentifier,
      },
    );

    // syncStatus is now passed as a prop from parent to avoid duplicate queries

    // Compress image helper
    const compressImage = async (file: File): Promise<File> => {
      const options = {
        maxSizeMB: 2, // Maximum size in MB
        maxWidthOrHeight: 1920, // Maximum dimension
        useWebWorker: true, // Use web worker for non-blocking compression
      };

      try {
        const compressedFile = await imageCompression(file, options);
        return compressedFile;
      } catch (error) {
        console.error("Image compression failed:", error);
        // Return original file if compression fails
        return file;
      }
    };

    // Convert assets to MentionItem format
    const assetItems: MentionItem[] = useMemo(() => {
      return assets.map((asset) => ({
        id: asset.id,
        name: asset.fileName,
        description: asset.description,
        type: "asset",
        icon: getFileIcon(asset.fileType),
        iconColor: getFileIconColor(asset.fileType),
        metadata: {
          originalType: "asset",
          fileType: asset.fileType,
          fileSize: asset.fileSize,
          uploadedAt: asset.uploadedAt,
        },
      }));
    }, [assets]);

    // Convert integrations to MentionItem format
    const integrationItems: MentionItem[] = useMemo(() => {
      if (!getProjectIntegrations) return [];
      return getProjectIntegrations.map((integration) => ({
        id: integration._id,
        name: integration.title,
        description: integration.description,
        type: "integration",
        icon: Package,
        iconColor: "text-purple-500",
        metadata: {
          originalType: "integration",
          reference_id: integration.reference_id,
          recommended: integration.recommended,
          cover_image: integration.cover_image,
        },
      }));
    }, [getProjectIntegrations]);

    // Combine all items under a single @ trigger
    const allItems: MentionItem[] = useMemo(() => {
      return [...assetItems, ...integrationItems];
    }, [assetItems, integrationItems]);

    // Define mention providers - using only @ trigger for both assets and integrations
    const providers: MentionProvider[] = [
      {
        trigger: "@",
        type: "mention", // Generic type since we're combining both
        items: allItems,
        isLoading: assetsLoading,
        placeholder: "Loading...",
        emptyMessage: "No assets or integrations found",
        color: "purple",
      },
    ];

    const handleMentionSelect = (item: MentionItem, type: string) => {
      console.log(`Selected ${type}:`, item);
    };

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFilesUpload(files);
      }
    };

    const handleFilesUpload = async (files: FileList) => {
      try {
        // Process images one by one
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) {
            alert("Please select only image files");
            continue;
          }

          const id = `${Date.now()}-${Math.random()}`;

          // Add placeholder immediately with loading state
          setPendingImages((prev) => [
            ...prev,
            {
              file,
              preview: "",
              id,
              isCompressing: true,
            },
          ]);

          // Compress in background
          compressImage(file).then((compressedFile) => {
            const preview = URL.createObjectURL(compressedFile);
            setPendingImages((prev) =>
              prev.map((img) =>
                img.id === id
                  ? {
                      ...img,
                      file: compressedFile,
                      preview,
                      isCompressing: false,
                    }
                  : img,
              ),
            );
          });
        }
      } catch (error) {
        console.error("Image processing failed:", error);
        alert("Image processing failed. Please try again.");
      }
    };

    const handleFileSelect = async (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const files = event.target.files;
      if (!files) return;

      await handleFilesUpload(files);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    const removePendingImage = (idToRemove: string) => {
      setPendingImages((prev) => {
        const imageToRemove = prev.find((img) => img.id === idToRemove);
        if (imageToRemove) {
          // Revoke the preview URL to free memory
          URL.revokeObjectURL(imageToRemove.preview);
        }
        return prev.filter((img) => img.id !== idToRemove);
      });
    };

    const handleRefinePrompt = async () => {
      const messageText = editorValue ? serializeToText(editorValue) : "";

      if (!messageText.trim()) {
        return;
      }

      setIsRefining(true);
      try {
        const refinedPrompt = await refinePrompt({
          projectSemanticIdentifier,
          currentPrompt: messageText.trim(),
          entryPointId: activeEntryPointId || undefined,
        });

        // Update the editor with the refined prompt
        // Convert text to Slate Descendant format with proper spacing
        if (refinedPrompt) {
          // Split by newlines and create paragraphs
          // Preserve empty lines as empty paragraphs for proper spacing
          const lines = refinedPrompt.split("\n");
          const newValue =
            lines.length > 0
              ? lines.map((line) => ({
                  type: "paragraph" as const,
                  children: [{ text: line }],
                }))
              : [
                  {
                    type: "paragraph" as const,
                    children: [{ text: refinedPrompt }],
                  },
                ];

          // Ensure at least one paragraph
          if (newValue.length === 0) {
            newValue.push({
              type: "paragraph" as const,
              children: [{ text: "" }],
            });
          }

          // Replace entire editor value
          updateEditorValue(newValue);

          // Reset editor key to force re-render with new content
          setEditorKey((prev) => prev + 1);

          // Scroll to bottom to show the refined content
          setTimeout(() => {
            const editorElement = document.querySelector("[data-slate-editor]");
            if (editorElement) {
              editorElement.scrollTop = editorElement.scrollHeight;
            }
          }, 100);
        }
      } catch (error: any) {
        console.error("Failed to refine prompt:", error);
        // Show toast for rate limit errors
        const errorMessage =
          error?.message || "Failed to refine prompt. Please try again.";
        toast.error(errorMessage, {
          duration: 5000,
        });
      } finally {
        setIsRefining(false);
      }
    };

    const handleSubmit = async () => {
      // Prevent concurrent submissions (e.g., rapid button clicks)
      if (isSubmittingRef.current) {
        return;
      }

      const messageText = editorValue ? serializeToText(editorValue) : "";

      if (
        !messageText.trim() &&
        uploadedImages.length === 0 &&
        pendingImages.length === 0
      )
        return;

      // Mark as submitting
      isSubmittingRef.current = true;

      try {
        // Upload pending images before sending message
        const newImageIds: Id<"_storage">[] = [];

        if (pendingImages.length > 0) {
          setIsUploading(true);
          try {
            for (const pendingImage of pendingImages) {
              const postUrl = await generateUploadUrl();

              const result = await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": pendingImage.file.type },
                body: pendingImage.file,
              });

              const { storageId } = await result.json();
              newImageIds.push(storageId as Id<"_storage">);

              // Clean up preview URL
              URL.revokeObjectURL(pendingImage.preview);
            }
          } catch (error) {
            console.error("Upload failed:", error);
            alert("Upload failed. Please try again.");
            setIsUploading(false);
            return;
          } finally {
            setIsUploading(false);
          }
        }

        // Combine already uploaded images with newly uploaded ones
        const allImageIds = [...uploadedImages, ...newImageIds];

        // Send message with all images - handleSendMessage now returns a success boolean
        const success = await handleSendMessage(messageText, allImageIds);

        // Only clear the input if the message was sent successfully
        if (success) {
          // Clear the editor, images, and pending images using storage hook
          clearAllStorage();
          setPendingImages([]);
          setEditorKey((prev) => prev + 1);
        } else {
          console.log("❌ Message failed to send, keeping input text");
        }
      } finally {
        // Reset submitting flag
        isSubmittingRef.current = false;
      }
    };

    // Check if there's a sync conflict that should lock the chat
    const hasConflict =
      syncStatus?.sync_status === "conflict" ||
      syncStatus?.sync_status === "error";
    const isLocked = hasConflict && onOpenDivergenceDialog;

    // Don't render the full interface until hydrated to prevent layout shifts
    if (!isHydrated) {
      return (
        <div className="relative mx-4 mb-4 mt-2 flex-shrink-0">
          <div className="rounded-xl bg-muted/40">
            <div className="relative min-h-[120px] animate-pulse rounded-xl bg-muted/50" />
          </div>
        </div>
      );
    }

    return (
      <TooltipProvider>
        <div className="relative mx-4 mb-4 mt-2 flex-shrink-0">
          {/* Message Queue Indicator */}
          {queuedMessages.length > 0 && (
            <div className="mb-2 rounded-xl bg-muted/40 px-3 py-2 transition-all duration-300 ease-in-out">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 animate-pulse text-gray-500 dark:text-zinc-300" />
                  <span className="font-medium text-gray-600 dark:text-zinc-200">
                    {queuedMessages.length} message
                    {queuedMessages.length > 1 ? "s" : ""} queued
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQueueCollapsed(!isQueueCollapsed)}
                  className="opacity-60 transition-all hover:opacity-100"
                  title={isQueueCollapsed ? "Show queue" : "Hide queue"}
                >
                  <div className="transition-transform duration-300 ease-in-out">
                    {isQueueCollapsed ? (
                      <ChevronUp className="h-3.5 w-3.5 text-gray-500 dark:text-zinc-300" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-zinc-300" />
                    )}
                  </div>
                </button>
              </div>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isQueueCollapsed
                    ? "max-h-0 opacity-0"
                    : "mt-2 max-h-40 opacity-100"
                }`}
              >
                <div className="space-y-1">
                  {queuedMessages.slice(0, 3).map((msg) => (
                    <div
                      key={msg.id}
                      className="group flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1 text-[11px] text-gray-700 transition-all hover:bg-white dark:bg-[#282828] dark:text-zinc-200 dark:hover:bg-[#4a4a4a]"
                    >
                      <span className="flex-1 truncate" title={msg.message}>
                        {msg.message}
                      </span>
                      {onRemoveQueuedMessage && (
                        <button
                          type="button"
                          onClick={() => onRemoveQueuedMessage(msg.id)}
                          className="ml-1 opacity-40 transition-all hover:opacity-100"
                          title="Remove from queue"
                        >
                          <X className="h-3 w-3 text-gray-500 hover:text-gray-700 dark:text-zinc-300 dark:hover:text-zinc-100" />
                        </button>
                      )}
                    </div>
                  ))}
                  {queuedMessages.length > 3 && (
                    <div className="pl-2 text-[10px] text-gray-500 dark:text-zinc-300">
                      +{queuedMessages.length - 3} more message
                      {queuedMessages.length - 3 > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Conflict Resolution UI - Replaces input when locked */}
          {isLocked ? (
            <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-amber-900">
                    {syncStatus?.sync_status === "conflict"
                      ? "Project Changes Need Your Attention"
                      : "Connection Issue with GitHub"}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-amber-800">
                    {syncStatus?.sync_status === "conflict"
                      ? "Someone else made changes to your project on GitHub. We need to merge these changes safely before you can continue building."
                      : "We're having trouble connecting to your GitHub repository. Let's check your sync settings."}
                  </p>
                  <div className="mt-4 space-y-3">
                    <Button
                      onClick={onOpenDivergenceDialog}
                      size="sm"
                      className="h-9 bg-amber-600 text-sm font-medium text-white hover:bg-amber-700"
                    >
                      <GitBranch className="mr-2 h-4 w-4" />
                      {syncStatus?.sync_status === "conflict"
                        ? "Review & Merge Changes"
                        : "Check Connection"}
                    </Button>
                    <div className="text-xs text-amber-600">
                      💡 Don't worry - your work is safe
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div className="space-y-3">
                {/* Display pending images preview */}
                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingImages.map((pendingImage) => (
                      <PendingImagePreview
                        key={pendingImage.id}
                        pendingImage={pendingImage}
                        onRemove={() => removePendingImage(pendingImage.id)}
                      />
                    ))}
                  </div>
                )}

                <div
                  ref={dropZoneRef}
                  className={`relative rounded-xl transition-all duration-200 focus-within:shadow-none focus-within:outline-none focus-within:ring-1 focus-within:ring-border/60 focus-within:ring-offset-0 ${
                    isDragOver
                      ? "bg-primary/10 ring-1 ring-primary"
                      : "bg-muted/40"
                  }`}
                  style={{
                    boxShadow: "none",
                    outline: "none",
                    animation: "none",
                  }}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {isDragOver && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10">
                      <div className="flex items-center gap-2 font-medium text-primary">
                        <ImageIcon className="h-5 w-5" />
                        Drop images here
                      </div>
                    </div>
                  )}

                  <div
                    ref={editorContainerRef}
                    className={`relative overflow-y-auto ${
                      compactMode
                        ? "max-h-[300px] min-h-[40px]"
                        : "max-h-[400px] min-h-[120px]"
                    }`}
                    onClick={(e) => {
                      // Focus the editor when clicking on the container, but not on interactive elements
                      const target = e.target as HTMLElement;
                      if (
                        target.tagName === "BUTTON" ||
                        target.closest("button") ||
                        target.closest("[role='button']")
                      ) {
                        return;
                      }
                      const editorElement = e.currentTarget.querySelector(
                        "[data-slate-editor]",
                      ) as HTMLElement;
                      if (editorElement) {
                        editorElement.focus();
                      }
                    }}
                    style={{ cursor: "text" }}
                    onPaste={async (e: React.ClipboardEvent) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;

                      const imageFiles: File[] = [];

                      for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        if (item.type.startsWith("image/")) {
                          const file = item.getAsFile();
                          if (file) {
                            imageFiles.push(file);
                          }
                        }
                      }

                      if (imageFiles.length > 0) {
                        e.preventDefault();
                        const fileList = new DataTransfer();
                        imageFiles.forEach((file) => fileList.items.add(file));
                        await handleFilesUpload(fileList.files);
                      }
                    }}
                  >
                    {/* Typing indicator - shows when input is focused */}
                    {isInputFocused && compactMode && (
                      <div className="absolute bottom-2 left-2.5 flex items-center gap-1">
                        <div className="flex gap-0.5">
                          <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]"></span>
                          <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]"></span>
                          <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]"></span>
                        </div>
                      </div>
                    )}
                    {/* Refine prompt button - top right corner */}
                    {!compactMode && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleRefinePrompt}
                            disabled={
                              isRefining ||
                              !editorValue ||
                              (editorValue &&
                                serializeToText(editorValue).trim() === "")
                            }
                            className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded hover:opacity-100 disabled:opacity-50"
                            style={{
                              backgroundColor: "transparent",
                            }}
                          >
                            {isRefining ? (
                              <Loader className="h-4 w-4 animate-spin text-gray-400 dark:text-zinc-300" />
                            ) : (
                              <Sparkles className="h-4 w-4 text-gray-400 dark:text-zinc-300" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Refine prompt</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <MentionsEditor
                      key={editorKey}
                      providers={providers}
                      value={editorValue}
                      onChange={updateEditorValue}
                      selection={selection}
                      onSelectionChange={updateSelection}
                      placeholder={
                        compactMode
                          ? "Message..."
                          : "Build... (Use @ to mention assets and integrations)"
                      }
                      className={`block w-full overflow-y-auto border-none bg-transparent caret-black focus:animate-none focus:border-none focus:shadow-none focus:outline-none focus:ring-0 focus-visible:border-none focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 dark:caret-white ${
                        compactMode
                          ? "min-h-[40px] pb-8 pl-2.5 pr-2.5 pt-2"
                          : "min-h-[120px] pb-12 pl-3 pr-3 pt-3"
                      }`}
                      onMentionSelect={handleMentionSelect}
                      onEnterSubmit={handleSubmit}
                    />
                  </div>

                  {/* Bottom button row - separate from text area */}
                  <div
                    className={`flex items-center justify-between gap-2 ${
                      compactMode ? "px-2 py-1.5" : "px-3 py-2"
                    }`}
                  >
                    {/* Left side - Agent Mode Selector, Context Length, and Switch Agent button */}
                    <div className="flex items-center gap-1.5">
                      {onAgentModeChange && !compactMode && (
                        <AgentModeSelector
                          selectedMode={selectedAgentMode}
                          onModeChange={onAgentModeChange}
                        />
                      )}
                      {onContextLengthChange && !compactMode && (
                        <ContextLengthSelector
                          selectedLength={selectedContextLength}
                          onLengthChange={onContextLengthChange}
                          disabled={isProcessing}
                        />
                      )}
                    </div>

                    {/* Right side buttons */}
                    <div
                      className={`flex items-center ${compactMode ? "gap-1.5" : "gap-2"}`}
                    >
                      {/* Select Element Button - moved to the leftmost position */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={`flex items-center justify-center rounded-full ${isSelectingElement ? "pulse-select-btn bg-blue-600 ring-2 ring-blue-400" : "pulse-select-btn-idle"} ${compactMode ? "h-6 w-6" : "h-8 w-8"}`}
                            style={{
                              backgroundColor: isSelectingElement
                                ? undefined
                                : isProjectDark
                                  ? "#3c3c3c"
                                  : "#B794D1",
                            }}
                            onClick={() =>
                              setIsSelectingElement(!isSelectingElement)
                            }
                          >
                            {/* Use the same SVG as the original toolbar button for consistency */}
                            <svg
                              width={compactMode ? "16" : "20"}
                              height={compactMode ? "16" : "20"}
                              viewBox="0 0 20 20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              style={{
                                display: "inline-block",
                                verticalAlign: "middle",
                              }}
                              className="flex-shrink-0"
                            >
                              <circle
                                cx="10"
                                cy="10"
                                r="8"
                                stroke="#fff"
                                strokeWidth="1.5"
                                fill="none"
                              />
                              <line
                                x1="10"
                                y1="2"
                                x2="10"
                                y2="6"
                                stroke="#fff"
                                strokeWidth="1.5"
                              />
                              <line
                                x1="10"
                                y1="14"
                                x2="10"
                                y2="18"
                                stroke="#fff"
                                strokeWidth="1.5"
                              />
                              <line
                                x1="2"
                                y1="10"
                                x2="6"
                                y2="10"
                                stroke="#fff"
                                strokeWidth="1.5"
                              />
                              <line
                                x1="14"
                                y1="10"
                                x2="18"
                                y2="10"
                                stroke="#fff"
                                strokeWidth="1.5"
                              />
                              <circle cx="10" cy="10" r="2" fill="#fff" />
                            </svg>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Select element from preview</p>
                        </TooltipContent>
                      </Tooltip>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                      {/* <button
                    type="button"
                    onClick={() => setShowEnvVarsDialog(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary"
                    title="Environment Variables"
                  >
                    <Key className="h-4 w-4 text-primary-foreground" />
                  </button> */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className={`flex items-center justify-center rounded-full disabled:opacity-50 ${
                              compactMode ? "h-6 w-6" : "h-8 w-8"
                            }`}
                            style={{
                              backgroundColor: isProjectDark
                                ? "#3c3c3c"
                                : "#B794D1",
                            }}
                          >
                            {isUploading ? (
                              <Loader
                                className={`animate-spin text-primary-foreground ${
                                  compactMode ? "h-3 w-3" : "h-4 w-4"
                                }`}
                              />
                            ) : (
                              <ImageIcon
                                className={`text-primary-foreground ${
                                  compactMode ? "h-3 w-3" : "h-4 w-4"
                                }`}
                              />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {isUploading ? "Uploading..." : "Upload images"}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Show terminate button when processing, send button when not processing */}
                      {isProcessing ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={`flex items-center justify-center rounded-full bg-primary ${
                                compactMode ? "h-6 w-6" : "h-8 w-8"
                              }`}
                              onClick={async () => {
                                try {
                                  await terminateThread({
                                    projectSemanticIdentifier:
                                      projectSemanticIdentifier,
                                  });
                                } catch (error) {
                                  console.error("Termination failed:", error);
                                }
                              }}
                            >
                              <X
                                className={`text-primary-foreground ${
                                  compactMode ? "h-3 w-3" : "h-4 w-4"
                                }`}
                              />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Stop processing</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="submit"
                              className={`flex items-center justify-center rounded-full disabled:opacity-50 ${
                                compactMode ? "h-6 w-6" : "h-8 w-8"
                              }`}
                              style={{
                                backgroundColor:
                                  !editorValue ||
                                  (editorValue &&
                                    serializeToText(editorValue).trim() ===
                                      "" &&
                                    uploadedImages.length === 0 &&
                                    pendingImages.length === 0)
                                    ? isProjectDark
                                      ? "#4a4a4a"
                                      : "#D3C1E5"
                                    : isProjectDark
                                      ? "#3c3c3c"
                                      : "#B794D1",
                              }}
                              disabled={
                                isRefining ||
                                isUploading ||
                                isProcessing ||
                                pendingImages.some(
                                  (img) => img.isCompressing,
                                ) ||
                                !editorValue ||
                                (editorValue &&
                                  serializeToText(editorValue).trim() === "" &&
                                  uploadedImages.length === 0 &&
                                  pendingImages.length === 0)
                              }
                            >
                              <ArrowUp
                                className={`text-primary-foreground ${
                                  compactMode ? "h-3 w-3" : "h-4 w-4"
                                }`}
                              />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Send message</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Environment Variables Dialog */}
          <Dialog open={showEnvVarsDialog} onOpenChange={setShowEnvVarsDialog}>
            <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
              <DialogTitle>Environment Variables</DialogTitle>
              <div className="min-h-0 flex-1 p-4">
                <EnvVarsView
                  project={{
                    semantic_identifier: projectSemanticIdentifier,
                    _id: "" as any,
                    _creationTime: 0,
                    sandbox_id: "",
                    state: "running" as any,
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    );
  },
);

ChatInput.displayName = "ChatInput";

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return ImageIconLucide;
  if (fileType === "application/pdf") return FileText;
  if (fileType.startsWith("text/")) return FileText;
  return File;
}

function getFileIconColor(fileType: string) {
  if (fileType.startsWith("image/")) return "text-blue-500";
  if (fileType === "application/pdf") return "text-red-500";
  if (fileType.startsWith("text/")) return "text-gray-500";
  return "text-gray-500";
}

// New component for pending image preview
const PendingImagePreview: React.FC<{
  pendingImage: PendingImage;
  onRemove: () => void;
}> = ({ pendingImage, onRemove }) => {
  if (pendingImage.isCompressing) {
    return (
      <div className="group relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-muted">
          <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="group relative cursor-pointer">
          <img
            src={pendingImage.preview}
            alt="Pending upload"
            className="h-16 w-16 select-none rounded-lg border border-border object-cover transition-opacity hover:opacity-80"
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
          <Button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRemove();
            }}
            type="button"
            size="sm"
            variant="destructive"
            className="absolute -right-1 -top-1 h-5 w-5 rounded-md p-0 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl border-0 bg-transparent p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <div className="relative flex max-h-[90vh] min-h-[50vh] items-center justify-center">
          <img
            src={pendingImage.preview}
            alt="Full size"
            className="max-h-[90vh] max-w-full select-none object-contain"
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
          <div className="absolute right-4 top-4 flex gap-2">
            <Button
              onClick={async () => {
                try {
                  const response = await fetch(pendingImage.preview);
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.style.display = "none";
                  a.href = url;
                  a.download = `image-${pendingImage.id}.png`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (error) {
                  console.error("Download failed:", error);
                }
              }}
              size="sm"
              className="h-8 w-8 rounded-md p-0"
            >
              <Download className="h-4 w-4" />
            </Button>
            <DialogClose asChild>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 rounded-md p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ImagePreview component - kept for potential future use with uploaded images display
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ImagePreview: React.FC<{
  storageId: Id<"_storage">;
  onRemove: () => void;
}> = ({ storageId, onRemove }) => {
  const imageUrl = getImageUrl(storageId);

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `image-${storageId}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="group relative cursor-pointer">
          <img
            src={imageUrl}
            alt="Uploaded"
            className="h-16 w-16 select-none rounded-lg border border-border object-cover transition-opacity hover:opacity-80"
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
          <Button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRemove();
            }}
            type="button"
            size="sm"
            variant="destructive"
            className="absolute -right-1 -top-1 h-5 w-5 rounded-md p-0 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl border-0 bg-transparent p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <div className="relative flex max-h-[90vh] min-h-[50vh] items-center justify-center">
          <img
            src={imageUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-full select-none object-contain"
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
          <div className="absolute right-4 top-4 flex gap-2">
            <Button
              onClick={handleDownload}
              size="sm"
              className="h-8 w-8 rounded-md p-0"
            >
              <Download className="h-4 w-4" />
            </Button>
            <DialogClose asChild>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 rounded-md p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
