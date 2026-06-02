"use client";

import { CountUp } from "../CountUp";

interface StatsPillProps {
  value: number | undefined;
  label: string;
  position: "left" | "right";
}

export function StatsPill({ value, label, position }: StatsPillProps) {
  const positionClasses =
    position === "left"
      ? "absolute -left-8 top-56 z-10 hidden -translate-x-1/4 md:block"
      : "absolute -right-8 top-24 z-10 hidden translate-x-1/4 md:block";

  return (
    <div className={positionClasses}>
      <div style={{ position: "relative" }}>
        {/* Underlying shadow layer for depth */}
        <div
          className="rounded-[90px] border-2 border-white px-5 py-2.5 outline outline-1 outline-white"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.1,
            filter: "blur(40px)",
            boxShadow: "inset 0px 4px 48px 8px rgba(204,184,218,0.4)",
          }}
        />
        {/* Main pill */}
        <div
          className="rounded-[90px] border-2 border-white px-5 py-2.5 outline outline-1 outline-white backdrop-blur-[80px]"
          style={{ position: "relative", background: "none" }}
        >
          {/* Stable background layer */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.12)",
              borderRadius: "90px",
              zIndex: 0,
            }}
          />
          {/* Inner glow effect */}
          <div
            style={{
              position: "absolute",
              inset: "2px",
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 70%, transparent 100%)",
              borderRadius: "88px",
              zIndex: 0,
            }}
          />
          {/* Content layer */}
          <div
            className="font-sans text-[12px] font-normal text-zinc-800"
            style={{ position: "relative", zIndex: 1 }}
          >
            {label}{" "}
            <CountUp
              end={value || 0}
              formatter={(value) => value.toLocaleString()}
            />
            + {position === "left" ? "websites" : "builders"}
          </div>
        </div>
      </div>
    </div>
  );
}
