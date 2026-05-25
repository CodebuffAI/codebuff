import React from "react";

interface Spinner3DProps {
  size?: number;
  className?: string;
}

export function Spinner3D({ size = 44, className = "" }: Spinner3DProps) {
  return (
    <div
      className={`spinner-3d ${className}`}
      style={{ width: size, height: size }}
    >
      <div></div>
      <div></div>
      <div></div>
      <div></div>
      <div></div>
      <div></div>
    </div>
  );
}
