"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Spinner3D } from "./Spinner3D";

const THINKING_STAGES = [
  {
    label: "Reading your request",
    detail: "Checking the project context and recent changes.",
    startsAt: 0,
  },
  {
    label: "Planning the change",
    detail: "Choosing the smallest implementation path.",
    startsAt: 3000,
  },
  {
    label: "Working through the code",
    detail: "Inspecting files and preparing edits.",
    startsAt: 7000,
  },
  {
    label: "Verifying the result",
    detail: "Looking for errors and edge cases.",
    startsAt: 13000,
  },
  {
    label: "Still working",
    detail: "This is taking longer, but progress is continuing.",
    startsAt: 22000,
  },
] as const;

function formatElapsed(ms: number) {
  if (ms < 10000) {
    return `${Math.floor(ms / 100) / 10}s`;
  }
  return `${Math.floor(ms / 1000)}s`;
}

function getSoftProgress(elapsedMs: number) {
  const seconds = elapsedMs / 1000;
  return Math.min(96, Math.round(12 + (1 - Math.exp(-seconds / 14)) * 84));
}

export const ThinkingState: React.FC = React.memo(() => {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startedAt);
    }, 250);

    return () => clearInterval(timer);
  }, []);

  const currentStageIndex = useMemo(
    () =>
      THINKING_STAGES.findLastIndex((stage) => elapsedTime >= stage.startsAt),
    [elapsedTime],
  );
  const currentStage = THINKING_STAGES[Math.max(0, currentStageIndex)];
  const progress = useMemo(() => getSoftProgress(elapsedTime), [elapsedTime]);
  const completedStageCount = Math.max(0, currentStageIndex);

  return (
    <div className="my-3 w-full max-w-xl">
      <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-4">
        <div className="mb-3">
          <div className="text-sm font-medium text-foreground">
            {currentStage.label}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {currentStage.detail}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-background/60">
            <Spinner3D size={42} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Thinking</span>
              <span className="font-mono">{formatElapsed(elapsedTime)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {THINKING_STAGES.slice(0, 4).map((stage, index) => {
                const isActive = index === currentStageIndex;
                const isComplete = index < completedStageCount;
                return (
                  <span
                    key={stage.label}
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      isActive
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : isComplete
                          ? "border-border bg-muted/50 text-foreground/70"
                          : "border-border/70 text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

ThinkingState.displayName = "ThinkingState";
