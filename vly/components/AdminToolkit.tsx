"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";

const AdminToolkit = ({ ticket }: { ticket: any }) => {
  const projectId = ticket?.projectId;
  const project = useQuery(
    api.project.getProjectDataById,
    projectId ? { projectId: projectId as Id<"project"> } : "skip",
  );
  const convex_instance = useQuery(
    api.convex_instance.lookup,
    project?.semantic_identifier
      ? { semanticIdentifier: project.semantic_identifier as string }
      : "skip",
  );
  const migrationAction = useAction(api.migrations.migrateDeployKeysPublic);

  // Safely get baseUrl - guard window usage
  const baseUrl = useMemo(() => {
    return typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "";
  }, []);

  // Check if all required data is loaded
  const isDataLoaded = useMemo(() => {
    return project !== undefined && convex_instance !== undefined;
  }, [project, convex_instance]);

  // Check if button should be disabled
  const isMigrateDisabled = useMemo(() => {
    return (
      !isDataLoaded ||
      !project?._id ||
      !project?.semantic_identifier ||
      !project?.sandbox_id ||
      !convex_instance?.devDeploymentName
    );
  }, [isDataLoaded, project, convex_instance]);

  const handleMigrate = async () => {
    if (isMigrateDisabled) return;

    await migrationAction({
      project: {
        _id: project?._id as Id<"project">,
        _creationTime: "",
        semantic_identifier: project?.semantic_identifier as string,
        sandbox_id: project?.sandbox_id as string,
        convex_url:
          `https://${convex_instance?.devDeploymentName}.convex.cloud` as string,
      },
    });
  };

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Project Info</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open(
                  `${baseUrl}/project/${project?.semantic_identifier}`,
                  "_blank",
                );
              }
            }}
          >
            Project Semantic Identifier: {project?.semantic_identifier}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open(
                  `https://dashboard.convex.dev/dp/${convex_instance?.devDeploymentName}/settings`,
                  "_blank",
                );
              }
            }}
          >
            Project Convex Instance: {convex_instance?.devDeploymentName}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open(
                  `https://codesandbox.io/p/devbox/${project?.sandbox_id}`,
                  "_blank",
                );
              }
            }}
          >
            Project Sandbox Id: {project?.sandbox_id}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Critical Toolkit</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
            Force Deploy Keys Migration
            <Button
              variant="outline"
              onClick={handleMigrate}
              disabled={isMigrateDisabled}
            >
              Migrate
            </Button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default AdminToolkit;
