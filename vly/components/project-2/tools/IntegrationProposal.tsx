import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Key, FileText, CheckCircle, X } from "lucide-react";

interface IntegrationData {
  reference_id: string;
  title: string;
  description: string;
  llm_instructions?: string;
  user_instructions?: string;
  env_variables: Array<{ id: string; description: string }>;
  documentation_urls: string[];
}

interface IntegrationProposalProps {
  // Support both old format (direct props) and new format (wrapped in integration object)
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

export function IntegrationProposal({
  integration,
  title: legacyTitle,
  description: legacyDescription,
  llm_instructions: legacyLlmInstructions,
  env_variables: legacyEnvVariables,
  documentation_urls: legacyDocumentationUrls,
  integration_id: legacyIntegrationId,
  onAccept,
  onReject,
}: IntegrationProposalProps) {
  // Use new format if available, otherwise fall back to legacy props
  const data = integration || {
    reference_id: legacyIntegrationId || "",
    title: legacyTitle || "",
    description: legacyDescription || "",
    llm_instructions: legacyLlmInstructions || "",
    user_instructions: "",
    env_variables: legacyEnvVariables || [],
    documentation_urls: legacyDocumentationUrls || [],
  };

  const handleAccept = () => {
    // Send a message to accept the integration
    if (onAccept) {
      onAccept(data.reference_id);
    } else {
      // Default behavior: send a message that the agent will process
      // In a real chat implementation, this would send a message to the chat
      console.log(`User message: Accept integration: ${data.reference_id}`);
      // You would call something like: sendMessage(`Accept integration: ${data.reference_id}`)
    }
  };

  const handleReject = () => {
    // Send a message to reject the integration
    if (onReject) {
      onReject(data.reference_id);
    } else {
      // Default behavior: send a message that the agent will process
      console.log(`User message: Reject integration: ${data.reference_id}`);
      // You would call something like: sendMessage(`Reject integration: ${data.reference_id}`)
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white">
            🔍
          </div>
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900">
              Found Integration: {data.title}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-gray-600">
              {data.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {data.llm_instructions && (
          <div>
            <h4 className="mb-2 flex items-center gap-2 font-medium text-gray-900">
              <FileText className="h-4 w-4" />
              What it does:
            </h4>
            <div className="line-clamp-4 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
              {data.llm_instructions.substring(0, 300)}...
            </div>
          </div>
        )}

        <div>
          <h4 className="mb-2 flex items-center gap-2 font-medium text-gray-900">
            <Key className="h-4 w-4" />
            Setup required:
          </h4>
          <div className="space-y-1">
            {data.env_variables.map((env, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-sm text-gray-600"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                <span>
                  <strong>{env.id}</strong> - {env.description}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
              <span>
                {data.documentation_urls.length} documentation sources found
              </span>
              <ExternalLink className="h-3 w-3" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleAccept}
            className="flex-1 rounded-md bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Accept Integration
          </Button>
          <Button
            variant="outline"
            onClick={handleReject}
            className="flex-1 rounded-md border-red-300 px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <X className="mr-2 h-4 w-4" />
            Find Alternative
          </Button>
        </div>

        <div className="pt-2 text-center">
          <Badge variant="secondary" className="text-xs">
            Integration has been researched and added to your library
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
