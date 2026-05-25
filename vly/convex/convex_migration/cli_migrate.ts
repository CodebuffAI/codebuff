"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";
import {
  getConvexEnvironmentVariables,
  setConvexEnvironmentVariables,
} from "../convex_management";

/**
 * CLI-based migration approach for self-hosting
 * Uses npx convex export/import commands similar to ExportDevToProdDataInternal
 *
 * This approach:
 * 1. Exports data from VLY Convex using existing keys in VM
 * 2. Replaces deploy keys with user's self-hosted keys
 * 3. Imports data to user's Convex using the new keys
 * 4. Updates environment variables
 */

/**
 * Start CLI-based migration from VLY Convex to user's self-hosted Convex
 */
export const startCLIMigration = internalAction({
  args: {
    projectId: v.id("project"),
    connectionId: v.id("convex_connections"),
  },
  handler: async (ctx, args) => {
    console.log("[CLI Migration] Starting migration:", {
      projectId: args.projectId,
      connectionId: args.connectionId,
    });

    let migrationId: any = null;

    try {
      // Get project details
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        throw new Error("Project not found");
      }

      // Get connection info (encrypted)
      const connection = await ctx.runQuery(
        internal.convex_oauth.connections.getConnectionWithTokens,
        { connectionId: args.connectionId },
      );

      if (!connection) {
        throw new Error("Connection not found");
      }

      // Decrypt the deploy keys
      const decryptedDevDeployKey = connection.dev_deploy_key
        ? await ctx.runAction(api.convex_oauth.crypto.decryptToken, {
            encrypted: connection.dev_deploy_key,
          })
        : null;

      const decryptedProdDeployKey = connection.prod_deploy_key
        ? await ctx.runAction(api.convex_oauth.crypto.decryptToken, {
            encrypted: connection.prod_deploy_key,
          })
        : null;

      console.log("[CLI Migration] Deploy keys decrypted");

      // Get VLY deployment info
      const convexInstance = await ctx.runQuery(internal.convex_instance.get, {
        projectId: args.projectId,
      });

      if (!convexInstance) {
        throw new Error("VLY Convex instance not found");
      }

      // Create migration record
      migrationId = await ctx.runMutation(
        internal.convex_migration.status.createMigration,
        {
          projectId: args.projectId,
          user_id: connection.user_id,
          source_dev_deployment: convexInstance.devDeploymentName,
          source_prod_deployment:
            convexInstance.prodDeploymentName || undefined,
          target_convex_project_id: connection.convex_project_id,
          target_team_slug: connection.team_slug,
          target_dev_deployment: connection.dev_deployment_name,
          target_prod_deployment: connection.prod_deployment_name,
        },
      );

      console.log("[CLI Migration] Migration record created:", migrationId);

      // Initialize sandbox codebase
      console.log("[CLI Migration] Connecting to sandbox...");
      const codebase = (await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      )) as DaytonaCodebase;

      // Step 1: Export dev data using VLY keys (already in place)
      console.log("[CLI Migration] Step 1: Exporting dev data from VLY...");
      await ctx.runMutation(
        internal.convex_migration.status.updateMigrationStatus,
        {
          migrationId,
          status: "exporting",
          progress_percentage: 10,
        },
      );

      // Check if snapshot exists and clean up
      if (await codebase.checkIfFileExists("./snapshot-dev.zip")) {
        console.log("[CLI Migration] Deleting existing snapshot-dev.zip");
        await codebase.runCommandThrow("rm -rf ./snapshot-dev.zip", 30000);
      }

      // Export dev database using VLY's dev deploy key
      const devExportResult = await codebase.runCommandThrow(
        `CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/dev.key) npx convex export --path ./snapshot-dev.zip`,
        120000, // 2 minutes timeout for export
      );

      if (devExportResult.exitCode !== 0) {
        throw new Error(`Dev export failed: ${devExportResult.output}`);
      }

      console.log("[CLI Migration] Dev export completed");

      // Step 2: Export prod data if exists
      let hasProdData = false;
      if (convexInstance.prodDeploymentName) {
        console.log("[CLI Migration] Step 2: Exporting prod data from VLY...");
        await ctx.runMutation(
          internal.convex_migration.status.updateMigrationStatus,
          {
            migrationId,
            status: "exporting",
            progress_percentage: 25,
          },
        );

        // Check for existing prod key
        const prodKeyCheck = await codebase.runCommand(
          `cat $HOME/.vly-convex/prod.key 2>/dev/null || echo ""`,
        );

        if (prodKeyCheck.output.trim()) {
          if (await codebase.checkIfFileExists("./snapshot-prod.zip")) {
            await codebase.runCommandThrow("rm -rf ./snapshot-prod.zip", 30000);
          }

          const prodExportResult = await codebase.runCommandThrow(
            `CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/prod.key) npx convex export --prod --path ./snapshot-prod.zip`,
            120000,
          );

          if (prodExportResult.exitCode === 0) {
            hasProdData = true;
            console.log("[CLI Migration] Prod export completed");
          } else {
            console.warn(
              "[CLI Migration] Prod export failed, continuing with dev only:",
              prodExportResult.output,
            );
          }
        } else {
          console.log(
            "[CLI Migration] No prod key found, skipping prod export",
          );
        }
      }

      // Step 2b: Export environment variables from VLY Convex (before replacing keys!)
      // This includes JWT keys, integration keys, and any custom env vars
      console.log(
        "[CLI Migration] Step 2b: Exporting VLY environment variables...",
      );
      let vlyDevEnvVars: Record<string, string> = {};
      let vlyProdEnvVars: Record<string, string> = {};

      try {
        // Read VLY dev deploy key from VM
        const vlyDevKeyResult = await codebase.runCommand(
          `cat $HOME/.vly-convex/dev.key 2>/dev/null || echo ""`,
        );
        const vlyDevDeployKey = vlyDevKeyResult.output.trim();

        if (vlyDevDeployKey) {
          // Export env vars from VLY dev deployment
          vlyDevEnvVars = await getConvexEnvironmentVariables(
            convexInstance.devDeploymentName,
            vlyDevDeployKey,
          );
          console.log(
            "[CLI Migration] Exported VLY dev env vars:",
            Object.keys(vlyDevEnvVars),
          );
        } else {
          console.warn(
            "[CLI Migration] No VLY dev key found, skipping env var export",
          );
        }

        // Export prod env vars if prod deployment exists
        if (convexInstance.prodDeploymentName) {
          const vlyProdKeyResult = await codebase.runCommand(
            `cat $HOME/.vly-convex/prod.key 2>/dev/null || echo ""`,
          );
          const vlyProdDeployKey = vlyProdKeyResult.output.trim();

          if (vlyProdDeployKey) {
            vlyProdEnvVars = await getConvexEnvironmentVariables(
              convexInstance.prodDeploymentName,
              vlyProdDeployKey,
            );
            console.log(
              "[CLI Migration] Exported VLY prod env vars:",
              Object.keys(vlyProdEnvVars),
            );
          }
        }
      } catch (envExportError) {
        console.warn(
          "[CLI Migration] Warning: Failed to export VLY env vars, continuing without them:",
          envExportError,
        );
        // Don't fail migration, continue without env vars
      }

      // Step 3: Replace deploy keys with user's self-hosted keys
      console.log("[CLI Migration] Step 3: Replacing deploy keys...");
      await ctx.runMutation(
        internal.convex_migration.status.updateMigrationStatus,
        {
          migrationId,
          status: "updating_credentials",
          progress_percentage: 40,
        },
      );

      // Create backup of VLY keys (optional, for rollback)
      await codebase.runCommand(
        `mkdir -p $HOME/.vly-convex/backup && \
         cp $HOME/.vly-convex/dev.key $HOME/.vly-convex/backup/dev.key.bak 2>/dev/null || true && \
         cp $HOME/.vly-convex/prod.key $HOME/.vly-convex/backup/prod.key.bak 2>/dev/null || true`,
      );

      // Write user's dev deploy key (decrypted)
      if (!decryptedDevDeployKey) {
        throw new Error("No dev deploy key available");
      }
      await codebase.runCommandThrow(
        `echo "${decryptedDevDeployKey}" > $HOME/.vly-convex/dev.key`,
        10000,
      );

      // Write user's prod deploy key if available (decrypted)
      if (decryptedProdDeployKey) {
        await codebase.runCommandThrow(
          `echo "${decryptedProdDeployKey}" > $HOME/.vly-convex/prod.key`,
          10000,
        );
      }

      console.log("[CLI Migration] Deploy keys replaced");

      // Step 4: Import dev data to user's Convex
      console.log(
        "[CLI Migration] Step 4: Importing dev data to user Convex...",
      );
      await ctx.runMutation(
        internal.convex_migration.status.updateMigrationStatus,
        {
          migrationId,
          status: "importing",
          progress_percentage: 50,
        },
      );

      const devImportResult = await codebase.runCommandThrow(
        `CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/dev.key) npx convex import --replace ./snapshot-dev.zip -y`,
        180000, // 3 minutes timeout for import
      );

      if (devImportResult.exitCode !== 0) {
        throw new Error(`Dev import failed: ${devImportResult.output}`);
      }

      console.log("[CLI Migration] Dev import completed");

      // Step 5: Import prod data if available
      if (hasProdData && connection.prod_deploy_key) {
        console.log(
          "[CLI Migration] Step 5: Importing prod data to user Convex...",
        );
        await ctx.runMutation(
          internal.convex_migration.status.updateMigrationStatus,
          {
            migrationId,
            status: "importing",
            progress_percentage: 70,
          },
        );

        const prodImportResult = await codebase.runCommandThrow(
          `CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/prod.key) npx convex import --prod --replace ./snapshot-prod.zip -y`,
          180000,
        );

        if (prodImportResult.exitCode !== 0) {
          console.warn(
            "[CLI Migration] Prod import failed:",
            prodImportResult.output,
          );
          // Don't fail the whole migration for prod import failure
        } else {
          console.log("[CLI Migration] Prod import completed");
        }
      }

      // Step 5b: Set environment variables on user's Convex (transferred from VLY)
      // This includes JWT keys (so users stay logged in), integration keys, and custom vars
      console.log(
        "[CLI Migration] Step 5b: Setting env vars on user's Convex...",
      );

      try {
        // Set dev env vars on user's dev deployment
        if (Object.keys(vlyDevEnvVars).length > 0 && decryptedDevDeployKey) {
          await setConvexEnvironmentVariables(
            connection.dev_deployment_name,
            decryptedDevDeployKey,
            vlyDevEnvVars,
          );
          console.log(
            "[CLI Migration] Set",
            Object.keys(vlyDevEnvVars).length,
            "env vars on user's dev deployment",
          );
        }

        // Set prod env vars on user's prod deployment if exists
        if (
          Object.keys(vlyProdEnvVars).length > 0 &&
          decryptedProdDeployKey &&
          connection.prod_deployment_name
        ) {
          await setConvexEnvironmentVariables(
            connection.prod_deployment_name,
            decryptedProdDeployKey,
            vlyProdEnvVars,
          );
          console.log(
            "[CLI Migration] Set",
            Object.keys(vlyProdEnvVars).length,
            "env vars on user's prod deployment",
          );
        }
      } catch (envSetError) {
        console.error(
          "[CLI Migration] Warning: Failed to set env vars on user's Convex:",
          envSetError,
        );
        // Don't fail migration, env vars can be set manually if needed
      }

      // Step 6: Update environment variables in the sandbox
      console.log("[CLI Migration] Step 6: Updating environment variables...");
      await ctx.runMutation(
        internal.convex_migration.status.updateMigrationStatus,
        {
          migrationId,
          status: "updating_credentials",
          progress_percentage: 85,
        },
      );

      // Update CONVEX_DEPLOYMENT env var to point to user's deployment
      await codebase.setEnvVars({
        frontend: {
          VITE_CONVEX_URL: connection.dev_deployment_url,
          CONVEX_DEPLOYMENT: `dev:${connection.dev_deployment_name}`,
        },
        backend: {},
      });

      console.log("[CLI Migration] Environment variables updated");

      // Step 7: Update database records
      console.log("[CLI Migration] Step 7: Updating database records...");

      // Update project convex URL
      await ctx.runMutation(internal.project.updateProjectConvexUrl, {
        projectId: args.projectId,
        convexUrl: connection.dev_deployment_url,
      });

      // Update project_convex_instance
      await ctx.runMutation(
        internal.convex_migration.status.updateConvexInstanceForMigration,
        {
          projectId: args.projectId,
          devDeploymentName: connection.dev_deployment_name,
          prodDeploymentName: connection.prod_deployment_name,
        },
      );

      // Step 8: Cleanup snapshot files
      console.log("[CLI Migration] Step 8: Cleaning up...");
      await codebase.runCommand("rm -f ./snapshot-dev.zip ./snapshot-prod.zip");

      // Step 9: Restart dev server to apply changes
      console.log("[CLI Migration] Step 9: Restarting dev server...");
      try {
        await codebase.restartDevServer();
      } catch (restartError: any) {
        // Ignore "session already exists" error - dev server is already running
        if (restartError?.message?.includes("session already exists")) {
          console.log(
            "[CLI Migration] Dev server session already exists, skipping restart",
          );
        } else {
          console.warn(
            "[CLI Migration] Failed to restart dev server:",
            restartError,
          );
          // Don't fail migration for dev server restart issues
        }
      }

      // Mark migration as completed
      await ctx.runMutation(
        internal.convex_migration.status.updateMigrationStatus,
        {
          migrationId,
          status: "completed",
          progress_percentage: 100,
        },
      );

      console.log("[CLI Migration] Migration completed successfully!");

      return { success: true, migrationId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Migration failed";
      console.error("[CLI Migration] Error:", errorMessage, error);

      // Update migration record with error
      if (migrationId) {
        try {
          await ctx.runMutation(
            internal.convex_migration.status.updateMigrationStatus,
            {
              migrationId,
              status: "failed",
              error_message: errorMessage,
              error_details: error instanceof Error ? error.stack : undefined,
            },
          );
        } catch (updateError) {
          console.error(
            "[CLI Migration] Failed to update migration status:",
            updateError,
          );
        }
      }

      throw error;
    }
  },
});
