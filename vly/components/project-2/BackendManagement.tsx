"use client";
import React, { useState } from "react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Id } from "@/convex/_generated/dataModel";
import { BackendLogs } from "@/components/project-2/BackendLogs";
import { FeatureGate, UpgradePrompt } from "@/components/billing/FeatureGate";

interface BackendManagementProps {
  project: FunctionReturnType<typeof api.project.getProjectData> | undefined;
}

export default function BackendManagement({ project }: BackendManagementProps) {
  const [deploymentType, setDeploymentType] = useState<"dev" | "prod">("dev");

  return (
    <>
      <div className="space-y-4">
        <FeatureGate
          featureId="convex_logs"
          fallback={
            <div className="w-full">
              <UpgradePrompt featureId="convex_logs" variant="compact" />
            </div>
          }
        >
          <div className="relative z-10 flex min-h-12 shrink-0 flex-col gap-2 border-b px-4 py-2 sm:flex-row sm:items-center sm:gap-6 sm:py-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Backend Logs</h2>
            </div>
            <div className="flex justify-center sm:justify-start">
              <Tabs
                className="flex h-12 items-center justify-center text-xs"
                value={deploymentType}
                onValueChange={(value) =>
                  setDeploymentType(value as "dev" | "prod")
                }
              >
                <TabsList className="grid w-48 grid-cols-2">
                  <TabsTrigger value="dev">Dev</TabsTrigger>
                  <TabsTrigger value="prod">Prod</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Database Logs */}
          <BackendLogs
            projectId={project?._id as Id<"project">}
            deploymentType={deploymentType}
          />
        </FeatureGate>
      </div>
    </>
  );
}
