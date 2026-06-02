"use client";
import React from "react";
import { Loader } from "lucide-react";
import { ExecuteCommandTool } from "./tools/ExecuteCommandTool";
import { ReadFilesToContextTool } from "./tools/ReadFilesToContextTool";
import { SemanticFileSearchTool } from "./tools/SemanticFileSearchTool";
import { ExternalSearchTool } from "./tools/ExternalSearchTool";
import { ScrapeWebsiteTool } from "./tools/ScrapeWebsiteTool";
import { FileStringCodeReplaceTool } from "./tools/FileStringCodeReplaceTool";
import { AllToolCalls } from "@/convex/coding_agent/agent/tools";
import { Package } from "lucide-react";
import {
  ExecuteCommandToolData,
  ReadFilesToContextToolData,
  SemanticFileSearchToolData,
  ExternalSearchToolData,
  ScrapeLinksToolData,
  AddIntegrationToolData,
  FileStringCodeReplaceToolData,
  ToolOutput,
} from "./tools/toolTypes";

interface ToolComponentSelectorProps {
  toolCall: AllToolCalls[0]; // Single tool call from AllToolCalls array
  isProcessing?: boolean;
  toolOutputs?: ToolOutput[];
  result?: string; // Add result prop to determine if tool is complete
  messageId?: string; // Add messageId prop for integrations
}

// Legacy interface for backward compatibility
interface LegacyToolComponentSelectorProps {
  toolName: string;
  toolArgs: string;
  isProcessing?: boolean;
  toolOutputs?: ToolOutput[];
  result?: string;
  messageId?: string;
}

// Component that accepts the new AllToolCalls format
export const ToolComponentSelector: React.FC<ToolComponentSelectorProps> = ({
  toolCall,
  isProcessing,
  toolOutputs,
  result,
  messageId,
}) => {
  // Handle case where toolCall is missing required properties
  if (!toolCall || !toolCall.toolName) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs">
        <div className="flex items-center gap-2">
          <Loader className="h-3 w-3 animate-spin" />
          <div className="font-medium text-zinc-800">Loading tool...</div>
        </div>
      </div>
    );
  }

  // Handle tool display (collapsible content only)
  switch (toolCall.toolName) {
    case "executeCommandTool":
      return (
        <ExecuteCommandTool
          data={toolCall.input as ExecuteCommandToolData}
          isProcessing={isProcessing}
          toolOutputs={toolOutputs}
        />
      );
    case "readFilesToContextTool":
      return (
        <ReadFilesToContextTool
          data={toolCall.input as ReadFilesToContextToolData}
        />
      );
    case "semanticFileSearchTool":
      return (
        <SemanticFileSearchTool
          data={toolCall.input as SemanticFileSearchToolData}
        />
      );
    case "externalSearchesTool":
      return (
        <ExternalSearchTool data={toolCall.input as ExternalSearchToolData} />
      );
    case "scrapeLinksTool":
      return <ScrapeWebsiteTool data={toolCall.input as ScrapeLinksToolData} />;
    case "fileStringCodeReplaceTool":
      return (
        <FileStringCodeReplaceTool
          data={toolCall.input as FileStringCodeReplaceToolData}
          isProcessing={isProcessing}
        />
      );

    case "addIntegrationTool": {
      const integrationData = toolCall.input as AddIntegrationToolData;

      return (
        <div className="rounded-md border border-purple-200 bg-purple-50/50">
          <div className="flex w-full items-center gap-2 p-2.5 text-left">
            <Package className="h-3.5 w-3.5 flex-shrink-0 text-purple-600" />
            <span className="text-xs font-medium text-purple-900">
              Adding Integration
            </span>
            {isProcessing && (
              <span className="ml-auto text-[11px] italic text-purple-600">
                Researching...
              </span>
            )}
          </div>
          <div className="border-t border-purple-200 p-2.5 pt-2">
            <div className="text-[11px] leading-relaxed text-gray-600">
              {integrationData.integration_description}
            </div>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs">
          <div className="flex items-center gap-2">
            {isProcessing && <Loader className="h-3 w-3 animate-spin" />}
            <div className="font-medium text-zinc-800">{toolCall.toolName}</div>
          </div>
          <div className="mt-1 text-zinc-600">
            {isProcessing ? "Processing..." : "Tool execution completed"}
          </div>
        </div>
      );
  }
};

// Legacy component for backward compatibility
export const LegacyToolComponentSelector: React.FC<
  LegacyToolComponentSelectorProps
> = ({ toolName, toolArgs, isProcessing, toolOutputs, result, messageId }) => {
  let parsedArgs;
  try {
    parsedArgs = JSON.parse(toolArgs);
  } catch (error) {
    return (
      <div className="text-xs text-red-500">
        Error parsing tool arguments: {String(error)}
      </div>
    );
  }

  // Create a tool call object to match the new format
  const toolCall: AllToolCalls[0] = {
    type: "tool-call",
    toolCallId: "legacy",
    toolName: toolName as any, // Type assertion needed for legacy compatibility
    input: parsedArgs,
  };

  return (
    <ToolComponentSelector
      toolCall={toolCall}
      isProcessing={isProcessing}
      toolOutputs={toolOutputs}
      result={result}
      messageId={messageId}
    />
  );
};
