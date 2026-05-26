"use client";

import { Progress } from "@/vly/components/ui/progress";
import { Button } from "@/vly/components/ui/button";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Loader,
  CheckCircle,
  XCircle,
  Download,
  Upload,
  Settings,
} from "lucide-react";

type MigrationStatus =
  | "initiated"
  | "exporting"
  | "importing"
  | "updating_credentials"
  | "completed"
  | "failed";

interface MigrationStatusInfo {
  _id: Id<"convex_migrations">;
  projectId: Id<"project">;
  status: MigrationStatus;
  progress_percentage: number;
  tables_exported?: string[];
  total_documents_exported?: number;
  total_documents_imported?: number;
  error_message?: string;
  started_at: number;
  completed_at?: number;
}

interface MigrationProgressProps {
  migration: MigrationStatusInfo;
}

function getStatusIcon(status: MigrationStatus) {
  switch (status) {
    case "initiated":
      return <Loader className="h-5 w-5 animate-spin text-blue-500" />;
    case "exporting":
      return <Download className="h-5 w-5 animate-pulse text-blue-500" />;
    case "importing":
      return <Upload className="h-5 w-5 animate-pulse text-blue-500" />;
    case "updating_credentials":
      return <Settings className="h-5 w-5 animate-spin text-blue-500" />;
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

function getStatusMessage(
  status: MigrationStatus,
  migration: MigrationStatusInfo,
) {
  switch (status) {
    case "initiated":
      return "Starting migration...";
    case "exporting":
      return migration.tables_exported
        ? `Exporting data... (${migration.tables_exported.length} tables, ${migration.total_documents_exported || 0} documents)`
        : "Exporting data from VLY Convex...";
    case "importing":
      return migration.total_documents_imported
        ? `Importing data... (${migration.total_documents_imported} documents imported)`
        : "Importing data to your Convex...";
    case "updating_credentials":
      return "Updating project configuration...";
    case "completed":
      return "Migration completed successfully!";
    case "failed":
      return `Migration failed: ${migration.error_message || "Unknown error"}`;
  }
}

function getProgressColor(status: MigrationStatus) {
  switch (status) {
    case "completed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-blue-500";
  }
}

export function MigrationProgress({ migration }: MigrationProgressProps) {
  const cancelMigration = useMutation(
    api.convex_migration.status.cancelMigration,
  );

  const handleCancel = async () => {
    if (
      confirm(
        "Are you sure you want to cancel the migration? This cannot be undone.",
      )
    ) {
      try {
        await cancelMigration({ migrationId: migration._id });
      } catch (error) {
        console.error("Failed to cancel migration:", error);
      }
    }
  };

  const isInProgress =
    migration.status !== "completed" && migration.status !== "failed";
  const isFailed = migration.status === "failed";

  return (
    <div
      className={`max-w-sm rounded-md border px-3 py-2 ${
        isFailed
          ? "border-red-200 bg-red-50"
          : migration.status === "completed"
            ? "border-green-200 bg-green-50"
            : "border-blue-200 bg-blue-50"
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {getStatusIcon(migration.status)}
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {migration.status === "completed"
                  ? "Migration Complete"
                  : migration.status === "failed"
                    ? "Migration Failed"
                    : "Migrating to Your Convex"}
              </h3>
              <p className="text-xs text-gray-600">
                {getStatusMessage(migration.status, migration)}
              </p>
            </div>
          </div>

          {isInProgress && migration.status !== "initiated" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-7 px-2 text-xs text-red-600 hover:bg-red-100"
            >
              Cancel
            </Button>
          )}
        </div>

        <div className="space-y-1">
          <Progress
            value={migration.progress_percentage}
            className="h-1.5"
            indicatorClassName={getProgressColor(migration.status)}
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>{migration.progress_percentage}% complete</span>
            {isInProgress && (
              <span className="animate-pulse">Processing...</span>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-500">
          <p>Started: {new Date(migration.started_at).toLocaleTimeString()}</p>
          {migration.completed_at && (
            <p>
              Completed: {new Date(migration.completed_at).toLocaleTimeString()}{" "}
              (
              {Math.round(
                (migration.completed_at - migration.started_at) / 1000,
              )}
              s)
            </p>
          )}
        </div>

        {isInProgress && (
          <p className="text-xs text-gray-500">
            ⏳ Please don&apos;t close this tab. The migration may take several
            minutes depending on the size of your data.
          </p>
        )}

        {isFailed && migration.error_message && (
          <div className="rounded bg-red-100 p-2">
            <p className="text-xs font-medium text-red-900">Error:</p>
            <p className="mt-0.5 text-xs text-red-700">
              {migration.error_message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
