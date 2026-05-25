"use client";

import { FolderOpen, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingState } from "../shared";
import { UserInfo } from "../types";
import { Id } from "@/convex/_generated/dataModel";

interface Project {
  _id: Id<"project">;
  name: string;
  semantic_identifier: string;
  role: string;
}

interface UserProjectsTabProps {
  selectedUser: UserInfo | null;
  userProjects: Project[] | null | undefined;
  selectedProjectId: Id<"project"> | null;
  currentProjectId: Id<"project"> | undefined;
  onSelectProject: (projectId: Id<"project">) => void;
}

export function UserProjectsTab({
  selectedUser,
  userProjects,
  selectedProjectId,
  currentProjectId,
  onSelectProject,
}: UserProjectsTabProps) {
  if (!selectedUser) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Please select a user to view projects"
      />
    );
  }

  if (!userProjects) {
    return <LoadingState message="Loading projects..." />;
  }

  if (userProjects.length === 0) {
    return (
      <EmptyState icon={FolderOpen} title="No projects found for this user" />
    );
  }

  return (
    <div className="space-y-2">
      {userProjects.map((project: any) => (
        <div
          key={project._id}
          className={cn(
            "flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-all",
            selectedProjectId === project._id
              ? "border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-md"
              : "border-zinc-200 bg-white shadow-sm hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-md",
          )}
          onClick={() => onSelectProject(project._id)}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-900">
                {project.name}
              </span>
              {project._id === currentProjectId && (
                <Badge
                  variant="outline"
                  className="h-5 border-green-500 bg-green-50 px-1.5 py-0 text-[10px] font-medium text-green-700"
                >
                  Current Page
                </Badge>
              )}
            </div>
            <span className="font-mono text-xs text-zinc-500">
              {project.semantic_identifier}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={project.role === "owner" ? "default" : "secondary"}
              className={
                project.role === "owner" ? "bg-blue-500 hover:bg-blue-600" : ""
              }
            >
              {project.role}
            </Badge>
            {selectedProjectId === project._id && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                <Check className="h-3.5 w-3.5 text-white" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
