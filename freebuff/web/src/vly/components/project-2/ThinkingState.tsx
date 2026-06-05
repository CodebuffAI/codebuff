"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Loader } from "lucide-react";

const THINKING_STAGES = [
  {
    label: "Reading context",
    startsAt: 0,
  },
  {
    label: "Planning",
    startsAt: 4000,
  },
  {
    label: "Working",
    startsAt: 9000,
  },
  {
    label: "Checking result",
    startsAt: 18000,
  },
  {
    label: "Still working",
    startsAt: 32000,
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
  return Math.min(94, Math.round(8 + (1 - Math.exp(-seconds / 24)) * 86));
}

function getEstimatedTokens(elapsedMs: number) {
  const seconds = elapsedMs / 1000;
  const base = 240;
  const estimated = base + Math.floor(Math.log1p(seconds) * 520 + seconds * 22);
  return Math.min(9800, estimated);
}

function formatTokenCount(tokens: number) {
  if (tokens < 1000) return `${tokens.toLocaleString()} tokens`;
  return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k tokens`;
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
  const estimatedTokens = useMemo(
    () => getEstimatedTokens(elapsedTime),
    [elapsedTime],
  );

  return (
    <div className="my-2 w-full max-w-lg">
      <div className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <img
            src="/logo-icon.png"
            alt="Freebuff"
            className="h-7 w-7 animate-pulse object-contain opacity-90"
          />
          <Loader className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-spin text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              <span className="font-medium text-foreground/90">
                {currentStage.label}
              </span>
              <span className="mx-1.5 text-muted-foreground/45">·</span>
              <span>{formatTokenCount(estimatedTokens)}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatElapsed(elapsedTime)}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full rounded-full bg-primary/70 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

ThinkingState.displayName = "ThinkingState";
