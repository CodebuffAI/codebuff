import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/vly/components/ui/card";
import { Loader } from "lucide-react";

interface ResearchStep {
  icon: string;
  label: string;
  status: "active" | "pending" | "completed";
}

interface IntegrationResearchStepsProps {
  userRequest: string;
  currentStep?: number;
}

export function IntegrationResearchSteps({
  userRequest,
  currentStep = 0,
}: IntegrationResearchStepsProps) {
  const steps: ResearchStep[] = [
    {
      icon: "🔄",
      label: "Scanning the web for official docs...",
      status:
        currentStep >= 0
          ? currentStep > 0
            ? "completed"
            : "active"
          : "pending",
    },
    {
      icon: "📚",
      label: "Gathering comprehensive resources...",
      status:
        currentStep >= 1
          ? currentStep > 1
            ? "completed"
            : "active"
          : "pending",
    },
    {
      icon: "🌐",
      label: "Digging deeper with web search...",
      status:
        currentStep >= 2
          ? currentStep > 2
            ? "completed"
            : "active"
          : "pending",
    },
    {
      icon: "⚡",
      label: "Crafting your integration blueprint...",
      status:
        currentStep >= 3
          ? "completed"
          : currentStep === 3
            ? "active"
            : "pending",
    },
  ];

  return (
    <Card className="mx-auto w-full max-w-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Loader className="h-5 w-5 animate-spin text-blue-600" />
          <CardTitle className="text-lg font-semibold text-gray-900">
            Researching integration for: {userRequest}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 rounded-md p-3 transition-all duration-300 ${
                step.status === "active"
                  ? "border border-blue-300 bg-blue-100"
                  : step.status === "completed"
                    ? "border border-green-300 bg-green-100"
                    : "border border-gray-200 bg-gray-50"
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  step.status === "active"
                    ? "animate-pulse bg-blue-500 text-white"
                    : step.status === "completed"
                      ? "bg-green-500 text-white"
                      : "bg-gray-300 text-gray-600"
                }`}
              >
                {step.status === "completed" ? "✓" : step.icon}
              </div>
              <span
                className={`font-medium ${
                  step.status === "active"
                    ? "text-blue-800"
                    : step.status === "completed"
                      ? "text-green-800"
                      : "text-gray-500"
                }`}
              >
                {step.label}
              </span>
              {step.status === "active" && (
                <Loader className="ml-auto h-4 w-4 animate-spin text-blue-600" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
