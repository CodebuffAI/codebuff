import { cn } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";
import React from "react";

interface GlassBannerProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassBanner({ children, className }: GlassBannerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full rounded-b-lg pb-2 pt-4",
        "flex items-center justify-center",
        "bg-white text-sm font-medium text-gray-700",
        "shadow-sm",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <TriangleAlert className="h-4 w-4 text-amber-600" />
        {children}
      </span>
    </div>
  );
}
