"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";

interface EditableProjectNameProps {
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>;
}

export function EditableProjectName({ project }: EditableProjectNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const setProjectNameMutation = useMutation(api.project.setProjectName);

  const handleNameSubmit = async () => {
    if (projectName.trim() === "") return;
    if (project) {
      await setProjectNameMutation({
        projectId: project._id,
        name: projectName.trim(),
      });
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleNameSubmit();
        }}
      >
        <Input
          key={project.name}
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="h-6 border-slate-300 bg-slate-200 text-sm text-zinc-800"
          autoFocus
          onBlur={handleNameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsEditing(false);
              setProjectName(project.name ?? "");
            }
          }}
        />
      </form>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="group flex items-center gap-1 truncate text-xs font-normal text-zinc-800 md:text-sm lg:max-w-none"
    >
      {projectName}
      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
