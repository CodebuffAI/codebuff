import { z } from "zod";
import { Id } from "@/convex/_generated/dataModel";
import {
  readFilesToContextSchema,
  semanticFileSearchSchema,
  executeCommandSchema,
  externalSearchesSchema,
  scrapeLinksSchema,
  addIntegrationSchema,
  fileStringCodeReplaceSchema,
} from "!/coding_agent/agent/tools"; // Updated to use correct schema exports

// Infer types from the Zod schemas
export type ReadFilesToContextToolData = z.infer<
  typeof readFilesToContextSchema
>;
export type SemanticFileSearchToolData = z.infer<
  typeof semanticFileSearchSchema
>;
export type ExecuteCommandToolData = z.infer<typeof executeCommandSchema>;
export type ExternalSearchToolData = z.infer<typeof externalSearchesSchema>;
export type ScrapeLinksToolData = z.infer<typeof scrapeLinksSchema>;
export type AddIntegrationToolData = z.infer<typeof addIntegrationSchema>;
export type FileStringCodeReplaceToolData = z.infer<
  typeof fileStringCodeReplaceSchema
>;

// Integration result types for the new format
export interface IntegrationData {
  reference_id: string;
  title: string;
  description: string;
  env_variables: Array<{ id: string; description: string }>;
  user_instructions?: string;
  llm_instructions?: string;
  documentation_urls?: string[];
}

export interface IntegrationProposalResult {
  type: "integration_proposal";
  integration: IntegrationData;
}

export interface IntegrationEnvVarsNeededResult {
  type: "integration_env_vars_needed";
  integration: IntegrationData;
}

export interface IntegrationReadyResult {
  type: "integration_ready";
  integration: IntegrationData;
}

export interface IntegrationAddedResult {
  type: "integration_added";
  integration: IntegrationData & {
    convex_schema_code?: string;
  };
}

export interface IntegrationAcceptedResult {
  type: "integration_accepted";
  message?: string;
}

export interface IntegrationErrorResult {
  type: "error";
  error: string;
  message?: string;
}

export type IntegrationResult =
  | IntegrationProposalResult
  | IntegrationEnvVarsNeededResult
  | IntegrationReadyResult
  | IntegrationAddedResult
  | IntegrationAcceptedResult
  | IntegrationErrorResult;

// Shared types
export type ToolOutput = {
  stdout: string | null;
  stderr: string | null;
  result: string | null;
};

export type ToolCall = {
  name: string;
  args: any;
};

// Props interfaces for components
export interface ReadFilesToContextToolProps {
  data: ReadFilesToContextToolData;
}

export interface SemanticFileSearchToolProps {
  data: SemanticFileSearchToolData;
}

export interface ExecuteCommandToolProps {
  data: ExecuteCommandToolData;
  isProcessing?: boolean;
  toolOutputs?: ToolOutput[];
}

export interface ExternalSearchToolProps {
  data: ExternalSearchToolData;
}

export interface ScrapeLinksToolProps {
  data: ScrapeLinksToolData;
}

export interface AddIntegrationToUserToolProps {
  data: AddIntegrationToolData;
  toolOutputs?: ToolOutput[];
  isProcessing?: boolean;
  result?: string;
  messageId?: Id<"messages">;
}

// Props for integration-specific components
export interface IntegrationProposalProps {
  integration?: IntegrationData;
  // Legacy props for backward compatibility
  title?: string;
  description?: string;
  llm_instructions?: string;
  env_variables?: Array<{ id: string; description: string }>;
  documentation_urls?: string[];
  integration_id?: string;
  // Handlers
  onAccept?: (integrationId: string) => void;
  onReject?: (integrationId: string) => void;
}

export interface EnvVarsFormProps {
  integration?: IntegrationData;
  // Legacy props for backward compatibility
  integrationTitle?: string;
  env_variables?: Array<{ id: string; description: string }>;
  user_instructions?: string;
  llm_instructions?: string;
  // Handlers
  onSubmit?: (envValues: Record<string, string>) => void;
  onSkip?: () => void;
}

// ... other props interfaces
