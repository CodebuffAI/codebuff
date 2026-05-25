import { useState, useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation, useAction } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Loader, Trash2, Edit3, Save, X } from "lucide-react";
import { toast } from "sonner";
import { EnvVarEditor } from "../EnvVarsDialog";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { UpgradePrompt } from "@/components/billing/FeatureGate";

interface IntegrationsProps {
  semanticIdentifier: string;
  selectedIntegrationId?: string | null;
}

export function Integrations({
  semanticIdentifier,
  selectedIntegrationId,
}: IntegrationsProps) {
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(
    selectedIntegrationId ?? null,
  );
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const isMobile = useIsMobile();
  const detailsRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  // Fetch project integrations
  const integrations = useQuery(api.integrations.getProjectIntegrations, {
    semanticIdentifier,
  });

  // Mutation to remove integration from project
  const removeIntegration = useMutation(
    api.integrations.removeIntegrationFromProject,
  );

  // Fetch project env vars for editing
  const getEnvVars = useAction(api.codesandbox.envVars.getEnvVars);
  const setEnvVars = useAction(api.codesandbox.envVars.setEnvVars);
  const [projectEnvVars, setProjectEnvVars] = useState<{
    frontend: Record<string, string>;
    backend: Record<string, string>;
  } | null>(null);
  const [editedEnvVars, setEditedEnvVars] = useState<{
    frontend: Record<string, string>;
    backend: Record<string, string>;
  } | null>(null);
  const [isEnvLoading, setIsEnvLoading] = useState(false);
  const [isEnvSaving, setIsEnvSaving] = useState(false);

  const [isAgentAdding, setIsAgentAdding] = useState(false);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [agentUserText, setAgentUserText] = useState("");
  const [pendingIntegration, setPendingIntegration] = useState<any>(null);

  // Fetch project state
  const projectQuery = useQuery(api.project.getProjectData, {
    semanticIdentifier,
  });
  const projectState = projectQuery?.state;
  const activeThreadId = projectQuery?.active_thread;

  // Add state for image popup
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);

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

  // Mutation to update integration
  const updateIntegration = useMutation(api.integrations.updateIntegration);

  // Update selectedIntegration if selectedIntegrationId changes
  useEffect(() => {
    if (selectedIntegrationId) {
      setSelectedIntegration(selectedIntegrationId);
    }
  }, [selectedIntegrationId]);

  // Load env vars when integration is selected
  useEffect(() => {
    if (selectedIntegration) {
      setIsEnvLoading(true);
      getEnvVars({ semanticIdentifier })
        .then((vars) => {
          setProjectEnvVars(vars);
          setEditedEnvVars(vars);
        })
        .finally(() => setIsEnvLoading(false));
    }
  }, [selectedIntegration, semanticIdentifier]);

  // Handler for updating env var values
  const handleEnvVarChange = (
    type: "frontend" | "backend",
    key: string,
    value: string,
  ) => {
    setEditedEnvVars((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [type]: { ...prev[type], [key]: value },
      };
    });
  };

  // Save handler
  const handleEnvVarSave = async () => {
    if (!editedEnvVars) return;
    setIsEnvSaving(true);
    try {
      await setEnvVars({ semanticIdentifier, envVars: editedEnvVars });
      setProjectEnvVars(editedEnvVars);
      toast.success("API keys saved");
    } catch (e) {
      toast.error("Failed to save API keys");
    } finally {
      setIsEnvSaving(false);
    }
  };

  const handleRemoveIntegration = async (integrationId: Id<"integration">) => {
    try {
      await removeIntegration({
        semanticIdentifier,
        integrationId,
      });
      toast.success("Integration removed", {
        description: "The integration has been removed from your project.",
      });
    } catch (error) {
      toast.error("Error", {
        description: "Failed to remove integration. Please try again.",
      });
    }
  };

  const handleAddAgentClick = (integration: any) => {
    // Check feature access before adding to chat
    if (!hasIntegrationsAccess) {
      setShowUpgradeDialog(true);
      return;
    }
    setPendingIntegration(integration);
    setShowAgentDialog(true);
    setAgentUserText("");
  };

  const addIntegrationToContext = useMutation(
    api.thread.addIntegrationNameToContextPublic,
  );

  const handleAgentDialogSubmit = async () => {
    if (!pendingIntegration) return;
    setIsAgentAdding(true);
    try {
      // Add integration to context if there is an active thread
      if (activeThreadId) {
        await addIntegrationToContext({
          semanticIdentifier: semanticIdentifier,
          threadId: activeThreadId,
          referenceId: pendingIntegration.reference_id,
        });
      }

      // Navigate to editor page with the @mention in the chat input
      const mentionText = `@${pendingIntegration.title}${agentUserText ? ` ${agentUserText}` : ""}`;

      // Store the message in localStorage to be picked up by the editor page
      localStorage.setItem(`chat-draft-${semanticIdentifier}`, mentionText);

      // Navigate to the editor page
      window.location.href = `/project/${semanticIdentifier}`;

      toast.success("Redirecting to editor with integration mention");
      setShowAgentDialog(false);
      setPendingIntegration(null);
      setAgentUserText("");
    } catch (e) {
      toast.error("Failed to add integration to context");
    } finally {
      setIsAgentAdding(false);
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
            <h2 className="font-semibold">Your Integrations</h2>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="space-y-2 p-2">
              {integrations === undefined ? (
                <div className="flex h-32 items-center justify-center text-gray-500">
                  <Loader className="mr-2 h-5 w-5 animate-spin text-gray-400" />
                  Loading integrations...
                </div>
              ) : integrations?.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-gray-500">
                  No integrations found
                </div>
              ) : (
                integrations?.map((integration) => (
                  <div key={integration._id} className="group relative">
                    <button
                      className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                        selectedIntegration === integration._id
                          ? "bg-gray-100 dark:bg-gray-800"
                          : "hover:bg-gray-50 dark:hover:bg-gray-900"
                      }`}
                      onClick={() => handleIntegrationSelect(integration._id)}
                    >
                      <div className="flex h-8 w-8 items-center justify-center">
                        {integration.cover_image ? (
                          <img
                            src={integration.cover_image}
                            alt={`${integration.title} logo`}
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium">{integration.title}</h3>
                        <p className="max-w-full truncate text-sm text-gray-500 dark:text-gray-400">
                          {integration.description}
                        </p>
                      </div>
                    </button>
                  </div>
                ))
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
                {integrations?.map((integration) => {
                  if (integration._id === selectedIntegration) {
                    return (
                      <div key={integration._id} className="space-y-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="flex items-center gap-3">
                            {integration.cover_image ? (
                              <img
                                src={integration.cover_image}
                                alt={`${integration.title} logo`}
                                className="h-8 w-8 rounded object-cover"
                              />
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
                          <Button
                            variant="default"
                            onClick={() => handleAddAgentClick(integration)}
                            disabled={
                              isAgentAdding || projectState === "processing"
                            }
                            className="flex items-center gap-2 sm:ml-auto"
                            size={isMobile ? "sm" : "default"}
                          >
                            {projectState === "processing" ? (
                              "Chat is processing..."
                            ) : isAgentAdding ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : null}
                            {projectState === "processing"
                              ? null
                              : "Add to Chat"}
                          </Button>
                        </div>

                        <div>
                          <h3 className="mb-2 font-medium">Description</h3>
                          <p className="break-words">
                            {integration.description}
                          </p>
                        </div>
                        {/* Environment Variables - distinct section */}
                        {integration.env_variables &&
                          integration.env_variables.length > 0 &&
                          (() => {
                            const envVarKeys = integration.env_variables.map(
                              (env: any) => env.id,
                            );
                            const backendVars = editedEnvVars?.backend || {};
                            const allEnvVarsSet = envVarKeys.every(
                              (key: string) =>
                                backendVars[key] &&
                                backendVars[key].trim() !== "",
                            );
                            if (isEnvLoading) {
                              return (
                                <div className="flex min-h-[120px] flex-col items-center justify-center pt-2">
                                  <Loader className="h-4 w-4 animate-spin" />
                                  <span className="text-sm text-muted-foreground">
                                    Loading API keys...
                                  </span>
                                </div>
                              );
                            }

                            // If user doesn't have access, show upgrade prompt instead of API key editor
                            if (!hasIntegrationsAccess) {
                              return (
                                <div className="pt-2">
                                  <h3 className="mb-4 text-lg font-semibold text-black">
                                    Set API keys
                                  </h3>
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                                    <p className="mb-3 text-sm text-amber-900">
                                      Upgrade to Hobby plan to add API keys and
                                      use integrations in your projects.
                                    </p>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => setShowUpgradeDialog(true)}
                                    >
                                      Upgrade to Add API Keys
                                    </Button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div className="pt-2">
                                <h3 className="mb-4 text-lg font-semibold text-black">
                                  Set API keys
                                </h3>
                                {!allEnvVarsSet && (
                                  <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-100">
                                    <strong>Required:</strong> Please read the
                                    user instructions and set the following API
                                    keys for this integration to work
                                  </div>
                                )}
                                <EnvVarEditor
                                  envVarKeys={envVarKeys}
                                  envVars={backendVars}
                                  envVarDescriptions={Object.fromEntries(
                                    integration.env_variables.map(
                                      (env: any) => [
                                        env.id,
                                        env.description || "",
                                      ],
                                    ),
                                  )}
                                  onChange={(key: string, value: string) =>
                                    handleEnvVarChange("backend", key, value)
                                  }
                                  isSaving={isEnvSaving}
                                  onSave={handleEnvVarSave}
                                />
                                <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-100">
                                  <strong>Note:</strong> These only set backend
                                  API keys. Set frontend keys in the API keys
                                  frontend section.
                                </div>
                              </div>
                            );
                          })()}
                        <div>
                          <h3 className="mb-2 font-medium">
                            User Instructions
                          </h3>
                          <div className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
                            {integration.user_instructions
                              ?.split(/(\bhttps?:\/\/[^\s]+)/g)
                              .map((part: string, index: number) => {
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
                        <div>
                          <h3 className="mb-2 font-medium">Documentation</h3>
                          {integration.documentation_urls &&
                          integration.documentation_urls.length > 0 ? (
                            <ul className="ml-6 list-disc">
                              {integration.documentation_urls.map(
                                (url: string, idx: number) => (
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
                        {/* Images Carousel - moved up */}
                        {integration.images &&
                          integration.images.length > 0 && (
                            <div>
                              <h3 className="mb-2 font-medium">Images</h3>
                              <div className="flex flex-wrap gap-2">
                                {integration.images.map(
                                  (img: string, idx: number) =>
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
                          <h3 className="mb-2 font-medium">Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {integration.tags.map(
                              (tag: string, index: number) => (
                                <span
                                  key={index}
                                  className="rounded-full bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800"
                                >
                                  {tag}
                                </span>
                              ),
                            )}
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
                              className="prose prose-sm group max-w-none cursor-pointer rounded bg-gray-50 p-2 text-xs transition-colors hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800"
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
                        {/* Discord reporting message */}
                        <div className="mt-6 rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-100">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <svg
                                className="h-5 w-5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">
                                Is this integration incorrect?
                              </p>
                              <p className="mt-1">
                                Get it fixed by reporting it in the Discord.
                              </p>
                              <a
                                href="https://discord.gg/2gSmB9DxJW"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                              >
                                Join Discord
                                <svg
                                  className="ml-1 h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              handleRemoveIntegration(integration._id)
                            }
                            className="flex items-center gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove Integration
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                Select an integration to view details
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Dialog */}
      <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add To Chat</DialogTitle>
          </DialogHeader>
          <div className="mb-2 text-sm text-gray-700 dark:text-gray-200">
            Optionally add a message to send to chat to add this integration:
          </div>
          <Textarea
            value={agentUserText}
            onChange={(e) => setAgentUserText(e.target.value)}
            placeholder="Enter any notes or instructions for the agent (optional)"
            rows={4}
            className="mb-4"
            disabled={isAgentAdding}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAgentDialog(false)}
              disabled={isAgentAdding}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAgentDialogSubmit}
              disabled={isAgentAdding}
              className="flex items-center gap-2"
            >
              {isAgentAdding ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : null}
              Add to Chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade dialog for integrations */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upgrade to Use Integrations</DialogTitle>
          </DialogHeader>
          <UpgradePrompt
            featureId="integrations_library"
            hideTitle
            borderless
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
