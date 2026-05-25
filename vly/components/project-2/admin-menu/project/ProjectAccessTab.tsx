"use client";

import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProjectMember {
  _id: string;
  userName: string;
  userEmail: string;
  role: string;
}

interface ProjectAccessTabProps {
  projectMembers: ProjectMember[] | null | undefined;
}

export function ProjectAccessTab({ projectMembers }: ProjectAccessTabProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-50">
          <Users className="h-3.5 w-3.5 text-purple-600" />
        </div>
        Project Members
      </h3>

      {!projectMembers || projectMembers.length === 0 ? (
        <div className="py-6 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-600">No members found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projectMembers.map((member: any) => (
            <div
              key={member._id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-zinc-900">
                  {member.userName}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {member.userEmail}
                </span>
              </div>
              <Badge
                variant={member.role === "owner" ? "default" : "secondary"}
                className={
                  member.role === "owner"
                    ? "bg-purple-500 hover:bg-purple-600"
                    : ""
                }
              >
                {member.role}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
