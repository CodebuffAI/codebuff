"use client";

import { Loader2, MonitorSmartphone } from "lucide-react";

/**
 * Seamless "take over" prompt shown when Freebuff detects the user's single
 * active project slot is held by another tab or device. Taking over pauses the
 * other project and terminates its running tasks.
 */
export function ActiveSessionTakeoverOverlay({
  open,
  onTakeOver,
  takingOver,
  holderLabel,
}: {
  open: boolean;
  onTakeOver: () => void;
  takingOver: boolean;
  holderLabel?: string | null;
}) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
            <MonitorSmartphone className="h-4 w-4 text-primary" />
          </span>
          <h2 className="text-sm font-semibold">Freebuff is active elsewhere</h2>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          You can only run one project at a time.{" "}
          {holderLabel ? (
            <>
              Another session is active on{" "}
              <span className="font-medium text-foreground">{holderLabel}</span>.
            </>
          ) : (
            <>Another session is currently active.</>
          )}{" "}
          Take over here to continue — this pauses the other project and stops
          its running tasks.
        </p>
        <button
          type="button"
          onClick={onTakeOver}
          disabled={takingOver}
          className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {takingOver ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Taking over…
            </>
          ) : (
            "Take over here"
          )}
        </button>
      </div>
    </div>
  );
}
