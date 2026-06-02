import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-zinc-50 to-zinc-100/50 p-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200">
          <Icon className="h-6 w-6 text-zinc-400" />
        </div>
        <p className="text-sm font-medium text-zinc-600">{title}</p>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
    </div>
  );
}
