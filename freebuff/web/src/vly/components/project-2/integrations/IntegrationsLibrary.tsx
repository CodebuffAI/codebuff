import { useEffect, useRef, useState } from "react";
import { Loader, Search, X, Edit3, Save } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { toast } from "sonner";
import { useDebounce } from "@/vly/lib/hooks/use-debounce";
import { Switch } from "@/vly/components/ui/switch";
import ReactMarkdown from "react-markdown";
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
import { useFeatureAccess } from "@/vly/hooks/useFeatureAccess";
import { UpgradePrompt } from "@/vly/components/billing/FeatureGate";

interface IntegrationsLibraryProps {
  semanticIdentifier: string;
  onIntegrationAdded?: (integrationId: string) => void;
  isGodMode?: boolean;
}

interface Integration {
  _id: Id<"integration">;
  cover_image?: string;
  human_added_notes?: string;
  env_variables?: { id: string; description: string }[];
  title: string;
  description: string;
  documentation_urls: string[];
  tags: string[];
  last_updated: number;
  public: boolean;
  type: string;
  user_instructions: string;
  llm_instructions: string;
  images?: string[];
  recommended?: boolean;
}

export function IntegrationsLibrary({
  semanticIdentifier,
  onIntegrationAdded,
  isGodMode = false,
}: IntegrationsLibraryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(
    null,
  );
  const [_isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const isMobile = useIsMobile();
  const detailsRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editIntegration, setEditIntegration] = useState<Integration | null>(
    null,
  );
  const [editFields, setEditFields] = useState<Partial<Integration>>({});
  const deleteIntegration = useMutation(api.integrations.deleteIntegration);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] =
    useState<Integration | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false);

  // LLM Instructions editing state
  const [editingLLMInstructions, setEditingLLMInstructions] = useState<
    string | null
  >(null);
  const [editedLLMInstructions, setEditedLLMInstructions] =
    useState<string>("");
  const [isSavingLLM, setIsSavingLLM] = useState(false);

  // Feature access check for integrations library
  const { hasAccess: hasIntegrationsAccess } = useFeatureAccess(
    "integrations_library",
  );
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Paginated integrations with infinite scroll
  const {
    results: integrationsResults,
    status: integrationsStatus,
    loadMore: loadMoreIntegrations,
  } = usePaginatedQuery(
    api.integrations.getIntegrations,
    { search: debouncedSearchQuery },
    { initialNumItems: 3 },
  );

  // Measure available viewport height for this panel so it fills below the top bar
  useEffect(() => {
    const compute = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const h = Math.max(0, window.innerHeight - rect.top);
      setAvailableHeight(h);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    const container = document.getElementById(
      "integration-list-scroll-container",
    );
    if (!container || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            integrationsStatus === "CanLoadMore" &&
            !isLoadingMoreRef.current
          ) {
            isLoadingMoreRef.current = true;
            loadMoreIntegrations(20);
          }
        });
      },
      {
        root: container,
        rootMargin: "0px 0px 200px 0px",
        threshold: 0.1,
      },
    );

    const el = sentinelRef.current;
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      observer.disconnect();
    };
  }, [integrationsStatus, loadMoreIntegrations, debouncedSearchQuery]);

  // Reset the loading guard when status changes away from LoadingMore
  useEffect(() => {
    if (integrationsStatus !== "LoadingMore") {
      isLoadingMoreRef.current = false;
    }
  }, [integrationsStatus]);

  // Fetch project integrations to check which ones are already added
  const projectIntegrations = useQuery(
    api.integrations.getProjectIntegrations,
    {
      semanticIdentifier,
    },
  );

  const integrations = integrationsResults ?? [];
  const addedIntegrationIds = new Set(
    (projectIntegrations ?? []).map((i) => i._id),
  );

  // Only show integrations that are not already added, unless god mode
  const visibleIntegrations = isGodMode
    ? integrations
    : integrations.filter(
        (integration: Integration) => !addedIntegrationIds.has(integration._id),
      );

  // Mutation to add integration to project
  const addToProject = useMutation(api.integrations.addIntegrationToProject);
  const updateIntegration = useMutation(api.integrations.updateIntegration);

  const handleAddToProject = async (integrationId: Id<"integration">) => {
    // Check feature access before adding
    if (!hasIntegrationsAccess) {
      setShowUpgradeDialog(true);
      return;
    }

    try {
      await addToProject({
        semanticIdentifier,
        integrationId,
      });
      toast.success("Integration added", {
        description: "The integration has been added to your project.",
      });
      setSelectedIntegration(integrationId);
      if (onIntegrationAdded) onIntegrationAdded(integrationId);
      // trigger new message for integrating
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to add integration. Please try again.");
      }
    }
  };

  // God mode: handle public/private toggle
  const handleTogglePublic = async (integration: Integration) => {
    try {
      await updateIntegration({
        integrationId: integration._id,
        public: !integration.public,
      });
      toast.success("Integration updated", {
        description: `Integration is now ${!integration.public ? "public" : "private"}.`,
      });
    } catch (_error) {
      toast.error("Error", { description: "Failed to update integration." });
    }
  };

  // LLM Instructions editing handlers
  const handleEditLLMInstructions = (integration: any) => {
    setEditingLLMInstructions(integration._id);
    setEditedLLMInstructions(integration.llm_instructions);
  };

  const handleSaveLLMInstructions = async (integrationId: string) => {
    setIsSavingLLM(true);
    try {
      await updateIntegration({
        integrationId: integrationId as Id<"integration">,
        llm_instructions: editedLLMInstructions,
      });
      setEditingLLMInstructions(null);
      setEditedLLMInstructions("");
      toast.success("Implementation instructions updated successfully");
    } catch (error) {
      toast.error("Failed to update implementation instructions");
      console.error("Error updating LLM instructions:", error);
    } finally {
      setIsSavingLLM(false);
    }
  };

  const handleCancelEditLLMInstructions = () => {
    setEditingLLMInstructions(null);
    setEditedLLMInstructions("");
  };

  // Handle integration selection with scroll behavior for mobile
  const handleIntegrationSelect = (integrationId: string) => {
    setSelectedIntegration(integrationId);

    // On mobile/tablet (when layout is wrapped), scroll to details
    if (isMobile && detailsRef.current) {
      setTimeout(() => {
        detailsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100); // Small delay to ensure state update
    }
  };

  // God mode: open edit modal
  const openEditModal = (integration: Integration) => {
    setEditIntegration(integration);
    setEditFields({ ...integration });
    setEditModalOpen(true);
  };

  // God mode: handle edit field change
  const handleEditFieldChange = (field: keyof Integration, value: any) => {
    setEditFields((prev) => ({ ...prev, [field]: value }));
  };

  // God mode: save edits
  const handleSaveEdit = async () => {
    if (!editIntegration) return;
    try {
      // Only send allowed fields to Convex
      const {
        cover_image,
        description,
        documentation_urls,
        env_variables,
        human_added_notes,
        images,
        llm_instructions,
        public: isPublic,
        tags,
        title,
        type,
        user_instructions,
      } = editFields;
      await updateIntegration({
        integrationId: editIntegration._id,
        cover_image,
        description,
        documentation_urls,
        env_variables,
        human_added_notes,
        images,
        llm_instructions,
        public: isPublic,
        tags,
        title,
        type,
        user_instructions,
      });
      toast.success("Integration updated");
      setEditModalOpen(false);
    } catch (_error) {
      toast.error("Error", { description: "Failed to update integration." });
    }
  };

  const handleDeleteIntegration = async () => {
    if (!integrationToDelete) return;
    try {
      await deleteIntegration({ integrationId: integrationToDelete._id });
      toast.success("Integration deleted");
      setDeleteConfirmOpen(false);
      setIntegrationToDelete(null);
      setSelectedIntegration(null);
    } catch (_error) {
      toast.error("Error", { description: "Failed to delete integration." });
    }
  };

  // Add helper functions for editing documentation_urls and images in the edit modal
  const addEditDocUrl = () => {
    setEditFields((prev) => ({
      ...prev,
      documentation_urls: Array.isArray(prev.documentation_urls)
        ? [...prev.documentation_urls, ""]
        : [prev.documentation_urls || "", ""],
    }));
  };
  const updateEditDocUrl = (index: number, value: string) => {
    setEditFields((prev) => ({
      ...prev,
      documentation_urls: (Array.isArray(prev.documentation_urls)
        ? prev.documentation_urls
        : [prev.documentation_urls || ""]
      ).map((url, i) => (i === index ? value : url)),
    }));
  };
  const removeEditDocUrl = (index: number) => {
    setEditFields((prev) => ({
      ...prev,
      documentation_urls: (Array.isArray(prev.documentation_urls)
        ? prev.documentation_urls
        : [prev.documentation_urls || ""]
      ).filter((_, i) => i !== index),
    }));
  };
  const addEditImage = () => {
    setEditFields((prev) => ({
      ...prev,
      images: Array.isArray(prev.images)
        ? [...prev.images, ""]
        : [prev.images || "", ""],
    }));
  };
  const updateEditImage = (index: number, value: string) => {
    setEditFields((prev) => ({
      ...prev,
      images: (Array.isArray(prev.images)
        ? prev.images
        : [prev.images || ""]
      ).map((img, i) => (i === index ? value : img)),
    }));
  };
  const removeEditImage = (index: number) => {
    setEditFields((prev) => ({
      ...prev,
      images: (Array.isArray(prev.images)
        ? prev.images
        : [prev.images || ""]
      ).filter((_, i) => i !== index),
    }));
  };

  return (
    <div
      ref={rootRef}
      className="-mt-2 flex min-h-0 max-w-full flex-col overflow-hidden lg:flex-row"
      style={{ height: availableHeight ?? undefined }}
    >
      {/* Sidebar */}
      <div
        className={`${isMobile ? "h-full w-full border-b border-r-0" : "h-full w-80"} min-h-0 flex-shrink-0 border-r transition-all duration-300 ease-in-out`}
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex-shrink-0 border-b p-2 pl-4">
            <div className="mb-2">
              <h2 className="font-semibold">Integration Library</h2>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            id="integration-list-scroll-container"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="space-y-2 p-2">
              {integrationsResults === undefined ? (
                <div className="flex h-32 items-center justify-center text-gray-500">
                  <Loader className="mr-2 h-5 w-5 animate-spin text-gray-400" />
                  Loading integrations...
                </div>
              ) : (
                visibleIntegrations.map((integration: Integration) => (
                  <div key={integration._id} className="group relative">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                        selectedIntegration === integration._id
                          ? "bg-gray-100 dark:bg-gray-800"
                          : "hover:bg-gray-50 dark:hover:bg-gray-900"
                      }`}
                      onClick={() => handleIntegrationSelect(integration._id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleIntegrationSelect(integration._id);
                        }
                      }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center">
                        {integration.cover_image ? (
                          integration.cover_image && (
                            <img
                              src={integration.cover_image}
                              alt={`${integration.title} logo`}
                              className="h-8 w-8 rounded object-cover"
                            />
                          )
                        ) : (
                          <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-center gap-2 font-medium">
                          {integration.title}
                          {integration.recommended && (
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                              Recommended
                            </span>
                          )}
                          {isGodMode && (
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${integration.public ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                            >
                              {integration.public ? "Public" : "Private"}
                            </span>
                          )}
                          {isGodMode && (
                            <Switch
                              checked={integration.public}
                              onCheckedChange={() =>
                                handleTogglePublic(integration)
                              }
                              className="ml-1"
                              aria-label="Toggle public/private"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          {isGodMode && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-1 p-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(integration);
                              }}
                              aria-label="Edit integration"
                            >
                              <svg
                                width="16"
                                height="16"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  d="M16.862 5.487a2.06 2.06 0 0 1 2.915 2.914l-9.34 9.34a2 2 0 0 1-.707.464l-3.11 1.037a.5.5 0 0 1-.634-.634l1.037-3.11a2 2 0 0 1 .464-.707l9.34-9.34Z"
                                />
                              </svg>
                            </Button>
                          )}
                          {isGodMode && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-1 p-1 text-red-600 hover:bg-red-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIntegrationToDelete(integration);
                                setDeleteConfirmOpen(true);
                              }}
                              aria-label="Delete integration"
                            >
                              <svg
                                width="16"
                                height="16"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  d="M6 6l12 12M6 18L18 6"
                                />
                              </svg>
                            </Button>
                          )}
                        </h3>
                        <p className="max-w-full truncate text-sm text-gray-500 dark:text-gray-400">
                          {integration.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {/* Infinite scroll sentinel */}
              <div
                ref={sentinelRef}
                className="flex h-12 items-center justify-center text-xs text-gray-500"
              >
                {integrationsStatus === "LoadingMore" && (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Loading more...
                  </>
                )}
              </div>
              {integrationsStatus === "CanLoadMore" && (
                <div className="pb-4 text-center">
                  <Button
                    variant="ghost"
                    onClick={() => loadMoreIntegrations(20)}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-h-0 min-w-0 flex-1 lg:h-full" ref={detailsRef}>
        <div className="h-full overflow-y-auto">
          <div className="max-w-full p-4 sm:p-6">
            {selectedIntegration ? (
              <div className="space-y-6">
                {integrations.map((integration: Integration) => {
                  if (integration._id === selectedIntegration) {
                    return (
                      <div key={integration._id} className="space-y-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-3">
                              {integration.cover_image ? (
                                integration.cover_image && (
                                  <img
                                    src={integration.cover_image}
                                    alt={`${integration.title} logo`}
                                    className="h-8 w-8 rounded object-cover"
                                  />
                                )
                              ) : (
                                <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
                              )}
                              <h2 className="text-xl font-bold sm:text-2xl">
                                {integration.title}
                              </h2>
                              {integration.recommended && (
                                <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                                  Recommended
                                </span>
                              )}
                            </div>
                            {isGodMode && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded px-2 py-1 text-xs font-semibold ${integration.public ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                                >
                                  {integration.public ? "Public" : "Private"}
                                </span>
                                <Switch
                                  checked={integration.public}
                                  onCheckedChange={() =>
                                    handleTogglePublic(integration)
                                  }
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditModal(integration)}
                                >
                                  Edit
                                </Button>
                              </div>
                            )}
                          </div>
                          <Button
                            onClick={() => handleAddToProject(integration._id)}
                            className="flex items-center gap-2 sm:ml-auto"
                            disabled={addedIntegrationIds.has(integration._id)}
                            size={isMobile ? "sm" : "default"}
                          >
                            {addedIntegrationIds.has(integration._id)
                              ? "Added to Project"
                              : "Add to Project"}
                          </Button>
                        </div>
                        <div>
                          <h3 className="mb-2 font-medium">Description</h3>
                          <p className="break-words">
                            {integration.description}
                          </p>
                        </div>
                        {integration.env_variables &&
                          integration.env_variables.length > 0 && (
                            <div>
                              <h3 className="mb-2 font-medium">API Keys</h3>
                              <div className="space-y-2">
                                {integration.env_variables.map((env, idx) => (
                                  <div key={idx} className="flex flex-col">
                                    <span className="font-mono text-sm">
                                      {env.id}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                      {env.description}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        <div>
                          <h3 className="mb-2 font-medium">
                            User Instructions
                          </h3>
                          <div className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
                            {integration.user_instructions
                              ?.split(/(\bhttps?:\/\/[^\s]+)/g)
                              .map((part, index) => {
                                if (part.match(/^https?:\/\//)) {
                                  return (
                                    <a
                                      key={index}
                                      href={part}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 underline hover:text-blue-800"
                                    >
                                      {part}
                                    </a>
                                  );
                                }
                                return part;
                              })}
                          </div>
                        </div>
                        {integration.images &&
                          integration.images.length > 0 && (
                            <div>
                              <h3 className="mb-2 font-medium">Images</h3>
                              <div className="flex flex-wrap gap-2">
                                {integration.images.map(
                                  (img, idx) =>
                                    img && (
                                      <button
                                        key={idx}
                                        type="button"
                                        className="focus:outline-none"
                                        onClick={() => {
                                          setActiveImage(img);
                                          setShowImageDialog(true);
                                        }}
                                      >
                                        <img
                                          src={img}
                                          alt={`Integration image ${idx + 1}`}
                                          className="h-24 w-32 rounded border bg-white object-cover transition hover:opacity-80 dark:bg-gray-900 sm:h-36 sm:w-64"
                                        />
                                      </button>
                                    ),
                                )}
                              </div>
                              <Dialog
                                open={showImageDialog}
                                onOpenChange={setShowImageDialog}
                              >
                                <DialogContent
                                  className="flex flex-col items-center justify-center"
                                  style={{
                                    width: "90vw",
                                    height: "90vh",
                                    maxWidth: "90vw",
                                    maxHeight: "90vh",
                                    padding: 0,
                                  }}
                                >
                                  <DialogHeader>
                                    <DialogTitle>Image Preview</DialogTitle>
                                  </DialogHeader>
                                  {activeImage && (
                                    <div className="flex h-full w-full flex-1 items-center justify-center">
                                      {activeImage && (
                                        <img
                                          src={activeImage}
                                          alt="Full size integration image"
                                          className="max-h-full max-w-full rounded border object-contain"
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                          }}
                                        />
                                      )}
                                    </div>
                                  )}
                                </DialogContent>
                              </Dialog>
                            </div>
                          )}
                        <div>
                          <h3 className="mb-2 font-medium">Documentation</h3>
                          {integration.documentation_urls &&
                          integration.documentation_urls.length > 0 ? (
                            <ul className="ml-6 list-disc">
                              {integration.documentation_urls.map(
                                (url, idx) => (
                                  <li key={idx}>
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:underline"
                                    >
                                      {url}
                                    </a>
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <span className="text-gray-500">
                              No documentation URLs provided.
                            </span>
                          )}
                        </div>
                        <div>
                          <h3 className="mb-2 font-medium">Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {integration.tags.map((tag, index) => (
                              <span
                                key={index}
                                className="rounded-full bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h3 className="mb-2 font-medium">Type</h3>
                          <span className="inline-block rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700">
                            {integration.type}
                          </span>
                        </div>
                        <div>
                          <h3 className="mb-2 font-medium">Public</h3>
                          <span className="inline-block rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700">
                            {integration.public ? "Yes" : "No"}
                          </span>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <h3 className="font-medium">
                              Implementation Instructions
                            </h3>
                            {editingLLMInstructions === integration._id ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleCancelEditLLMInstructions}
                                  disabled={isSavingLLM}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() =>
                                    handleSaveLLMInstructions(integration._id)
                                  }
                                  disabled={isSavingLLM}
                                >
                                  {isSavingLLM ? (
                                    <Loader className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Save className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleEditLLMInstructions(integration)
                                }
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          {editingLLMInstructions === integration._id ? (
                            <Textarea
                              value={editedLLMInstructions}
                              onChange={(e) =>
                                setEditedLLMInstructions(e.target.value)
                              }
                              className="min-h-[300px] font-mono text-xs"
                              placeholder="Enter implementation instructions..."
                              disabled={isSavingLLM}
                            />
                          ) : (
                            <div
                              className="prose prose-sm group relative max-w-none cursor-pointer rounded bg-gray-50 p-2 text-xs transition-colors hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800"
                              onClick={() =>
                                handleEditLLMInstructions(integration)
                              }
                            >
                              <ReactMarkdown
                                components={{
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 underline hover:text-blue-800"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {children}
                                    </a>
                                  ),
                                }}
                              >
                                {integration.llm_instructions}
                              </ReactMarkdown>
                              <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <Edit3 className="h-3 w-3 text-gray-400" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="mb-2 font-medium">Notes</h3>
                          <p>{integration.human_added_notes}</p>
                        </div>

                        <div>
                          <h3 className="mb-2 font-medium">Last Updated</h3>
                          <span className="text-xs text-gray-500">
                            {integration.last_updated
                              ? new Date(
                                  integration.last_updated,
                                ).toLocaleString()
                              : "Unknown"}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
                {/* God mode edit modal */}
                {isGodMode && editIntegration && (
                  <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Integration</DialogTitle>
                        <DialogDescription>
                          Update the integration fields below and save.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                        <div>
                          <Label htmlFor="edit-title">Title</Label>
                          <Input
                            id="edit-title"
                            value={editFields.title || ""}
                            onChange={(e) =>
                              handleEditFieldChange("title", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-description">Description</Label>
                          <Textarea
                            id="edit-description"
                            value={editFields.description || ""}
                            onChange={(e) =>
                              handleEditFieldChange(
                                "description",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-tags">
                            Tags (comma separated)
                          </Label>
                          <Input
                            id="edit-tags"
                            value={editFields.tags?.join(", ") || ""}
                            onChange={(e) =>
                              handleEditFieldChange(
                                "tags",
                                e.target.value
                                  .split(",")
                                  .map((t: string) => t.trim()),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-docurls">
                            Documentation URLs
                          </Label>
                          <div className="space-y-2">
                            {(Array.isArray(editFields.documentation_urls)
                              ? editFields.documentation_urls
                              : [editFields.documentation_urls || ""]
                            ).map((url, idx) => (
                              <div key={idx} className="flex gap-2">
                                <Input
                                  type="url"
                                  placeholder="Documentation URL"
                                  value={url}
                                  onChange={(e) =>
                                    updateEditDocUrl(idx, e.target.value)
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => removeEditDocUrl(idx)}
                                  disabled={
                                    (Array.isArray(
                                      editFields.documentation_urls,
                                    )
                                      ? editFields.documentation_urls
                                      : [editFields.documentation_urls || ""]
                                    ).length === 1
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={addEditDocUrl}
                            >
                              Add Documentation URL
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="edit-llm">LLM Instructions</Label>
                          <Textarea
                            id="edit-llm"
                            value={editFields.llm_instructions || ""}
                            onChange={(e) =>
                              handleEditFieldChange(
                                "llm_instructions",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-userinst">
                            User Instructions
                          </Label>
                          <Textarea
                            id="edit-userinst"
                            value={editFields.user_instructions || ""}
                            onChange={(e) =>
                              handleEditFieldChange(
                                "user_instructions",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-notes">Notes</Label>
                          <Textarea
                            id="edit-notes"
                            value={editFields.human_added_notes || ""}
                            onChange={(e) =>
                              handleEditFieldChange(
                                "human_added_notes",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-cover">Cover Image URL</Label>
                          <Input
                            id="edit-cover"
                            value={editFields.cover_image || ""}
                            onChange={(e) =>
                              handleEditFieldChange(
                                "cover_image",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-type">Type</Label>
                          <Input
                            id="edit-type"
                            value={editFields.type || ""}
                            onChange={(e) =>
                              handleEditFieldChange("type", e.target.value)
                            }
                          />
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Switch
                            checked={!!editFields.public}
                            onCheckedChange={(checked) =>
                              handleEditFieldChange("public", checked)
                            }
                            id="edit-public"
                          />
                          <Label htmlFor="edit-public">
                            {editFields.public ? "Public" : "Private"}
                          </Label>
                        </div>
                        <div>
                          <Label>Images</Label>
                          <div className="space-y-2">
                            {(Array.isArray(editFields.images)
                              ? editFields.images
                              : [editFields.images || ""]
                            ).map((img, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2"
                              >
                                <Input
                                  type="url"
                                  placeholder="Image URL"
                                  value={img}
                                  onChange={(e) =>
                                    updateEditImage(idx, e.target.value)
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => removeEditImage(idx)}
                                  disabled={
                                    (Array.isArray(editFields.images)
                                      ? editFields.images
                                      : [editFields.images || ""]
                                    ).length === 1
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                {img && (
                                  <img
                                    src={img}
                                    alt={`Integration image ${idx + 1}`}
                                    className="h-16 w-16 rounded border object-cover"
                                  />
                                )}
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={addEditImage}
                            >
                              Add Image
                            </Button>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleSaveEdit}>Save</Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditModalOpen(false)}
                        >
                          Cancel
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {/* Delete confirmation dialog */}
                {isGodMode && (
                  <Dialog
                    open={deleteConfirmOpen}
                    onOpenChange={setDeleteConfirmOpen}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete Integration</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete the integration "
                          {integrationToDelete?.title}"? This action cannot be
                          undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteIntegration}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setDeleteConfirmOpen(false)}
                        >
                          Cancel
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {/* Upgrade dialog for adding integrations */}
                <Dialog
                  open={showUpgradeDialog}
                  onOpenChange={setShowUpgradeDialog}
                >
                  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Upgrade to Add Integrations</DialogTitle>
                    </DialogHeader>
                    <UpgradePrompt
                      featureId="integrations_library"
                      hideTitle
                      borderless
                    />
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                Select an integration to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
