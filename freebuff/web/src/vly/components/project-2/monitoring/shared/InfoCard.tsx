import React from "react";
import { LucideIcon } from "lucide-react";

interface InfoCardProps {
  icon: LucideIcon;
  label: string;
  primaryValue: string | React.ReactNode;
  secondaryText?: string;
}

export default function InfoCard({
  icon: Icon,
  label,
  primaryValue,
  secondaryText,
}: InfoCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-200/50 bg-gradient-to-br from-white/70 via-white/50 to-zinc-50/60 p-4 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="mt-1.5 font-mono text-sm font-semibold text-zinc-900">
        {primaryValue}
      </div>
      {secondaryText && (
        <div className="mt-2 text-xs text-zinc-400">
          <span>{secondaryText}</span>
        </div>
      )}
    </div>
  );
}
