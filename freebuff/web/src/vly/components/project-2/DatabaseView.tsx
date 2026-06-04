"use client";

import { Tabs, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import { useState } from "react";
import { ConvexEmbed } from "./database/ConvexEmbed";
import ExportDevToProdData from "@/vly/components/project-2/ExportDevToProdData";
import { FeatureGate, UpgradePrompt } from "@/vly/components/billing/FeatureGate";
import { MigrateConvexButton } from "@/vly/components/project/tools/MigrateConvexButton";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

interface DatabaseViewProps {
  project: FunctionReturnType<typeof api.project.getProjectData> | undefined;
}

function DatabaseView({ project }: DatabaseViewProps) {
  const [deploymentType, setDeploymentType] = useState<"dev" | "prod">("dev");

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <FeatureGate
        featureId="database_preview"
        fallback={
          <div className="min-h-0 w-full flex-1 overflow-hidden">
            <UpgradePrompt featureId="database_preview" variant="compact" />
          </div>
        }
      >
        <div className="relative z-10 flex min-h-12 shrink-0 flex-col gap-2 border-b border-border bg-background px-4 py-2 sm:flex-row sm:items-center sm:gap-4 sm:py-0">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
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
            <ExportDevToProdData project={project} />
            {project?._id && <MigrateConvexButton projectId={project._id} />}
          </div>
        </div>
        <div className="min-h-0 w-full flex-1 overflow-hidden">
          {project?._id && (
            <ConvexEmbed
              projectId={project._id}
              deploymentType={deploymentType}
            />
          )}
        </div>
      </FeatureGate>
    </div>
  );
}

export default DatabaseView;
