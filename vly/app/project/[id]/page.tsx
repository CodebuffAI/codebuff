"use client";

import { Project2 } from "@/components/pages/project-2";
import { ProjectErrorBoundary } from "@/components/error-boundary";
import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
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
  const semanticIdentifier = typeof params.id === "string" ? params.id : "";

  const shouldShowPublicModel = searchParams.get("publish") === "true";

  // Fetch project data to check if migration is needed
  const project = useQuery(api.project.getProjectData, { semanticIdentifier });

  useEffect(() => {
    if (
      project &&
      project.sandbox_id &&
      !project.sandbox_id.startsWith("daytona:")
    ) {
      // Project is still on CodeSandbox, redirect to migration page
      router.push(`/project/${semanticIdentifier}/migrating`);
    }
  }, [project, router, semanticIdentifier]);

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
