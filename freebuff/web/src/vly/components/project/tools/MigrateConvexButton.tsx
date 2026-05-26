"use client";

import { Button } from "@/vly/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/vly/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { Database, Loader, ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MigrationProgress } from "./MigrationProgress";

interface MigrateConvexButtonProps {
  projectId: Id<"project">;
  className?: string;
}

export const MigrateConvexButton = ({
  projectId,
  className,
}: MigrateConvexButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const initiateMigration = useAction(
    api.convex_oauth.oauth.initiateMigrationAuth,
  );
  const migrationStatus = useQuery(
    api.convex_migration.status.getMigrationStatus,
    { projectId },
  );
  const isSelfHosted = useQuery(
    api.convex_oauth.connections.isProjectSelfHosted,
    { projectId },
  );

  // Hide button entirely if project is already self-hosted
  if (isSelfHosted) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="h-8 gap-1.5 border-green-200 bg-green-50/50 text-xs text-green-700"
      >
        <Database className="h-3 w-3" />
        <span>Migration Completed</span>
      </Button>
    );
  }

  // Show migration progress if migration is in progress
  if (
    migrationStatus &&
    migrationStatus.status !== "completed" &&
    migrationStatus.status !== "failed"
  ) {
    return <MigrationProgress migration={migrationStatus} />;
  }

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      const authUrl = await initiateMigration({ projectId });

      toast.success("Redirecting to Convex OAuth...");

      // Redirect to Convex OAuth
      window.location.href = authUrl;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initiate migration";
      toast.error(errorMessage);
      console.error("Migration initiation error:", error);
      setIsMigrating(false);
    }
  };

  return (
    <>
      <Button
        variant="default"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 ${className}`}
        disabled={isMigrating}
      >
        {isMigrating ? (
          <>
            <Loader className="h-4 w-4 animate-spin" />
            Starting migration...
          </>
        ) : (
          <>
            <Database className="h-4 w-4" />
            Migrate to Your Own Convex
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Migrate to Self-Hosted Convex?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <p>
                  This will migrate your data from VLY's Convex to your own
                  Convex project. Here's what will happen:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>
                    You'll authorize VLY to access your Convex account via OAuth
                  </li>
                  <li>
                    A new Convex project will be created automatically for you
                  </li>
                  <li>
                    All your data (dev + prod) will be exported and imported
                  </li>
                  <li>Your app will be briefly paused during the migration</li>
                  <li>
                    Your project will be updated to use your own Convex
                    deployment
                  </li>
                  <li>
                    VLY's Convex deployment will be paused (archived) by default
                  </li>
                </ul>
                <p className="font-medium text-amber-600">
                  ⚠️ This migration is one-way and cannot be reversed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMigrating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMigrate}
              disabled={isMigrating}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isMigrating ? (
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin" />
                  Starting...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Start Migration
                </div>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
