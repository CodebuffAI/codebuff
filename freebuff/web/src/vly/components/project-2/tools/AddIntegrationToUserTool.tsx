/**
 * DEPRECATED. no longer used. replaced by addintegrationtool.tsx and env vars display on the chat message itself
 */

import React, { useState, useEffect } from "react";
import { AddIntegrationToUserToolProps } from "./toolTypes";
import {
  Key,
  Eye,
  EyeOff,
  X,
  Loader,
  Shield,
  CheckCircle,
  Search,
  Package,
  Check,
  Lightbulb,
  AlertCircle,
  Copy,
  Database,
  Edit3,
  Save,
} from "lucide-react";
import { useAction } from "convex/react";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";
import { Textarea } from "@/vly/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";

interface IntegrationProposal {
  type: "integration_proposal";
  integration: {
    reference_id: string;
    title: string;
    description: string;
    llm_instructions: string;
    env_variables: Array<{
      id: string;
      description: string;
    }>;
    user_instructions: string;
    documentation_urls: string[];
  };
}

interface IntegrationAdded {
  type: "integration_added";
  integration: {
    reference_id: string;
    title: string;
    description: string;
    convex_schema_code?: string;
  };
}

interface CheckIntegrationsResult {
  type: "check_integrations_result";
  integrations: Array<{
    reference_id: string;
    title: string;
    description: string;
  }>;
}

interface IntegrationAccepted {
  type: "integration_accepted";
  message?: string;
}

interface IntegrationEnvVarsNeeded {
  type: "integration_env_vars_needed";
  integration: {
    reference_id: string;
    title: string;
    description: string;
    env_variables: Array<{
      id: string;
      description: string;
    }>;
    user_instructions: string;
  };
}

interface IntegrationReady {
  type: "integration_ready";
  integration: {
    reference_id: string;
    title: string;
    description: string;
    llm_instructions: string;
  };
}

interface IntegrationError {
  type: "error";
  error: string;
  message?: string;
}

// Backend state tracking based on logs and toolOutputs
interface BackendState {
  phase:
    | "idle"
    | "scanning"
    | "researching"
    | "proposal"
    | "env_setup"
    | "adding"
    | "success"
    | "error";
  isProcessing: boolean;
  integrationProposal?: IntegrationProposal["integration"];
  envVarsNeeded?: IntegrationEnvVarsNeeded["integration"];
  researchProgress?: {
    current_step: number;
    total_steps: number;
    step_description: string;
  };
  error?: string;
  hasScanned?: boolean;
}

const parseBackendResult = (
  result: string,
):
  | IntegrationProposal
  | IntegrationAdded
  | CheckIntegrationsResult
  | IntegrationAccepted
  | IntegrationEnvVarsNeeded
  | IntegrationReady
  | IntegrationError
  | null => {
  if (!result) return null;

  console.log("[AddIntegrationToUserTool] Raw result:", result);

  try {
    let parsedResult;

    // Handle array-wrapped results like ["..."]
    if (
      typeof result === "string" &&
      result.startsWith("[") &&
      result.endsWith("]")
    ) {
      console.log("[AddIntegrationToUserTool] Detected array-wrapped result");
      const arrayResult = JSON.parse(result);
      if (Array.isArray(arrayResult) && arrayResult.length > 0) {
        // Take the first element if it's an array
        const firstElement = arrayResult[0];
        if (typeof firstElement === "string") {
          parsedResult = JSON.parse(firstElement);
        } else {
          parsedResult = firstElement;
        }
      } else {
        throw new Error("Empty array result");
      }
    }
    // Handle double-encoded JSON (wrapped in quotes)
    else if (
      typeof result === "string" &&
      result.startsWith('"') &&
      result.endsWith('"')
    ) {
      // Remove outer quotes and unescape
      const unescaped = result
        .slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      console.log("[AddIntegrationToUserTool] Unescaped result:", unescaped);
      parsedResult = JSON.parse(unescaped);
    } else {
      parsedResult = JSON.parse(result);
    }

    console.log("[AddIntegrationToUserTool] Parsed result:", parsedResult);
    return parsedResult;
  } catch (error) {
    console.error("[AddIntegrationToUserTool] Failed to parse result:", error);
    return null;
  }
};

// Real-time research progress tracking
const ResearchProgress: React.FC<{
  isActive: boolean;
  onComplete?: () => void;
}> = ({ isActive, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const stepDescriptions = [
    "Scanning integration library for existing solutions...",
    "Searching for official documentation...",
    "Performing web search for implementation examples...",
    "Analyzing compatibility and requirements...",
    "Generating integration proposal...",
  ];

  useEffect(() => {
    if (!isActive || isComplete) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= stepDescriptions.length - 1) {
          setIsComplete(true);
          onComplete?.();
          return prev;
        }
        return prev + 1;
      });
    }, 800); // Slower animation for better UX

    return () => clearInterval(interval);
  }, [isActive, isComplete, onComplete, stepDescriptions.length]);

  // Reset when becoming active again
  useEffect(() => {
    if (isActive) {
      setCurrentStep(0);
      setIsComplete(false);
    }
  }, [isActive]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 animate-pulse text-blue-500" />
        <h3 className="text-sm font-medium">Researching Integration</h3>
      </div>

      <div className="space-y-2">
        {stepDescriptions.map((description, index) => (
          <motion.div
            key={index}
            className={`flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors duration-300 ${
              index < currentStep
                ? "border-green-200 bg-green-50"
                : index === currentStep
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200 bg-gray-50"
            }`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            {index < currentStep ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : index === currentStep ? (
              <Loader className="h-4 w-4 animate-spin text-blue-500" />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
            )}
            <span
              className={`${
                index <= currentStep
                  ? "font-medium text-gray-900"
                  : "text-gray-500"
              }`}
            >
              {description}
            </span>
          </motion.div>
        ))}
      </div>

      {isComplete && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 text-sm font-medium text-green-600"
        >
          <CheckCircle className="h-4 w-4" />
          Research complete! Generating proposal...
        </motion.div>
      )}
    </div>
  );
};

// Integration proposal display with accept/reject
const IntegrationProposal: React.FC<{
  proposal: IntegrationProposal["integration"];
  onAccept: () => void;
  onReject: () => void;
  isProcessing?: boolean;
}> = ({ proposal, onAccept, onReject, isProcessing }) => {
  const [showFullInstructions, setShowFullInstructions] = useState(false);
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [editedInstructions, setEditedInstructions] = useState(
    proposal.llm_instructions,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleEditInstructions = () => {
    setIsEditingInstructions(true);
    setEditedInstructions(proposal.llm_instructions);
  };

  const handleSaveInstructions = () => {
    setIsSaving(true);
    // In a real implementation, you would save to backend here
    // For now, we'll just update the local state
    proposal.llm_instructions = editedInstructions;
    setTimeout(() => {
      setIsEditingInstructions(false);
      setIsSaving(false);
    }, 500);
  };

  const handleCancelEdit = () => {
    setIsEditingInstructions(false);
    setEditedInstructions(proposal.llm_instructions);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-yellow-500" />
        <h3 className="text-sm font-medium">Integration Proposal</h3>
      </div>

      <div className="space-y-3 rounded-lg border bg-white p-4">
        <div>
          <h4 className="text-base font-medium">{proposal.title}</h4>
          <p className="mt-1 text-sm text-gray-600">{proposal.description}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Implementation Instructions
            </span>
            <div className="flex items-center gap-2">
              {isEditingInstructions ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="h-7 text-xs"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveInstructions}
                    disabled={isSaving}
                    className="h-7 text-xs"
                  >
                    {isSaving ? (
                      <Loader className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEditInstructions}
                    className="h-7 text-xs"
                  >
                    <Edit3 className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setShowFullInstructions(!showFullInstructions)
                    }
                    className="h-7 text-xs"
                  >
                    {showFullInstructions ? "Hide" : "Show"} Details
                  </Button>
                </>
              )}
            </div>
          </div>

          {(showFullInstructions || isEditingInstructions) && (
            <div className="space-y-2">
              {isEditingInstructions ? (
                <Textarea
                  value={editedInstructions}
                  onChange={(e) => setEditedInstructions(e.target.value)}
                  className="min-h-[300px] font-mono text-xs"
                  placeholder="Enter implementation instructions..."
                  disabled={isSaving}
                />
              ) : (
                <div
                  className="group relative cursor-pointer overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs transition-colors hover:bg-gray-100"
                  onClick={handleEditInstructions}
                >
                  {proposal.llm_instructions}
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <Edit3 className="h-3 w-3 text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {proposal.env_variables && proposal.env_variables.length > 0 && (
          <div>
            <span className="text-sm font-medium">
              Required Environment Variables:
            </span>
            <div className="mt-1 space-y-1">
              {proposal.env_variables.map((envVar) => (
                <div
                  key={envVar.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <Key className="h-3 w-3 text-gray-500" />
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {envVar.id}
                  </code>
                  <span className="text-gray-600">- {envVar.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-3">
          <Button
            onClick={onAccept}
            disabled={isProcessing}
            className="h-8 flex-1 text-sm"
          >
            {isProcessing ? (
              <>
                <Loader className="mr-2 h-3 w-3 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <Check className="mr-2 h-3 w-3" />
                Accept Integration
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isProcessing}
            className="h-8 text-sm"
          >
            <X className="mr-2 h-3 w-3" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
};

// Environment variables setup modal
const EnvVarsSetup: React.FC<{
  envVars: Array<{ id: string; description: string }>;
  onContinue: (envValues: Record<string, string>) => void;
  onSkip: () => void;
  semanticIdentifier: string;
}> = ({ envVars, onContinue, onSkip, semanticIdentifier }) => {
  const setEnvVars = useAction(api.codesandbox.envVars.setEnvVars);
  const getEnvVars = useAction(api.codesandbox.envVars.getEnvVars);
  const [CSBEnvVars, setCSBEnvVars] = useState<{
    frontend: Record<string, string>;
    backend: Record<string, string>;
  } | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const handleENVChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    envVar: { id: string; description: string },
  ) => {
    setCSBEnvVars((prev) => {
      // If prev is null, create a new structure with the new value
      if (!prev) {
        return {
          frontend: {},
          backend: { [envVar.id]: e.target.value },
        };
      }
      // If prev exists, update it normally
      return {
        ...prev,
        backend: { ...prev.backend, [envVar.id]: e.target.value },
      };
    });
    setEnvValues({ ...envValues, [envVar.id]: e.target.value });
  };
  const handleContinue = async () => {
    try {
      // Fetch current environment variables
      const currentVars = await getEnvVars({ semanticIdentifier });

      // Merge current vars with our local CSBEnvVars state
      const mergedVars = {
        frontend: {
          ...(currentVars?.frontend || {}),
          ...(CSBEnvVars?.frontend || {}),
        },
        backend: {
          ...(currentVars?.backend || {}),
          ...(CSBEnvVars?.backend || {}),
        },
      };

      // Save the merged environment variables
      await setEnvVars({ semanticIdentifier, envVars: mergedVars });

      // Continue with the flow
      onContinue(envValues);
    } catch (error) {
      console.error("Failed to save environment variables:", error);
      // Handle error appropriately - maybe show a toast or error message
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-medium">Environment Variables Setup</h3>
      </div>

      <div className="space-y-4 rounded-lg border bg-white p-6">
        <p className="text-gray-600">
          Configure the required environment variables for this integration:
        </p>

        <div className="space-y-3">
          {envVars.map((envVar) => (
            <div key={envVar.id} className="space-y-1">
              <Label
                htmlFor={envVar.id}
                className="flex items-center gap-2 text-sm"
              >
                <Key className="h-3 w-3" />
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                  {envVar.id}
                </code>
              </Label>
              <p className="text-xs text-gray-600">{envVar.description}</p>
              <div className="relative">
                <Input
                  id={envVar.id}
                  type={showValues[envVar.id] ? "text" : "password"}
                  value={envValues[envVar.id] || ""}
                  onChange={(e) => handleENVChange(e, envVar)}
                  placeholder="Enter value..."
                  className="h-8 pr-8 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                  onClick={() =>
                    setShowValues({
                      ...showValues,
                      [envVar.id]: !showValues[envVar.id],
                    })
                  }
                >
                  {showValues[envVar.id] ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-4">
          <Button onClick={handleContinue} className="flex-1">
            <Check className="mr-2 h-4 w-4" />
            Save & Continue
          </Button>
          <Button variant="outline" onClick={onSkip}>
            Skip for Now
          </Button>
        </div>
      </div>
    </div>
  );
};

// Success state with optional schema code
const SuccessState: React.FC<{
  integration: {
    title: string;
    description: string;
    convex_schema_code?: string;
  };
}> = ({ integration }) => {
  const [showSchema, setShowSchema] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <h3 className="text-sm font-medium text-green-700">
          Integration Added Successfully!
        </h3>
      </div>

      <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4">
        <div>
          <h4 className="text-base font-medium">{integration.title}</h4>
          <p className="mt-1 text-sm text-gray-700">
            {integration.description}
          </p>
        </div>

        {integration.convex_schema_code && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-3 w-3" />
                <span className="text-sm font-medium">Convex Schema Code</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSchema(!showSchema)}
                className="h-7 text-xs"
              >
                {showSchema ? "Hide" : "Show"} Schema
              </Button>
            </div>

            {showSchema && (
              <div className="relative">
                <pre className="overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
                  <code>{integration.convex_schema_code}</code>
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-1 top-1 h-6 w-6 p-0 text-gray-400 hover:text-white"
                  onClick={() =>
                    copyToClipboard(integration.convex_schema_code!)
                  }
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Main component
export const AddIntegrationToUserTool: React.FC<
  AddIntegrationToUserToolProps
> = ({ data, isProcessing, result, messageId }) => {
  const params = useParams();
  const projectSemanticIdentifier = params.id as string;

  // Backend state management
  const [backendState, setBackendState] = useState<BackendState>({
    phase: "idle",
    isProcessing: false,
    hasScanned: false,
  });

  // Parse backend result and update state
  useEffect(() => {
    if (!data) return;

    // If we're currently processing, show appropriate phase
    if (isProcessing) {
      if (!result) {
        // Show scanning first for new integrations (only if not already scanned)
        if (!backendState.hasScanned) {
          setBackendState((prev) => ({
            ...prev,
            phase: "scanning",
            isProcessing: true,
          }));
          // After a short delay, transition to researching
          setTimeout(() => {
            setBackendState((prev) => ({
              ...prev,
              phase: "researching",
              hasScanned: true,
            }));
          }, 2000);
        } else {
          // For existing integrations or after scanning, go straight to processing
          setBackendState((prev) => ({
            ...prev,
            phase: "researching",
            isProcessing: true,
          }));
        }
      }
      return;
    }

    // If we have a result, try to parse it
    if (result) {
      const parsedResult = parseBackendResult(result);

      if (parsedResult) {
        switch (parsedResult.type) {
          case "integration_proposal":
            setBackendState({
              phase: "proposal",
              isProcessing: false,
              integrationProposal: parsedResult.integration,
              hasScanned: backendState.hasScanned,
            });
            break;
          case "integration_added":
            setBackendState({
              phase: "success",
              isProcessing: false,
              hasScanned: backendState.hasScanned,
            });
            break;
          case "check_integrations_result":
            setBackendState({
              phase: "success",
              isProcessing: false,
              hasScanned: backendState.hasScanned,
            });
            break;
          case "integration_env_vars_needed":
            setBackendState({
              phase: "env_setup",
              isProcessing: false,
              envVarsNeeded: parsedResult.integration,
              hasScanned: backendState.hasScanned,
            });
            break;
          case "integration_accepted":
            setBackendState({
              phase: "success",
              isProcessing: false,
              hasScanned: backendState.hasScanned,
            });
            break;
          case "integration_ready":
            setBackendState({
              phase: "success",
              isProcessing: false,
              hasScanned: backendState.hasScanned,
            });
            break;
          case "error":
            setBackendState({
              phase: "error",
              isProcessing: false,
              error: parsedResult.error,
              hasScanned: backendState.hasScanned,
            });
            break;
          default:
            setBackendState((prev) => ({
              ...prev,
              isProcessing: false,
              phase: "error",
              error: `Unknown result type: ${(parsedResult as any)?.type || "undefined"}`,
            }));
        }
      } else {
        setBackendState({
          phase: "error",
          isProcessing: false,
          error:
            "Rate limit or error encountered. Please try again in a minute.",
          hasScanned: backendState.hasScanned,
        });
      }
    } else if (!isProcessing) {
      setBackendState((prev) => ({
        ...prev,
        phase: "idle",
        isProcessing: false,
      }));
    }
  }, [result, isProcessing]);

  // Defensive check for undefined data
  if (!data) {
    console.warn(
      "[AddIntegrationToUserTool] Data is undefined, showing error state",
    );
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <h3 className="font-medium text-red-800 dark:text-red-200">
            Integration Tool Error
          </h3>
        </div>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          Unable to load integration data. Please try again or contact support
          if the issue persists.
        </p>
      </div>
    );
  }

  const handleAcceptIntegration = async () => {
    if (
      !backendState.integrationProposal ||
      !messageId ||
      !projectSemanticIdentifier
    )
      return;

    try {
      setBackendState((prev) => ({ ...prev, isProcessing: true }));

      // Update local state to show completion
      setBackendState((prev) => ({
        ...prev,
        phase: "success",
        isProcessing: false,
      }));
    } catch (error) {
      console.error(
        "[AddIntegrationToUserTool] Error accepting integration:",
        error,
      );
      setBackendState((prev) => ({
        ...prev,
        phase: "error",
        error: "Failed to accept integration",
        isProcessing: false,
      }));
    }
  };

  const handleRejectIntegration = async () => {
    if (
      !backendState.integrationProposal ||
      !messageId ||
      !projectSemanticIdentifier
    )
      return;

    try {
      setBackendState((prev) => ({ ...prev, isProcessing: true }));

      // Update local state
      setBackendState((prev) => ({
        ...prev,
        phase: "idle",
        isProcessing: false,
        integrationProposal: undefined,
      }));
    } catch (error) {
      console.error(
        "[AddIntegrationToUserTool] Error rejecting integration:",
        error,
      );
      setBackendState((prev) => ({
        ...prev,
        phase: "error",
        error: "Failed to reject integration",
        isProcessing: false,
      }));
    }
  };

  // Remove the old env handling functions since we're using a different flow
  const handleEnvVarsSetup = async (envValues: Record<string, string>) => {
    if (!backendState.envVarsNeeded || !messageId || !projectSemanticIdentifier)
      return;

    try {
      setBackendState((prev) => ({ ...prev, isProcessing: true }));

      // Update local state to show completion
      setBackendState((prev) => ({
        ...prev,
        phase: "success",
        isProcessing: false,
      }));
    } catch (error) {
      console.error(
        "[AddIntegrationToUserTool] Error setting env vars:",
        error,
      );
      setBackendState((prev) => ({
        ...prev,
        phase: "error",
        error: "Failed to set environment variables",
        isProcessing: false,
      }));
    }
  };

  const handleSkipEnvVars = async () => {
    // Skip env vars and mark as success
    setBackendState((prev) => ({
      ...prev,
      phase: "success",
      isProcessing: false,
    }));
  };

  // Render different states
  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {backendState.phase === "scanning" && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 animate-pulse text-blue-500" />
              <h3 className="text-sm font-medium">
                Scanning Integration Library
              </h3>
            </div>
            <div className="space-y-2">
              <motion.div
                className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Loader className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-sm">
                  Searching for existing integrations...
                </span>
              </motion.div>
              <motion.div
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                <span className="text-sm text-gray-500">
                  Analyzing compatibility requirements...
                </span>
              </motion.div>
            </div>
          </motion.div>
        )}

        {backendState.phase === "researching" && (
          <motion.div
            key="researching"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <ResearchProgress
              isActive={true}
              onComplete={() => {}} // State updates happen via result parsing
            />
          </motion.div>
        )}

        {backendState.phase === "proposal" &&
          backendState.integrationProposal && (
            <motion.div
              key="proposal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <IntegrationProposal
                proposal={backendState.integrationProposal}
                onAccept={handleAcceptIntegration}
                onReject={handleRejectIntegration}
                isProcessing={backendState.isProcessing}
              />
            </motion.div>
          )}

        {backendState.phase === "env_setup" && backendState.envVarsNeeded && (
          <motion.div
            key="env_setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <EnvVarsSetup
              envVars={backendState.envVarsNeeded.env_variables}
              onContinue={handleEnvVarsSetup}
              onSkip={handleSkipEnvVars}
              semanticIdentifier={projectSemanticIdentifier}
            />
          </motion.div>
        )}

        {backendState.phase === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <SuccessState
              integration={{
                title:
                  backendState.integrationProposal?.title ||
                  backendState.envVarsNeeded?.title ||
                  "Integration",
                description:
                  backendState.integrationProposal?.description ||
                  backendState.envVarsNeeded?.description ||
                  "Integration successfully added!",
                convex_schema_code: undefined,
              }}
            />
          </motion.div>
        )}

        {backendState.phase === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <h3 className="text-sm font-medium">Error</h3>
            </div>
            <p className="mt-2 text-sm text-red-600">{backendState.error}</p>
          </motion.div>
        )}

        {backendState.phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-medium">Integration Tool Ready</h3>
            </div>
            <p className="text-xs text-gray-600">
              Waiting for integration request...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
