import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FunctionReturnType } from "convex/server";
import { getImageUrl } from "@/vly/lib/image-utils";
import {
  Code,
  ChevronsUpDown,
  Loader,
  CheckCircle,
  X,
  Download,
} from "lucide-react";
import React from "react";
import { ThinkingState } from "./ThinkingState";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";
import { FileEdit, MessagePart, parseAIOutput } from "@/vly/lib/partial-parser";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/vly/components/ui/collapsible";
// Lazy load syntax highlighter to reduce bundle size
import dynamic from "next/dynamic";

// Dynamic import with loading fallback
const CodeHighlighter = dynamic(
  () => import("./CodeHighlighter").then((mod) => mod.CodeHighlighter),
  {
    loading: () => (
      <div className="animate-pulse rounded bg-gray-100 p-4">
        <div className="mb-2 h-4 w-3/4 rounded bg-gray-200"></div>
        <div className="h-4 w-1/2 rounded bg-gray-200"></div>
      </div>
    ),
  },
);
import { CustomMarkdown } from "./CustomMarkdown";
import { useQuery } from "convex/react";
import { MessageState } from "./MessageState";
import {
  Package,
  ImageIcon as ImageIconLucide,
  FileText,
  File,
} from "lucide-react";
import { useAssetsCache } from "@/vly/hooks/useAssetsCache";
import { EnvVarEditor } from "./EnvVarsDialog";
import { useAction } from "convex/react";
import { toast } from "sonner";

type Message = FunctionReturnType<typeof api.project.getThreadMessages>[number];

type ExecutionDetails = FunctionReturnType<
  typeof api.project.getMessageExecutionDetails
>;

/** User rows may include core_message; assistant rows omit it from the API — widen for display. */
type MessageWithOptionalCore = Message & { core_message?: string };

interface ChatMessageProps {
  message: Message;
  onRollback?: () => Promise<void>;
  shouldShowLoadingState: boolean;
  loadingActivityKey?: string;
  onSendMessage?: (message: string) => void;
  projectSemanticIdentifier?: string;
}

const UserMessageContent: React.FC<{
  message: Message;
  projectSemanticIdentifier?: string;
}> = ({ message, projectSemanticIdentifier }) => {
  let selectionBadge = null;
  const m = message as MessageWithOptionalCore;
  let content = m.core_message || m.content || "";
  if (content && content.startsWith("Selected node:")) {
    const firstLineEnd = content.indexOf("\n");
    const firstLine =
      firstLineEnd !== -1 ? content.slice(0, firstLineEnd) : content;
    content = firstLineEnd !== -1 ? content.slice(firstLineEnd + 1) : "";
    const badgeText = firstLine
      .replace("Selected node: ", "")
      .replace(/\(selector: ([^)]+)\)/, (m, sel) => `· ${sel}`);
    selectionBadge = (
      <div
        className="mb-1 inline-flex items-center gap-1 truncate rounded border border-[#7CFF3F]/30 bg-[#7CFF3F]/10 px-2 py-0.5 text-xs font-medium text-[#7CFF3F] shadow-sm dark:border-[#575757] dark:bg-[#282828] dark:text-zinc-100"
        style={{ maxWidth: 200 }}
        title={firstLine.replace("Selected node: ", "")}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="flex-shrink-0"
        >
          <circle
            cx="10"
            cy="10"
            r="8"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <line
            x1="10"
            y1="2"
            x2="10"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="10"
            y1="14"
            x2="10"
            y2="18"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="2"
            y1="10"
            x2="6"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="14"
            y1="10"
            x2="18"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="10" cy="10" r="2" fill="currentColor" />
        </svg>
        {badgeText}
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[320px] rounded-lg border border-gray-200 bg-white p-2">
        {selectionBadge}
        {content && (
          <div className="text-xs leading-tight text-zinc-800">
            <TextPart
              text={content}
              projectSemanticIdentifier={projectSemanticIdentifier}
              isUserMessage={true}
            />
          </div>
        )}
        {message.images && message.images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.images.map((storageId, index) => (
              <MessageImage key={index} storageId={storageId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const FastReturnPreviewMessage: React.FC<{
  text: string;
  projectSemanticIdentifier?: string;
}> = ({ text, projectSemanticIdentifier }) => {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return null;
  }

  return (
    <div className="mt-3 flex w-full flex-col items-start">
      <div className="w-full max-w-[520px]">
        <TextPart
          text={trimmedText}
          projectSemanticIdentifier={projectSemanticIdentifier}
        />
      </div>
    </div>
  );
};

const MessageImage: React.FC<{ storageId: Id<"_storage"> }> = ({
  storageId,
}) => {
  const imageUrl = getImageUrl(storageId);

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `message-image-${storageId}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <img
          src={imageUrl}
          alt="Message attachment"
          className="h-16 w-16 cursor-pointer select-none rounded-lg border border-border object-cover transition-opacity hover:opacity-80"
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl border-0 bg-transparent p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Message Image</DialogTitle>
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

const FilePart: React.FC<{ file: FileEdit }> = ({ file }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="rounded-lg border border-gray-300/60 bg-white/60 text-sm">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger className="w-full p-1.5 text-left text-xs">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!file.isComplete && <Loader className="h-4 w-4 animate-spin" />}
              <span className="font-bold">{file.type.toLocaleUpperCase()}</span>
              <span className="italic text-zinc-600">{file.path}</span>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-zinc-500" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto rounded-b-lg bg-slate-50/30 text-xs">
            {isExpanded && (
              <CodeHighlighter
                language="typescript"
                customStyle={{
                  padding: "0.25rem 0.5rem",
                  margin: 0,
                  background: "transparent",
                }}
              >
                {file.content}
              </CodeHighlighter>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

// Component to parse and render enhanced mention markers
const MentionText: React.FC<{
  text: string;
  projectSemanticIdentifier?: string;
}> = ({ text, projectSemanticIdentifier }) => {
  // Get assets and integrations data
  const { assets } = useAssetsCache(projectSemanticIdentifier || "");
  const integrations = useQuery(
    api.integrations.getProjectIntegrations,
    projectSemanticIdentifier
      ? { semanticIdentifier: projectSemanticIdentifier }
      : "skip",
  );

  // Parse enhanced mention markers @[id:name:type]
  const parseMentions = (text: string) => {
    const parts = text.split(/(@\[[^\]]+\])/g);

    return parts.map((part, index) => {
      const mentionMatch = part.match(/^@\[([^:]+):([^:]+):([^:]+)\]$/);
      if (mentionMatch) {
        const [, mentionId, mentionName, mentionType] = mentionMatch;

        if (mentionType === "asset") {
          const asset = assets.find((a) => a.id === mentionId);
          if (asset) {
            const Icon = getFileIcon(asset.fileType);
            const iconColor = getFileIconColor(asset.fileType);

            return (
              <span
                key={index}
                className="mx-0.5 inline-flex cursor-pointer items-center gap-0.5 rounded bg-blue-100 px-1 py-px align-middle text-xs text-blue-900 transition-colors hover:bg-blue-200"
                title={`Asset: ${asset.fileName}${asset.description ? ` - ${asset.description}` : ""}`}
                onClick={() => {
                  console.log("Clicked asset:", asset);
                }}
              >
                <Icon size={10} className={iconColor} />
                <span className="font-medium">@{mentionName}</span>
              </span>
            );
          }
        } else if (mentionType === "integration") {
          const integration = integrations?.find((i) => i._id === mentionId);
          if (integration) {
            return (
              <span
                key={index}
                className="mx-0.5 inline-flex cursor-pointer items-center gap-0.5 rounded bg-purple-100 px-1 py-px align-middle text-xs text-purple-900 transition-colors hover:bg-purple-200"
                title={`Integration: ${integration.title}${integration.description ? ` - ${integration.description}` : ""}`}
                onClick={() => {
                  console.log("Clicked integration:", integration);
                }}
              >
                <Package size={10} className="text-purple-500" />
                <span className="font-medium">@{mentionName}</span>
              </span>
            );
          }
        }

        // If asset/integration not found, render the name only
        return (
          <span key={index} className="text-gray-500">
            @{mentionName}
          </span>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="my-1 text-xs leading-normal text-zinc-800">
      {parseMentions(text)}
    </div>
  );
};

// Helper function to get file icon based on type
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

const TextPart: React.FC<{
  text: string;
  projectSemanticIdentifier?: string;
  isUserMessage?: boolean;
}> = ({ text, projectSemanticIdentifier }) => {
  // Check if text contains enhanced mention markers
  const hasMentions = /@\[[^\]]+\]/.test(text);

  if (hasMentions && projectSemanticIdentifier) {
    return (
      <MentionText
        text={text}
        projectSemanticIdentifier={projectSemanticIdentifier}
      />
    );
  }

  return (
    <div className="my-1 text-xs leading-normal text-zinc-800">
      <CustomMarkdown text={text} />
    </div>
  );
};

const MessageParts: React.FC<{
  messageParts: MessagePart[];
  projectSemanticIdentifier?: string;
  isUserMessage?: boolean;
  onRollback?: () => Promise<void>;
}> = ({ messageParts, projectSemanticIdentifier, isUserMessage }) => {
  return (
    <div className="flex flex-col gap-2">
      {messageParts.map((part, idx) => {
        if (part.type === "text") {
          return (
            <div key={`text-${idx}-${part.data.slice(0, 16)}`}>
              <TextPart
                text={part.data}
                projectSemanticIdentifier={projectSemanticIdentifier}
                isUserMessage={isUserMessage}
              />
            </div>
          );
        }
        if (part.type === "file") {
          return (
            <FilePart key={`file-${idx}-${part.data.path}`} file={part.data} />
          );
        }
        return null;
      })}
    </div>
  );
};

// Helper function to format credits in thousands (10k, 100k, 1M)
const formatCreditsDisplay = (credits: number): string => {
  if (credits < 1000) {
    return `${credits} credits`;
  } else if (credits < 1000000) {
    const k = credits / 1000;
    return k >= 100
      ? `${Math.round(k)}k credits`
      : `${k.toFixed(1).replace(/\.0$/, "")}k credits`;
  } else {
    const m = credits / 1000000;
    return `${m.toFixed(1).replace(/\.0$/, "")}M credits`;
  }
};

const formatCompactNumber = (value: number): string => {
  if (value < 1000) {
    return `${value}`;
  }
  if (value < 1000000) {
    const k = value / 1000;
    return k >= 100
      ? `${Math.round(k)}k`
      : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  const m = value / 1000000;
  return `${m.toFixed(1).replace(/\.0$/, "")}M`;
};

const formatTokenUsageDisplay = (
  usage:
    | {
        input_tokens?: number;
        cached_input_tokens?: number;
        output_tokens?: number;
        reasoning_tokens?: number;
      }
    | undefined,
): string | null => {
  if (!usage) {
    return null;
  }

  const parts: string[] = [];
  const totalInputTokens = usage.input_tokens ?? 0;
  const cachedInputTokens = usage.cached_input_tokens ?? 0;
  const uncachedInputTokens = Math.max(totalInputTokens - cachedInputTokens, 0);

  if (cachedInputTokens > 0) {
    parts.push(`${formatCompactNumber(cachedInputTokens)} cached`);
  }
  if (uncachedInputTokens > 0) {
    parts.push(`${formatCompactNumber(uncachedInputTokens)} uncached`);
  }
  if ((usage.output_tokens ?? 0) > 0) {
    parts.push(`${formatCompactNumber(usage.output_tokens ?? 0)} out`);
  }
  if ((usage.reasoning_tokens ?? 0) > 0) {
    parts.push(`${formatCompactNumber(usage.reasoning_tokens ?? 0)} reasoning`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
};

const formatUsdDisplay = (costUsd: number | undefined): string | null => {
  if (costUsd === undefined || costUsd <= 0) {
    return null;
  }

  if (costUsd >= 1) {
    return `$${costUsd.toFixed(2)}`;
  }
  if (costUsd >= 0.1) {
    return `$${costUsd.toFixed(3)}`;
  }
  if (costUsd >= 0.01) {
    return `$${costUsd.toFixed(4)}`;
  }
  if (costUsd >= 0.001) {
    return `$${costUsd.toFixed(5)}`;
  }

  return `$${costUsd.toExponential(2)}`;
};

type MessageUsageSummary = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
};

const getMessageUsageSummary = (message: {
  usage_breakdown?: MessageUsageSummary;
  token_usage?: Array<{ input_tokens?: number; output_tokens?: number }>;
}): MessageUsageSummary | undefined => {
  const usageBreakdown = message.usage_breakdown;

  if (usageBreakdown) {
    return usageBreakdown;
  }

  const legacyTokenUsage = (message.token_usage ?? []) as Array<{
    input_tokens?: number;
    output_tokens?: number;
  }>;

  if (!legacyTokenUsage.length) {
    return undefined;
  }

  return legacyTokenUsage.reduce<MessageUsageSummary>(
    (acc, entry) => ({
      input_tokens: (acc.input_tokens ?? 0) + (entry.input_tokens ?? 0),
      cached_input_tokens: acc.cached_input_tokens ?? 0,
      output_tokens: (acc.output_tokens ?? 0) + (entry.output_tokens ?? 0),
      reasoning_tokens: acc.reasoning_tokens ?? 0,
    }),
    {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
    },
  );
};

const hasMeaningfulText = (value: string | undefined | null): boolean =>
  !!value?.trim();

const humanizeActivityLabel = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getActivityToolNames = (details: ExecutionDetails | undefined) => {
  const names: string[] = [];

  const addName = (name: unknown) => {
    if (typeof name !== "string") return;
    const trimmed = name.trim();
    if (trimmed && !names.includes(trimmed)) {
      names.push(trimmed);
    }
  };

  if (details?.tool_call) {
    addName(details.tool_call);
  }

  if (!details?.object) {
    return names;
  }

  try {
    const parsed = JSON.parse(details.object);
    const objects = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of objects) {
      if (item && typeof item === "object" && "toolName" in item) {
        addName((item as { toolName?: unknown }).toolName);
      }
    }
  } catch {
    // Legacy tool payloads are not always JSON. details.tool_call covers those.
  }

  return names;
};

const ActivitySummary: React.FC<{
  details: ExecutionDetails | undefined;
  isActive: boolean;
}> = ({ details, isActive }) => {
  const toolNames = React.useMemo(() => getActivityToolNames(details), [details]);
  const statusItems = [
    details?.error_check ? "Error check" : null,
    details?.result ? "Result" : null,
  ].filter(Boolean) as string[];
  const activityLabels = details
    ? [...toolNames.map(humanizeActivityLabel), ...statusItems]
    : ["Loading details"];
  const summary = activityLabels.length ? activityLabels.join(", ") : "Running";

  return (
    <div className="mt-2 flex max-w-full items-center gap-2 overflow-hidden text-xs text-zinc-500">
      <Code className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <span
        className={`min-w-0 truncate font-medium text-zinc-500 ${
          isActive ? "animate-pulse" : ""
        }`}
        title={summary}
      >
        {summary}
      </span>
    </div>
  );
};

const MessageStateDisplay: React.FC<{
  status: string;
  message?: string;
  color?: string;
  timestamp?: number;
}> = ({ status, message, color, timestamp }) => (
  <div className="mt-2">
    <MessageState
      status={status as any}
      message={message}
      color={color as any}
      timestamp={timestamp}
      subtle={true}
    />
  </div>
);

// Integration Setup Panel Component
const IntegrationSetupPanel: React.FC<{
  integration: FunctionReturnType<
    typeof api.integrations.getIntegrationsByIds
  >[number];
  editedEnvVars: Record<string, string>;
  isEnvSaving: boolean;
  onEnvVarChange: (key: string, value: string) => void;
  onEnvVarSave: () => void;
}> = ({
  integration,
  editedEnvVars,
  isEnvSaving,
  onEnvVarChange,
  onEnvVarSave,
}) => {
  return (
    <div className="mt-3 rounded-md border border-purple-200 bg-gradient-to-b from-purple-50/60 to-white p-3.5">
      <div className="mb-3 flex items-center gap-2 border-b border-purple-200 pb-2">
        <Package className="h-4 w-4 text-purple-600" />
        <h4 className="text-sm font-semibold text-purple-900">
          {integration.title} Setup
        </h4>
      </div>

      {/* User Instructions */}
      {integration.user_instructions && (
        <div className="mb-3">
          <h5 className="mb-1.5 text-xs font-semibold text-gray-700">
            Setup Instructions
          </h5>
          <div className="rounded-md bg-gray-50 p-2.5 text-[11px] leading-relaxed text-gray-700">
            <CustomMarkdown text={integration.user_instructions} />
          </div>
        </div>
      )}

      {/* Environment Variables */}
      {integration.env_variables && integration.env_variables.length > 0 && (
        <div>
          <h5 className="mb-2 text-xs font-semibold text-gray-700">
            Required API Keys
          </h5>
          {(() => {
            const envVarKeys = integration.env_variables.map(
              (env: { id: string; description: string }) => env.id,
            );
            const allEnvVarsSet = envVarKeys.every(
              (key: string) =>
                editedEnvVars[key] && editedEnvVars[key].trim() !== "",
            );

            return (
              <>
                {!allEnvVarsSet && (
                  <div className="mb-3 rounded border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-900">
                    <strong>Required:</strong> Set the API keys below for this
                    integration to work
                  </div>
                )}
                <EnvVarEditor
                  envVarKeys={envVarKeys}
                  envVars={editedEnvVars}
                  envVarDescriptions={Object.fromEntries(
                    integration.env_variables.map(
                      (env: { id: string; description: string }) => [
                        env.id,
                        env.description || "",
                      ],
                    ),
                  )}
                  onChange={onEnvVarChange}
                  isSaving={isEnvSaving}
                  onSave={onEnvVarSave}
                />
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const AssistantMessageContent: React.FC<{
  message: Message;
  shouldShowLoadingState: boolean;
  loadingActivityKey?: string;
  onSendMessage?: (message: string) => void;
  projectSemanticIdentifier?: string;
  onRollback?: () => Promise<void>;
}> = ({
  message,
  shouldShowLoadingState,
  loadingActivityKey,
  projectSemanticIdentifier,
  onRollback,
}) => {
  // Move all hooks here, outside of any conditionals
  const messageContent = (message.content as string) || "";
  const messageParts = React.useMemo(
    () => parseAIOutput(messageContent),
    [messageContent],
  );

  // Query all integrations attached to message (batch query to avoid N+1 problem)
  const integrationIds = message.integration_references || [];
  const integrations = useQuery(
    api.integrations.getIntegrationsByIds,
    integrationIds.length > 0 ? { integrationIds } : "skip",
  );

  // Env vars state for all integrations (keyed by integration ID)
  const [editedEnvVars, setEditedEnvVars] = React.useState<
    Record<string, string>
  >({});
  const [isEnvSaving, setIsEnvSaving] = React.useState(false);
  const getEnvVars = useAction(api.codesandbox.envVars.getEnvVars);
  const setEnvVars = useAction(api.codesandbox.envVars.setEnvVars);

  // Load env vars when integrations are available
  React.useEffect(() => {
    if (integrationIds.length > 0 && projectSemanticIdentifier) {
      getEnvVars({ semanticIdentifier: projectSemanticIdentifier }).then(
        (vars) => {
          setEditedEnvVars(vars.backend);
        },
      );
    }
  }, [integrationIds.length, projectSemanticIdentifier, getEnvVars]);

  const handleEnvVarChange = (key: string, value: string) => {
    setEditedEnvVars((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleEnvVarSave = async () => {
    if (!projectSemanticIdentifier) return;
    setIsEnvSaving(true);
    try {
      await setEnvVars({
        semanticIdentifier: projectSemanticIdentifier,
        envVars: {
          frontend: {},
          backend: editedEnvVars,
        },
      });
      toast.success("API keys saved successfully");
    } catch {
      toast.error("Failed to save API keys");
    } finally {
      setIsEnvSaving(false);
    }
  };

  const hasExecutionDetails = !!(message as any).has_execution_details;
  const hasThinking = !!(message as any).has_thinking;
  const hasUsage = !!(message as any).has_usage;

  const isActiveState = [
    "streaming",
    "thinking",
    "processing_tools",
    "checking_errors",
  ].includes(message.message_state?.status ?? "");

  const [showThinking, setShowThinking] = React.useState(false);

  // Load details for compact activity/reasoning summaries as they stream in.
  const shouldLoadDetails =
    hasThinking || hasExecutionDetails || hasUsage || isActiveState;
  const details = useQuery(
    api.project.getMessageExecutionDetails,
    shouldLoadDetails && (hasThinking || hasExecutionDetails || hasUsage)
      ? { messageId: message._id }
      : "skip",
  );

  const tokenUsageDisplay = details
    ? formatTokenUsageDisplay(getMessageUsageSummary(details as any))
    : null;
  const totalCostDisplay = details
    ? formatUsdDisplay(details.total_cost_usd as number | undefined)
    : null;

  const thinkingPreview = React.useMemo(() => {
    if (!hasThinking || !details?.thinking) return "";
    const flatThinking = details.thinking.replace(/\s+/g, " ").trim();
    if (!flatThinking) return "";
    return flatThinking.length > 90
      ? `${flatThinking.slice(0, 90)}...`
      : flatThinking;
  }, [hasThinking, details?.thinking]);

  if (shouldShowLoadingState) {
    return <ThinkingState activityKey={loadingActivityKey} />;
  }

  return (
    <div className="space-y-1">
      {hasThinking && (
        <Collapsible open={showThinking} onOpenChange={setShowThinking}>
          <CollapsibleTrigger className="group mt-1 inline-flex max-w-full items-center gap-2 text-left text-xs text-zinc-500 transition-colors hover:text-zinc-600">
            <span className="shrink-0 font-medium">Reasoning</span>
            <span className="min-w-0 truncate text-zinc-400">
              {thinkingPreview || "Loading reasoning..."}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 border-l border-zinc-200/80 pl-2.5 text-[11px] leading-relaxed text-zinc-500">
              <div className="whitespace-pre-wrap">
                {details?.thinking ?? ""}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {messageContent && (
        <MessageParts
          messageParts={messageParts}
          projectSemanticIdentifier={projectSemanticIdentifier}
          isUserMessage={false}
          onRollback={onRollback}
        />
      )}
      {onRollback && (
        <div className="mt-2">
          <span className="flex w-fit items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-xs text-green-600">
            <CheckCircle className="h-3 w-3" />
            Checkpoint
          </span>
        </div>
      )}
      {hasExecutionDetails && (
        <ActivitySummary details={details} isActive={isActiveState} />
      )}

      {/* Message State Display - always visible when present, even during streaming */}
      {message.message_state && (
        <MessageStateDisplay
          status={message.message_state.status}
          message={message.message_state.message}
          color={message.message_state.color}
          timestamp={message.message_state.timestamp}
        />
      )}

      {/* Integration Setup Panels - Show one for each attached integration */}
      {integrations?.map((integration) => (
        <IntegrationSetupPanel
          key={integration._id}
          integration={integration}
          editedEnvVars={editedEnvVars}
          isEnvSaving={isEnvSaving}
          onEnvVarChange={handleEnvVarChange}
          onEnvVarSave={handleEnvVarSave}
        />
      ))}

      {/* Credits usage display - show actual deducted credits */}
      {hasUsage &&
        details &&
        (tokenUsageDisplay ||
          totalCostDisplay ||
          (details.credits_deducted !== undefined &&
            details.credits_deducted > 0)) && (
          <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] text-zinc-400">
            {tokenUsageDisplay && <span>{tokenUsageDisplay}</span>}
            {totalCostDisplay && <span>{totalCostDisplay}</span>}
            {details.credits_deducted !== undefined &&
              details.credits_deducted > 0 && (
                <span>{formatCreditsDisplay(details.credits_deducted)}</span>
              )}
          </div>
        )}
    </div>
  );
};

const getMessageStateSignature = (message: Message) => {
  const state = message.message_state;
  if (!state) return "";
  return `${state.status ?? ""}:${state.message ?? ""}:${state.color ?? ""}:${state.timestamp ?? ""}`;
};

const getMessageRenderSignature = (message: Message) => {
  const images = message.images?.join(",") ?? "";
  const integrationRefs =
    ((message as any).integration_references as string[] | undefined)?.join(
      ",",
    ) ?? "";
  const fastReturnPreview =
    ((message as any).fast_return_preview as string | undefined) ?? "";
  const optionalCore = ((message as MessageWithOptionalCore).core_message ??
    "") as string;

  return [
    message.role,
    message.date,
    message.content ?? "",
    optionalCore,
    message.commit_hash ?? "",
    message.streaming ? "1" : "0",
    getMessageStateSignature(message),
    (message as any).has_execution_details ? "1" : "0",
    (message as any).has_thinking ? "1" : "0",
    (message as any).has_usage ? "1" : "0",
    images,
    integrationRefs,
    fastReturnPreview,
  ].join("|");
};

const areChatMessagePropsEqual = (
  prev: ChatMessageProps,
  next: ChatMessageProps,
) => {
  if (prev.message._id !== next.message._id) return false;

  if (
    getMessageRenderSignature(prev.message) !==
    getMessageRenderSignature(next.message)
  ) {
    return false;
  }

  if (prev.shouldShowLoadingState !== next.shouldShowLoadingState) return false;

  if (
    (prev.shouldShowLoadingState || next.shouldShowLoadingState) &&
    prev.loadingActivityKey !== next.loadingActivityKey
  ) {
    return false;
  }

  if (!!prev.onRollback !== !!next.onRollback) return false;

  if (prev.projectSemanticIdentifier !== next.projectSemanticIdentifier) {
    return false;
  }

  return true;
};

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  onRollback,
  shouldShowLoadingState,
  loadingActivityKey,
  onSendMessage,
  projectSemanticIdentifier,
}) => {
  const isUserMessage = message.role === "user";

  if (isUserMessage) {
    const fastReturnPreview =
      ((message as any).fast_return_preview as string | undefined)?.trim() ??
      "";

    return (
      <div className="mb-6 w-full">
        <div className="flex w-full justify-end">
          <UserMessageContent
            message={message}
            projectSemanticIdentifier={projectSemanticIdentifier}
          />
        </div>
        {fastReturnPreview && (
          <FastReturnPreviewMessage
            text={fastReturnPreview}
            projectSemanticIdentifier={projectSemanticIdentifier}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 flex w-full flex-col items-start">
      <div className="w-full">
        <AssistantMessageContent
          message={message}
          shouldShowLoadingState={shouldShowLoadingState}
          loadingActivityKey={loadingActivityKey}
          onSendMessage={onSendMessage}
          projectSemanticIdentifier={projectSemanticIdentifier}
          onRollback={onRollback}
        />
      </div>
    </div>
  );
};

export const ChatMessage = React.memo(ChatMessageComponent, areChatMessagePropsEqual);
