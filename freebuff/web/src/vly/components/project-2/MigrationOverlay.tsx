"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";
import { Progress } from "@/vly/components/ui/progress";

interface MigrationOverlayProps {
  semanticIdentifier: string;
  /** Called once the migration has finished. Optional — the parent normally
   *  unmounts this overlay reactively when the project is no longer legacy. */
  onComplete?: () => void;
}

// The fake progress bar fills toward ~95% across this window, then snaps to
// 100% when the real migration reports done.
const PROGRESS_DURATION_MS = 150_000;
const PROGRESS_CEILING = 95;

/**
 * Non-closable popup shown on top of the project page while the project's
 * sandbox is migrated to the new Daytona infrastructure. Replaces the old
 * full-screen `/migrating` route so the user stays on their project.
 */
export function MigrationOverlay({
  semanticIdentifier,
  onComplete,
}: MigrationOverlayProps) {
  const router = useRouter();
  const [migrationStarted, setMigrationStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Reactive project state (shares Convex's query cache with the page).
  const project = useQuery(api.project.getProjectData, { semanticIdentifier });
  const daytonaServer = project
    ? (project as { daytona_server?: "legacy" | "new" }).daytona_server
    : undefined;

  const migrateToDaytona = useAction(api.codesandbox.export.migrateToDaytona);
  const migrateLegacyDaytonaToNew = useAction(
    api.daytona_migration.management.migrateLegacyProjectToNewDaytona,
  );

  // Kick off the migration once the project is loaded.
  useEffect(() => {
    if (!project || migrationStarted || error) return;

    const isDaytona = project.sandbox_id?.startsWith("daytona:") === true;
    const isOnNewDaytona = isDaytona && daytonaServer === "new";

    if (isOnNewDaytona) {
      onComplete?.();
      return;
    }

    setMigrationStarted(true);
    const migrationPromise = isDaytona
      ? migrateLegacyDaytonaToNew({ projectId: project._id })
      : migrateToDaytona({ projectId: project._id });

    migrationPromise.catch((err: Error) => {
      console.error("Migration failed:", err);
      setError(err.message || "Failed to start migration");
    });
  }, [
    project,
    migrationStarted,
    error,
    daytonaServer,
    migrateToDaytona,
    migrateLegacyDaytonaToNew,
    onComplete,
  ]);

  // Randomly-advancing progress bar bounded by elapsed time so it spans the
  // full ~150s window without ever pretending to be finished early.
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!migrationStarted || error) return;
    startRef.current = Date.now();

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= PROGRESS_CEILING) return prev;
        const start = startRef.current ?? Date.now();
        const elapsedFraction = Math.min(
          (Date.now() - start) / PROGRESS_DURATION_MS,
          1,
        );
        const ceiling = Math.min(PROGRESS_CEILING, elapsedFraction * 100);
        if (prev >= ceiling) return prev;
        // Random forward jump toward the time-based ceiling.
        const step = Math.random() * (ceiling - prev) * 0.5 + Math.random();
        return Math.min(ceiling, prev + step);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [migrationStarted, error]);

  // Finish: complete the bar and notify the parent.
  useEffect(() => {
    const migrationDone =
      project?.migration_status === "done" || daytonaServer === "new";
    if (migrationStarted && migrationDone) {
      setProgress(100);
      const timeout = setTimeout(() => onComplete?.(), 1000);
      return () => clearTimeout(timeout);
    }
  }, [project, daytonaServer, migrationStarted, onComplete]);

  if (error) {
    return (
      <Dialog open>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="py-2">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">
                Migration Failed
              </DialogTitle>
              <DialogDescription className="text-center">
                {error}
              </DialogDescription>
            </DialogHeader>
            <p className="pt-3 text-center text-xs text-muted-foreground">
              Need help?{" "}
              <a
                href="https://discord.gg/yXG3w7wxfs"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Join our Discord
              </a>{" "}
              to report the problem
            </p>
            <div className="mt-6 space-y-2">
              <Button
                onClick={() => {
                  setError(null);
                  setMigrationStarted(false);
                  setProgress(0);
                }}
                className="w-full"
              >
                Retry Migration
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/web/dashboard")}
                className="w-full"
              >
                Go Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="py-2">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>

          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              Upgrading Infrastructure
            </DialogTitle>
            <DialogDescription className="text-center">
              We're migrating your project to our improved Daytona
              infrastructure for better performance and reliability.
            </DialogDescription>
          </DialogHeader>

          {/* Progress bar */}
          <div className="mt-6 space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Migrating…</span>
              <span className="tabular-nums">{Math.round(progress)}%</span>
            </div>
          </div>

          <div className="mt-6 space-y-3 rounded-md border bg-muted/50 p-4 text-left text-sm">
            <div className="flex items-start gap-3">
              <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
              <div>
                <div className="font-medium">What's happening?</div>
                <div className="text-muted-foreground">
                  Your project is being transferred to a new development
                  environment with enhanced capabilities.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
              <div>
                <div className="font-medium">How long will this take?</div>
                <div className="text-muted-foreground">
                  Usually 30-90 seconds. The page will update automatically when
                  complete. Current step: {project?.migration_status ?? "queued"}
                  .
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Please don't close this page during the migration.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
