"use client";
import React, { useEffect, useState } from "react";
import { ScanSearch } from "lucide-react";

function formatElapsed(ms: number) {
  if (ms < 10000) {
    return `${Math.floor(ms / 100) / 10}s`;
  }
  return `${Math.floor(ms / 1000)}s`;
}

/**
 * Distinct activity indicator shown while a code-reviewer subagent is streaming
 * its review. Visually separate from the generic ThinkingState so it's obvious
 * the run is in the (potentially slow) review phase rather than still building.
 *
 * The elapsed timer doubles as a testing signal: if review drags on it's easy to
 * see here, and the row turns amber past `SLOW_REVIEW_MS` to flag a review that
 * risks pushing the run over the action time limit.
 */
const SLOW_REVIEW_MS = 60_000;

export const ReviewingState: React.FC<{ activityKey?: string }> = React.memo(
  ({ activityKey }) => {
    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
      setElapsedTime(0);
      const startedAt = Date.now();
      const timer = setInterval(() => {
        setElapsedTime(Date.now() - startedAt);
      }, 150);
      return () => clearInterval(timer);
    }, [activityKey]);

    const isSlow = elapsedTime >= SLOW_REVIEW_MS;

    return (
      <div className="my-2 w-full max-w-lg">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <ScanSearch className="h-4 w-4 animate-pulse text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate">
                <span className="font-medium text-foreground/90">
                  Reviewing changes
                </span>
                <span className="mx-1.5 text-muted-foreground/45">·</span>
                <span className="text-muted-foreground">
                  {isSlow
                    ? "taking a while — large reviews can run long"
                    : "checking the latest edits for issues"}
                </span>
              </span>
              <span
                className={`shrink-0 font-mono tabular-nums ${
                  isSlow ? "text-amber-500" : "text-muted-foreground"
                }`}
              >
                {formatElapsed(elapsedTime)}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/70">
              <div
                className={`h-full animate-pulse rounded-full ${
                  isSlow ? "bg-amber-500/70" : "bg-primary/70"
                }`}
                style={{ width: isSlow ? "85%" : "55%" }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

ReviewingState.displayName = "ReviewingState";
