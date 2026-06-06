"use client";

import { Project2 } from "@/vly/components/pages/project-2";
import { ProjectErrorBoundary } from "@/vly/components/error-boundary";
import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from "next/navigation";
import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function useParentRouteSync() {
  const pathname = usePathname();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: pathname },
      "*",
    );
  }, [pathname]);
}

export default function ProjectPage() {
  useParentRouteSync();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [resolveAttempted, setResolveAttempted] = useState(false);
  const semanticIdentifier = typeof params.id === "string" ? params.id : "";

  const shouldShowPublicModel = searchParams.get("publish") === "true";

  // Fetch project data to check if migration is needed
  const project = useQuery(api.project.getProjectData, { semanticIdentifier });
  const daytonaServer = project
    ? (project as { daytona_server?: "legacy" | "new" }).daytona_server
    : undefined;
  const resolveProjectDaytonaServer = useAction(
    api.daytona_migration.resolve.resolveProjectDaytonaServer,
  );

  useEffect(() => {
    if (!project || resolveAttempted) {
      return;
    }

    const needsResolution =
      project.sandbox_id.startsWith("daytona:") && !daytonaServer;

    if (!needsResolution) {
      return;
    }

    setResolveAttempted(true);
    console.log(
      "[ProjectPage] Resolving Daytona server for project",
      project._id,
      project.sandbox_id,
    );
    resolveProjectDaytonaServer({ projectId: project._id }).catch((error) => {
      console.error("Failed to resolve project Daytona server:", error);
    });
  }, [project, resolveAttempted, resolveProjectDaytonaServer]);

  useEffect(() => {
    if (!project || !project.sandbox_id) {
      return;
    }

    const isLegacyCodeSandbox = !project.sandbox_id.startsWith("daytona:");
    const isLegacyDaytona =
      project.sandbox_id.startsWith("daytona:") &&
      daytonaServer === "legacy" &&
      project.migration_status !== "done";

    console.log("[ProjectPage] migration gate", {
      projectId: project._id,
      sandboxId: project.sandbox_id,
      daytonaServer,
      migrationStatus: project.migration_status,
      isLegacyCodeSandbox,
      isLegacyDaytona,
    });

    if (isLegacyCodeSandbox || isLegacyDaytona) {
      router.push(`/web/project/${semanticIdentifier}/migrating`);
    }
  }, [project, daytonaServer, router, semanticIdentifier]);

  // Remove publish param from URL after deployment dialog is triggered
  useEffect(() => {
    if (shouldShowPublicModel) {
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete("publish");
      const newUrl = newSearchParams.toString()
        ? `${window.location.pathname}?${newSearchParams.toString()}`
        : window.location.pathname;
      router.replace(newUrl);
    }
  }, [shouldShowPublicModel, searchParams, router]);

  return (
    <ProjectErrorBoundary semanticIdentifier={semanticIdentifier}>
      <Project2 shouldShowPublicModel={shouldShowPublicModel} />
    </ProjectErrorBoundary>
  );
}
