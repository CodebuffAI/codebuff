import React from "react";

interface SandboxIconProps {
  size?: number;
}

// Static Sandbox Icon (non-animated cube)
export default function SandboxIcon({ size = 20 }: SandboxIconProps) {
  const halfSize = size / 2;
  return (
    <div
      className="inline-block"
      style={{
        width: size,
        height: size,
        transform: "rotate(45deg) rotateX(-25deg) rotateY(25deg)",
        transformStyle: "preserve-3d",
        perspective: "1000px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          border: "2px solid rgba(168, 85, 247, 0.6)",
          transform: `translateZ(-${halfSize}px) rotateY(180deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          border: "2px solid rgba(168, 85, 247, 0.6)",
          transform: "rotateY(-270deg) translateX(50%)",
          transformOrigin: "top right",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          border: "2px solid rgba(168, 85, 247, 0.6)",
          transform: "rotateY(270deg) translateX(-50%)",
          transformOrigin: "center left",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          border: "2px solid rgba(168, 85, 247, 0.6)",
          transform: "rotateX(90deg) translateY(-50%)",
          transformOrigin: "top center",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          border: "2px solid rgba(168, 85, 247, 0.6)",
          transform: "rotateX(-90deg) translateY(50%)",
          transformOrigin: "bottom center",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          border: "2px solid rgba(168, 85, 247, 0.6)",
          transform: `translateZ(${halfSize}px)`,
        }}
      />
    </div>
  );
}
