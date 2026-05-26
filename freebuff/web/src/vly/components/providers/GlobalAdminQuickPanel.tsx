"use client";

import { useState, useEffect, startTransition } from "react";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminQuickMenu } from "@/vly/components/project-2/AdminQuickMenu";
import { Id } from "@/convex/_generated/dataModel";

/**
 * Global Admin Quick Panel Provider
 *
 * Makes the admin quick panel accessible from anywhere on the site with CMD/Ctrl + K
 * for god mode users.
 *
 * Context-aware:
 * - On project pages: Preselects project owner + that project
 * - On other pages: Preselects logged-in god user, no project initially
 */
export function GlobalAdminQuickPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const params = useParams();
  const pathname = usePathname();

  // Get current user to check for god role
  const currentUser = useQuery(api.users.viewer);

  // Detect if we're on a project page
  const isProjectPage = pathname?.startsWith("/web/project/") && params?.id;
  const semanticIdentifier =
    isProjectPage && typeof params.id === "string" ? params.id : null;

  // Get project data if on project page
  const projectData = useQuery(
    api.project.getProjectData,
    semanticIdentifier ? { semanticIdentifier } : "skip",
  );

  // Get project owner if on project page
  const projectOwner = useQuery(
    api.admin.getProjectOwner,
    projectData?._id ? { projectId: projectData._id } : "skip",
  );

  // Only render for god mode users
  const isGodMode = currentUser?.role === "god";

  // Handle keyboard shortcut: CMD/Ctrl + K
  useEffect(() => {
    if (!isGodMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Use startTransition to mark this state update as non-urgent
        // This keeps the UI responsive during the transition
        startTransition(() => {
          setIsOpen((prev) => !prev);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGodMode]);

  // Don't render anything if not a god mode user
  if (!isGodMode) {
    return null;
  }

  // If on project page, wait for project data to load before rendering
  if (isProjectPage && !projectData) {
    return null;
  }

  // Determine props based on context
  let initialUserId: Id<"users"> | undefined;
  let initialProjectId: Id<"project"> | undefined;
  let projectId: Id<"project"> | undefined;

  if (isProjectPage && projectData) {
    // On project page: preselect project owner + that project
    initialUserId = projectOwner?._id;
    initialProjectId = projectData._id;
    projectId = projectData._id;
  } else {
    // On non-project pages: preselect god user, no project
    initialUserId = currentUser?._id;
    initialProjectId = undefined;
    projectId = undefined;
  }

  return (
    <AdminQuickMenu
      open={isOpen}
      onOpenChange={setIsOpen}
      projectId={projectId}
      initialUserId={initialUserId}
      initialProjectId={initialProjectId}
    />
  );
}
