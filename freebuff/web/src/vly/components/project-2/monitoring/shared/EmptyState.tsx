import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-zinc-200/50 bg-gradient-to-br from-white/60 via-zinc-50/40 to-white/60 p-8 text-center shadow-sm backdrop-blur-md">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100/80 backdrop-blur-sm">
        <Icon className="h-5 w-5 text-zinc-400" />
      </div>
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
    </div>
  );
}
