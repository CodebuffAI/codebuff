import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  width?: string;
  height?: string;
  borderRadius?: string;
  shadowDirection?: "none" | "right" | "left" | "down" | "all";
  backgroundColor?: string;
}

export function GlassCard({
  children,
  className = "",
  width = "auto",
  height = "auto",
  borderRadius = "20px",
  shadowDirection = "none",
  backgroundColor = "#ffffff",
}: GlassCardProps) {
  return (
    <div
      className={`relative overflow-hidden border ${className}`}
      style={{
        width,
        height,
        background: backgroundColor,
        borderRadius,
        borderColor: "#e5e7eb",
      }}
    >
      <div className="relative h-full">{children}</div>
    </div>
  );
}
