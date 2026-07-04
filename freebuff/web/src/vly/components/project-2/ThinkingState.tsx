"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";

const THINKING_STAGES = [
  {
    label: "Starting",
    detail: "connecting to the run",
    startsAt: 0,
  },
  {
    label: "Waiting for model",
    detail: "the first update can take a moment",
    startsAt: 4000,
  },
  {
    label: "Working",
    detail: "streaming updates as they arrive",
    startsAt: 9000,
  },
  {
    label: "Still working",
    detail: "long cloud runs can continue in the background",
    startsAt: 18000,
  },
  {
    label: "Still working",
    detail: "you can leave this page open while it finishes",
    startsAt: 32000,
  },
] as const;

function formatElapsed(ms: number) {
  if (ms < 10000) {
    return `${Math.floor(ms / 100) / 10}s`;
  }
  return `${Math.floor(ms / 1000)}s`;
}

export const ThinkingState: React.FC<{
  activityKey?: string;
  label?: string;
  detail?: string;
}> = React.memo(
  ({ activityKey, label, detail }) => {
    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
      setElapsedTime(0);
      const startedAt = Date.now();
      const timer = setInterval(() => {
        setElapsedTime(Date.now() - startedAt);
      }, 150);

      return () => clearInterval(timer);
    }, [activityKey]);

    const currentStageIndex = useMemo(
      () =>
        THINKING_STAGES.findLastIndex((stage) => elapsedTime >= stage.startsAt),
      [elapsedTime],
    );
    const currentStage = THINKING_STAGES[Math.max(0, currentStageIndex)];
    const displayLabel = label || currentStage.label;
    const displayDetail = detail || currentStage.detail;

    return (
      <div className="my-2 w-full max-w-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate">
                <span className="font-medium text-foreground/90">{displayLabel}</span>
                <span className="mx-1.5 text-muted-foreground/45">·</span>
                <span className="text-muted-foreground">{displayDetail}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {formatElapsed(elapsedTime)}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
              <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/60" />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

ThinkingState.displayName = "ThinkingState";
