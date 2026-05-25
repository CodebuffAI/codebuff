import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricRowProps {
  icon: LucideIcon;
  label: string;
  value: string | React.ReactNode;
  details?: string;
}

export default function MetricRow({
  icon: Icon,
  label,
  value,
  details,
}: MetricRowProps) {
  return (
    <div className="flex items-baseline justify-between py-2 first:pt-0 last:pb-0">
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
          <Icon className="h-3.5 w-3.5 text-purple-400/60" />
          <span>{label}</span>
        </div>
        {details && (
          <div className="mt-0.5 text-[10px] text-zinc-500">{details}</div>
        )}
      </div>
      <div className="ml-4 text-right">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 bg-clip-text font-mono text-sm font-bold text-transparent">
          {value}
        </div>
      </div>
    </div>
  );
}
