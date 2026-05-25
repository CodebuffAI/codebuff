"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MigratingPage() {
  const params = useParams();
  const router = useRouter();
  const semanticIdentifier = typeof params.id === "string" ? params.id : "";
  const [migrationStarted, setMigrationStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to project updates in real-time
  const project = useQuery(api.project.getProjectData, { semanticIdentifier });
  const migrateToDaytona = useAction(api.codesandbox.export.migrateToDaytona);

  // Trigger migration on mount
  useEffect(() => {
    if (!project || migrationStarted) return;

    // Check if already on Daytona - if so, redirect immediately
    if (project.sandbox_id?.startsWith("daytona:")) {
      router.push(`/project/${semanticIdentifier}`);
      return;
    }

    // Start migration
    setMigrationStarted(true);
    migrateToDaytona({ projectId: project._id }).catch((err) => {
      console.error("Migration failed:", err);
      setError(err.message || "Failed to start migration");
    });
  }, [project, migrationStarted, migrateToDaytona, router, semanticIdentifier]);

  // Auto-redirect when migration completes
  useEffect(() => {
    if (migrationStarted && project?.sandbox_id?.startsWith("daytona:")) {
      // Give a brief moment for the backend to fully settle
      setTimeout(() => {
        router.push(`/project/${semanticIdentifier}`);
      }, 1000);
    }
  }, [project, migrationStarted, router, semanticIdentifier]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md space-y-6 rounded-lg border border-destructive/50 bg-card p-8 text-center shadow-lg">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Migration Failed
            </h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="pt-2 text-xs text-muted-foreground">
              Need help?{" "}
              <a
                href="https://discord.gg/2gSmB9DxJW"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Join our Discord
              </a>{" "}
              to report the problem
            </p>
          </div>
          <div className="space-y-2">
            <Button
              onClick={() => {
                setError(null);
                setMigrationStarted(false);
              }}
              className="w-full"
            >
              Retry Migration
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/project/${semanticIdentifier}`)}
              className="w-full"
            >
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md space-y-6 rounded-lg border bg-card p-8 text-center shadow-lg">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Upgrading Infrastructure
          </h1>
          <p className="text-sm text-muted-foreground">
            We're migrating your project to our improved Daytona infrastructure
            for better performance and reliability.
          </p>
        </div>
        <div className="space-y-3 rounded-md border bg-muted/50 p-4 text-left text-sm">
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
                Usually 30-60 seconds. You'll be redirected automatically when
                complete.
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Please don't close this page during the migration.
        </p>
      </div>
    </div>
  );
}
