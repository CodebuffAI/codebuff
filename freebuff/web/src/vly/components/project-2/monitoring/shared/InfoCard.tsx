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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="mt-1.5 font-mono text-sm font-semibold text-foreground">
        {primaryValue}
      </div>
      {secondaryText && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span>{secondaryText}</span>
        </div>
      )}
    </div>
  );
}
