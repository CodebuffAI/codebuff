import React from "react";

interface ProgressBarProps {
  percentage: number;
  className?: string;
  barClassName?: string;
}

export default function ProgressBar({
  percentage,
  className = "h-1 w-full",
  barClassName = "bg-gradient-to-r from-purple-500 to-purple-600",
}: ProgressBarProps) {
  return (
    <div className={`overflow-hidden rounded-full bg-zinc-200/40 ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${barClassName}`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}
