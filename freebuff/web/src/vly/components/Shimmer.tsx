import React from "react";

interface ShimmerProps {
  className?: string;
  height?: string;
}

export default function Shimmer({
  className = "",
  height = "200px",
}: ShimmerProps) {
  return (
    <div
      className={`animate-shimmer rounded-lg bg-gradient-to-r from-gray-200 via-white to-gray-200 bg-[length:200%_100%] ${className}`}
      style={{ height, minHeight: height }}
    />
  );
}
