export const MIGRATION_ARCHIVE_PATH = "/tmp/migration-codebase.tar.gz";
export const DAYTONA_CODEBASE_PATH = "/home/daytona/codebase";

export type MigrationStatus =
  | "idle"
  | "queued"
  | "copying"
  | "validating"
  | "cutting_over"
  | "done"
  | "failed";
