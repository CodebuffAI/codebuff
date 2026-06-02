"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { Loader } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { toast } from "sonner";
import { Switch } from "@/vly/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@/vly/components/ui/dialog";
import { Label } from "@/vly/components/ui/label";
import { Textarea } from "@/vly/components/ui/textarea";
import { useIsMobile } from "@/vly/hooks/use-mobile";
import { UiPresetCard } from "./UiPresetCard";
import { UiPresetDetail } from "./UiPresetDetail";
import { AddPresetDialog } from "./AddPresetDialog";

// ============================================================================
// TYPES
// ============================================================================

interface UiPresetLibraryProps {
  semanticIdentifier: string;
  category: "theme" | "component";
  selectedPresetId: string | null;
  onPresetSelected: (presetId: string | null) => void;
  isGodMode?: boolean;
}

interface PresetFormFields {
  title?: string;
  description?: string;
  category?: "theme" | "component";
  source_url?: string;
  tags?: string[];
  public?: boolean;
  code?: string;
  prompt?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ITEMS_PER_PAGE = 12;
const INTERSECTION_ROOT_MARGIN = "0px 0px 200px 0px";
const INTERSECTION_THRESHOLD = 0.1;
const MOBILE_SCROLL_DELAY = 100;

// ============================================================================
// VALIDATION
// ============================================================================

function validatePresetFields(
  fields: PresetFormFields,
  isCreate: boolean,
): string | null {
  if (isCreate) {
    const required = [
      "title",
      "description",
      "source_url",
      "code",
      "prompt",
    ] as const;
    const missing = required.filter(
      (field) => !fields[field]?.toString().trim(),
    );

    if (missing.length > 0) {
      return `Missing required fields: ${missing.join(", ")}`;
    }
  }

  if (fields.source_url && fields.source_url.trim()) {
    try {
      new URL(fields.source_url);
    } catch {
      return "Invalid source URL format";
    }
  }

  if (fields.tags && !Array.isArray(fields.tags)) {
    return "Tags must be an array";
  }

  return null;
}

function sanitizePresetFields(fields: PresetFormFields): PresetFormFields {
  return {
    ...fields,
    title: fields.title?.trim(),
    description: fields.description?.trim(),
    source_url: fields.source_url?.trim(),
    code: fields.code?.trim(),
    prompt: fields.prompt?.trim(),
    tags: Array.isArray(fields.tags)
      ? fields.tags.filter(Boolean).map((t) => t.trim())
      : [],
  };
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook to measure available viewport height from a ref element.
 */
function useAvailableHeight(ref: React.RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const compute = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const h = Math.max(0, window.innerHeight - rect.top);
      setHeight(h);
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [ref]);

  return height;
}

/**
 * Hook for infinite scroll with IntersectionObserver.
 */
function useInfiniteScroll(
  containerId: string,
  sentinelRef: React.RefObject<HTMLDivElement | null>,
  canLoadMore: boolean,
  loadMore: (count: number) => void,
) {
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (!containerId || !sentinelRef.current) return;

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn("[useInfiniteScroll] Container not found:", containerId);
      return;
    }

    try {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && canLoadMore && !isLoadingRef.current) {
              isLoadingRef.current = true;
              loadMore(ITEMS_PER_PAGE);
            }
          });
        },
        {
          root: container,
          rootMargin: INTERSECTION_ROOT_MARGIN,
          threshold: INTERSECTION_THRESHOLD,
        },
      );

      const el = sentinelRef.current;
      observer.observe(el);

      return () => {
        if (el) {
          observer.unobserve(el);
        }
        observer.disconnect();
      };
    } catch (error) {
      console.error("[useInfiniteScroll] Error setting up observer:", error);
    }
  }, [containerId, sentinelRef, canLoadMore, loadMore]);

  // Reset loading guard when status changes
  useEffect(() => {
    if (!canLoadMore) {
      isLoadingRef.current = false;
    }
  }, [canLoadMore]);
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface PresetFormFieldsComponentProps {
  fields: PresetFormFields;
  onChange: (field: keyof PresetFormFields, value: unknown) => void;
  category: "theme" | "component";
  isCreate?: boolean;
}

const PresetFormFieldsComponent = memo(function PresetFormFieldsComponent({
  fields,
  onChange,
  category,
  isCreate = false,
}: PresetFormFieldsComponentProps) {
  const idPrefix = isCreate ? "create" : "edit";

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${idPrefix}-title`}>Title{isCreate && " *"}</Label>
        <Input
          id={`${idPrefix}-title`}
          value={fields.title || ""}
          onChange={(e) => onChange("title", e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-description`}>
          Description{isCreate && " *"}
        </Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={fields.description || ""}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-source`}>
          Source URL{isCreate && " *"}
        </Label>
        <Input
          id={`${idPrefix}-source`}
          value={fields.source_url || ""}
          onChange={(e) => onChange("source_url", e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-tags`}>Tags (comma separated)</Label>
        <Input
          id={`${idPrefix}-tags`}
          value={fields.tags?.join(", ") || ""}
          onChange={(e) =>
            onChange(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-code`}>Code{isCreate && " *"}</Label>
        <Textarea
          id={`${idPrefix}-code`}
          value={fields.code || ""}
          onChange={(e) => onChange("code", e.target.value)}
          className="min-h-[200px] font-mono text-sm"
          placeholder={
            category === "theme"
              ? '{\n  "label": "Theme Name",\n  "styles": {\n    "light": { ... },\n    "dark": { ... }\n  }\n}'
              : '"use client";\n\nexport function Component() {\n  return <div>...</div>;\n}'
          }
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-prompt`}>
          Prompt (sent to AI){isCreate && " *"}
        </Label>
        <Textarea
          id={`${idPrefix}-prompt`}
          value={fields.prompt || ""}
          onChange={(e) => onChange("prompt", e.target.value)}
          className="min-h-[100px]"
          placeholder="Instructions for the AI to implement this theme/component..."
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={!!fields.public}
          onCheckedChange={(checked) => onChange("public", checked)}
          id={`${idPrefix}-public`}
        />
        <Label htmlFor={`${idPrefix}-public`}>
          {fields.public ? "Public" : "Private"}
        </Label>
      </div>
    </div>
  );
});

interface LoadingStateProps {
  category: "theme" | "component";
}

const LoadingState = memo(function LoadingState({
  category,
}: LoadingStateProps) {
  return (
    <div className="flex h-32 items-center justify-center text-gray-500">
      <Loader className="mr-2 h-5 w-5 animate-spin text-gray-400" />
      Loading {category === "theme" ? "themes" : "components"}...
    </div>
  );
});

interface EmptyStateProps {
  category: "theme" | "component";
}

const EmptyState = memo(function EmptyState({ category }: EmptyStateProps) {
  return (
    <div className="flex h-32 items-center justify-center text-gray-500">
      No {category === "theme" ? "themes" : "components"} available yet.
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const UiPresetLibrary = memo(function UiPresetLibrary({
  semanticIdentifier,
  category,
  selectedPresetId,
  onPresetSelected,
  isGodMode = false,
}: UiPresetLibraryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const availableHeight = useAvailableHeight(rootRef);

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editPreset, setEditPreset] = useState<Doc<"ui_preset"> | null>(null);
  const [editFields, setEditFields] = useState<PresetFormFields>({});

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<Doc<"ui_preset"> | null>(
    null,
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [presetToAdd, setPresetToAdd] = useState<Doc<"ui_preset"> | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createFields, setCreateFields] = useState<PresetFormFields>({
    category,
    public: false,
    tags: [],
  });

  // Paginated presets query
  const {
    results: presetsResults,
    status: presetsStatus,
    loadMore: loadMorePresets,
  } = usePaginatedQuery(
    api.uiPresets.getUiPresets,
    { category },
    { initialNumItems: ITEMS_PER_PAGE },
  );

  // Mutations
  const updatePreset = useMutation(api.uiPresets.updateUiPreset);
  const deletePreset = useMutation(api.uiPresets.deleteUiPreset);
  const createPreset = useMutation(api.uiPresets.createUiPreset);

  const presets = useMemo(() => presetsResults ?? [], [presetsResults]);
  const isLoading = presetsResults === undefined;
  const canLoadMore = presetsStatus === "CanLoadMore";
  const isLoadingMore = presetsStatus === "LoadingMore";

  // Setup infinite scroll
  useInfiniteScroll(
    "preset-list-scroll-container",
    sentinelRef,
    canLoadMore,
    loadMorePresets,
  );

  // Get selected preset with validation
  const selectedPreset = useMemo(
    () => presets.find((p) => p?._id === selectedPresetId),
    [presets, selectedPresetId],
  );

  // Handlers
  const handlePresetSelect = useCallback(
    (presetId: string) => {
      onPresetSelected(presetId);

      if (isMobile && detailsRef.current) {
        setTimeout(() => {
          detailsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, MOBILE_SCROLL_DELAY);
      }
    },
    [isMobile, onPresetSelected],
  );

  const handleEditFieldChange = useCallback(
    (field: keyof PresetFormFields, value: unknown) => {
      setEditFields((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleCreateFieldChange = useCallback(
    (field: keyof PresetFormFields, value: unknown) => {
      setCreateFields((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const openEditModal = useCallback((preset: Doc<"ui_preset">) => {
    setEditPreset(preset);
    setEditFields({ ...preset });
    setEditModalOpen(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditModalOpen(false);
    setEditPreset(null);
    setEditFields({});
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editPreset) {
      toast.error("No preset selected for editing");
      return;
    }

    const validationError = validatePresetFields(editFields, false);
    if (validationError) {
      toast.error("Validation failed", { description: validationError });
      return;
    }

    try {
      const sanitized = sanitizePresetFields(editFields);
      await updatePreset({
        presetId: editPreset._id,
        title: sanitized.title,
        description: sanitized.description,
        category: sanitized.category,
        source_url: sanitized.source_url,
        tags: sanitized.tags,
        public: sanitized.public,
        code: sanitized.code,
        prompt: sanitized.prompt,
      });
      toast.success("Preset updated successfully");
      closeEditModal();
    } catch (error) {
      console.error("[UiPresetLibrary] Failed to update preset:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to update preset", { description: message });
    }
  }, [editPreset, editFields, updatePreset, closeEditModal]);

  const openDeleteConfirm = useCallback((preset: Doc<"ui_preset">) => {
    setPresetToDelete(preset);
    setDeleteConfirmOpen(true);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmOpen(false);
    setPresetToDelete(null);
  }, []);

  const handleDeletePreset = useCallback(async () => {
    if (!presetToDelete?._id) {
      toast.error("Invalid preset", {
        description: "No preset selected for deletion",
      });
      return;
    }

    try {
      await deletePreset({ presetId: presetToDelete._id });
      toast.success("Preset deleted successfully");
      closeDeleteConfirm();

      if (selectedPresetId === presetToDelete._id) {
        onPresetSelected(null);
      }
    } catch (error) {
      console.error("[UiPresetLibrary] Failed to delete preset:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to delete preset", { description: message });
    }
  }, [
    presetToDelete,
    deletePreset,
    closeDeleteConfirm,
    selectedPresetId,
    onPresetSelected,
  ]);

  const openCreateModal = useCallback(() => {
    setCreateFields({ category, public: false, tags: [] });
    setCreateModalOpen(true);
  }, [category]);

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
    setCreateFields({ category, public: false, tags: [] });
  }, [category]);

  const validateCreateFields = useCallback((): boolean => {
    const error = validatePresetFields(createFields, true);
    if (error) {
      toast.error("Validation failed", { description: error });
      return false;
    }
    return true;
  }, [createFields]);

  const handleCreatePreset = useCallback(async () => {
    if (!validateCreateFields()) return;

    try {
      const sanitized = sanitizePresetFields(createFields);

      if (
        !sanitized.title ||
        !sanitized.description ||
        !sanitized.source_url ||
        !sanitized.code ||
        !sanitized.prompt
      ) {
        toast.error("Invalid data", {
          description: "Required fields cannot be empty",
        });
        return;
      }

      await createPreset({
        title: sanitized.title,
        description: sanitized.description,
        category: sanitized.category || category,
        source_url: sanitized.source_url,
        tags: sanitized.tags || [],
        public: sanitized.public || false,
        code: sanitized.code,
        prompt: sanitized.prompt,
      });
      toast.success("Preset created successfully");
      closeCreateModal();
    } catch (error) {
      console.error("[UiPresetLibrary] Failed to create preset:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to create preset", { description: message });
    }
  }, [
    createFields,
    category,
    createPreset,
    closeCreateModal,
    validateCreateFields,
  ]);

  const handleAddToProjectClick = useCallback((preset: Doc<"ui_preset">) => {
    setPresetToAdd(preset);
    setAddDialogOpen(true);
  }, []);

  const categoryLabel = category === "theme" ? "Themes" : "Components";
  const categoryLabelSingular = category === "theme" ? "theme" : "component";

  return (
    <div
      ref={rootRef}
      className="-mt-2 flex min-h-0 max-w-full flex-col overflow-hidden lg:flex-row"
      style={{ height: availableHeight ?? undefined }}
    >
      {/* Sidebar - Preset Grid */}
      <aside
        className={`${
          isMobile ? "h-full w-full border-b border-r-0" : "h-full w-96"
        } min-h-0 flex-shrink-0 border-r transition-all duration-300 ease-in-out`}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Header */}
          <div className="flex-shrink-0 border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">{categoryLabel}</h3>
              {isGodMode && (
                <Button variant="outline" size="sm" onClick={openCreateModal}>
                  + Add New
                </Button>
              )}
            </div>
          </div>

          {/* Preset List */}
          <div
            className="min-h-0 flex-1 overflow-y-auto p-3"
            id="preset-list-scroll-container"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {isLoading ? (
              <LoadingState category={category} />
            ) : presets.length === 0 ? (
              <EmptyState category={category} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {presets
                  .filter((p) => p?._id)
                  .map((preset) => (
                    <UiPresetCard
                      key={preset._id}
                      preset={preset}
                      isSelected={selectedPresetId === preset._id}
                      onClick={() => handlePresetSelect(preset._id)}
                      isGodMode={isGodMode}
                    />
                  ))}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div
              ref={sentinelRef}
              className="flex h-12 items-center justify-center text-xs text-gray-500"
            >
              {isLoadingMore && (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Loading more...
                </>
              )}
            </div>

            {canLoadMore && (
              <div className="pb-4 text-center">
                <Button
                  variant="ghost"
                  onClick={() => loadMorePresets(ITEMS_PER_PAGE)}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content - Detail View */}
      <main className="min-h-0 min-w-0 flex-1 lg:h-full" ref={detailsRef}>
        <div className="h-full overflow-y-auto">
          <div className="max-w-full p-4 sm:p-6">
            {selectedPreset ? (
              <UiPresetDetail
                preset={selectedPreset}
                isGodMode={isGodMode}
                onAddToProject={() => handleAddToProjectClick(selectedPreset)}
                onEdit={() => openEditModal(selectedPreset)}
                onDelete={() => openDeleteConfirm(selectedPreset)}
              />
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center text-gray-500">
                Select a {categoryLabelSingular} to view details
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add to Project Dialog */}
      <AddPresetDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        preset={presetToAdd}
        semanticIdentifier={semanticIdentifier}
      />

      {/* God mode: Edit Modal */}
      {isGodMode && (
        <Dialog open={editModalOpen} onOpenChange={closeEditModal}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Preset</DialogTitle>
              <DialogDescription>
                Update the preset fields below.
              </DialogDescription>
            </DialogHeader>
            <PresetFormFieldsComponent
              fields={editFields}
              onChange={handleEditFieldChange}
              category={category}
            />
            <DialogFooter>
              <Button variant="outline" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* God mode: Create Modal */}
      {isGodMode && (
        <Dialog open={createModalOpen} onOpenChange={closeCreateModal}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Preset</DialogTitle>
              <DialogDescription>
                Add a new {categoryLabelSingular} preset.
              </DialogDescription>
            </DialogHeader>
            <PresetFormFieldsComponent
              fields={createFields}
              onChange={handleCreateFieldChange}
              category={category}
              isCreate
            />
            <DialogFooter>
              <Button variant="outline" onClick={closeCreateModal}>
                Cancel
              </Button>
              <Button onClick={handleCreatePreset}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation dialog */}
      {isGodMode && (
        <Dialog open={deleteConfirmOpen} onOpenChange={closeDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Preset</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{presetToDelete?.title}
                &quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={closeDeleteConfirm}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeletePreset}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
});
