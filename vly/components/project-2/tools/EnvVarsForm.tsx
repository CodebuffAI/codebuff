import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Key, CheckCircle, X, Copy } from "lucide-react";

interface IntegrationData {
  reference_id: string;
  title: string;
  description: string;
  env_variables: Array<{ id: string; description: string }>;
  user_instructions?: string;
}

interface EnvVarsFormProps {
  // Support both new format (integration object) and legacy format (individual props)
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

export function EnvVarsForm({
  integration,
  integrationTitle: legacyTitle,
  env_variables: legacyEnvVariables,
  user_instructions: legacyUserInstructions,
  llm_instructions,
  onSubmit,
  onSkip,
}: EnvVarsFormProps) {
  // Use new format if available, otherwise fall back to legacy props
  const data = integration || {
    reference_id: "",
    title: legacyTitle || "",
    description: "",
    env_variables: legacyEnvVariables || [],
    user_instructions: legacyUserInstructions || "",
  };

  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const handleInputChange = (envId: string, value: string) => {
    setEnvValues((prev) => ({ ...prev, [envId]: value }));
  };

  const toggleShowValue = (envId: string) => {
    setShowValues((prev) => ({ ...prev, [envId]: !prev[envId] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit(envValues);
    } else {
      // Default behavior: log the environment variables (in real implementation, send to backend)
      console.log("Submitting environment variables:", envValues);
      // You would call something like: sendMessage("Environment variables configured", envValues)
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      // Default behavior: skip environment variable setup
      console.log("Skipping environment variable setup");
      // You would call something like: sendMessage("Skip environment variables")
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-white">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500 text-sm font-bold text-white">
            <Key className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900">
              Setup Environment Variables
            </CardTitle>
            <p className="mt-1 text-sm text-gray-600">
              Configure API keys for {data.title}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {data.user_instructions && (
          <div className="rounded-md bg-blue-50 p-3">
            <h4 className="mb-2 text-sm font-medium text-blue-900">
              Setup Instructions:
            </h4>
            <div className="whitespace-pre-wrap text-sm text-blue-800">
              {data.user_instructions}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {data.env_variables.map((env) => (
            <div key={env.id} className="space-y-2">
              <Label
                htmlFor={env.id}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Key className="h-3 w-3" />
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                  {env.id}
                </code>
              </Label>
              <p className="text-xs text-gray-600">{env.description}</p>
              <div className="relative">
                <Input
                  id={env.id}
                  type={showValues[env.id] ? "text" : "password"}
                  value={envValues[env.id] || ""}
                  onChange={(e) => handleInputChange(env.id, e.target.value)}
                  placeholder="Enter your API key..."
                  className="h-10 pr-16 text-sm"
                />
                <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => toggleShowValue(env.id)}
                  >
                    {showValues[env.id] ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                  {envValues[env.id] && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(envValues[env.id])}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSubmit}
            className="flex-1 rounded-md bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Save & Continue
          </Button>
          <Button
            variant="outline"
            onClick={handleSkip}
            className="rounded-md border-gray-300 px-4 py-2 font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <X className="mr-2 h-4 w-4" />
            Skip for Now
          </Button>
        </div>

        <div className="pt-2 text-center">
          <Badge variant="secondary" className="text-xs">
            API keys are stored securely and encrypted
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
