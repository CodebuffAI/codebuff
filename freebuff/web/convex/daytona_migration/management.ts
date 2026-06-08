"use node";

import { Daytona } from "@daytonaio/sdk";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { LegacyBackfillPage } from "./backfill";
import { hasDevServer } from "../../codebase-utils/codebase/Codebase";
import { DaytonaSdkManager } from "../../codebase-utils/codebase/DaytonaSdkManager";
import type { DaytonaServer } from "../../codebase-utils/codebase/DaytonaSdkManager";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { configProxy } from "../../codebase-utils/instanceManager";
import { internal } from "../_generated/api";
import {
  action,
  internalAction,
} from "../_generated/server";
import { DAYTONA_CODEBASE_PATH, MIGRATION_ARCHIVE_PATH } from "./constants";

type ProjectPackageManager = "bun" | "pnpm";
type MigrationResult =
  | { status: "already_migrated"; sandboxId: string }
  | {
      status: "success";
      sourceSandboxId: string;
      targetSandboxId: string;
      server: "new";
    };

const self = (internal as any).daytona_migration.management;

async function openSandboxWithRetries(sdk: Daytona, sandboxId: string) {
  const maxAttempts = 8;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      console.log(
        `[DaytonaMigration] openSandboxWithRetries attempt=${attempt}/${maxAttempts} sandboxId=${sandboxId}`,
      );
      let sandbox = await sdk.get(sandboxId);
      if (sandbox.state !== "started") {
        console.log(
          `[DaytonaMigration] sandbox=${sandboxId} state=${sandbox.state}, starting...`,
        );
        await sdk.start(sandbox, 60);
      }
      sandbox = await sdk.get(sandboxId);
      if (sandbox.state !== "started") {
        throw new Error(`Sandbox ${sandboxId} not started: ${sandbox.state}`);
      }
      console.log(
        `[DaytonaMigration] sandbox=${sandboxId} confirmed started`,
      );
      return sandbox;
    } catch (error) {
      lastError = error;
      console.log(
        `[DaytonaMigration] openSandboxWithRetries failed attempt=${attempt} sandboxId=${sandboxId} error=${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt >= maxAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to open sandbox");
}

function getTarCommand(packageManager: ProjectPackageManager): string {
  const lockfileExcludes =
    packageManager === "pnpm"
      ? "--exclude='codebase/pnpm-lock.yaml' --exclude='codebase/pnpm-lock.yml'"
      : "--exclude='codebase/bun.lock'";

  return [
    `rm -f ${MIGRATION_ARCHIVE_PATH}`,
    `tar -czf ${MIGRATION_ARCHIVE_PATH} --exclude='codebase/node_modules' ${lockfileExcludes} -C /home/daytona codebase`,
  ].join(" && ");
}

function getInstallCommand(packageManager: ProjectPackageManager): string {
  void packageManager;
  return "bun install";
}

function getRemoveCrudDependencyCommand(): string {
  return [
    "if command -v bun >/dev/null 2>&1; then",
    "  bun -e \"const fs=require('fs');const path='package.json';const pkg=JSON.parse(fs.readFileSync(path,'utf8'));const sections=['dependencies','devDependencies','peerDependencies','optionalDependencies'];const removed=[];for(const section of sections){const deps=pkg[section];if(deps&&Object.prototype.hasOwnProperty.call(deps,'crud')){delete deps.crud;removed.push(section);}}if(removed.length){fs.writeFileSync(path, JSON.stringify(pkg,null,2)+'\\n');console.log('removed crud from '+removed.join(','));}else{console.log('crud not found in package.json');}\"",
    "elif command -v node >/dev/null 2>&1; then",
    "  node -e \"const fs=require('fs');const path='package.json';const pkg=JSON.parse(fs.readFileSync(path,'utf8'));const sections=['dependencies','devDependencies','peerDependencies','optionalDependencies'];const removed=[];for(const section of sections){const deps=pkg[section];if(deps&&Object.prototype.hasOwnProperty.call(deps,'crud')){delete deps.crud;removed.push(section);}}if(removed.length){fs.writeFileSync(path, JSON.stringify(pkg,null,2)+'\\n');console.log('removed crud from '+removed.join(','));}else{console.log('crud not found in package.json');}\"",
    "else",
    "  echo 'Neither bun nor node is available to sanitize package.json'",
    "  exit 1",
    "fi",
  ].join(" ");
}

async function detectDaytonaServerForSandboxId(
  sandboxId: string,
): Promise<DaytonaServer> {
  const legacySdk = DaytonaSdkManager.getDaytonaSDK("legacy");
  const newSdk = DaytonaSdkManager.getDaytonaSDK("new");

  const [legacyResult, newResult] = await Promise.allSettled([
    legacySdk.get(sandboxId),
    newSdk.get(sandboxId),
  ]);

  const foundOnLegacy = legacyResult.status === "fulfilled";
  const foundOnNew = newResult.status === "fulfilled";

  console.log(
    `[DaytonaMigration] detectDaytonaServer sandboxId=${sandboxId} foundOnLegacy=${foundOnLegacy} foundOnNew=${foundOnNew}`,
  );

  if (foundOnLegacy && !foundOnNew) {
    return "legacy";
  }
  if (foundOnNew && !foundOnLegacy) {
    return "new";
  }

  if (!foundOnLegacy && !foundOnNew) {
    throw new Error(
      `Sandbox ${sandboxId} not found on legacy or new Daytona servers`,
    );
  }

  throw new Error(
    `Sandbox ${sandboxId} appears on both Daytona servers (ambiguous)`,
  );
}

export const resolveProjectDaytonaServer = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<{ daytonaServer: DaytonaServer | null }> => {
    const project: Doc<"project"> | null = await ctx.runQuery(
      internal.project.getProject,
      {
        projectId: args.projectId,
      },
    );

    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.sandbox_id.startsWith("daytona:")) {
      return { daytonaServer: null };
    }

    const migration = await ctx.runQuery(
      internal.project.getProjectDaytonaMigration,
      {
        projectId: project._id,
      },
    );

    if (migration?.daytona_server) {
      return { daytonaServer: migration.daytona_server };
    }

    const sandboxId = project.sandbox_id.slice("daytona:".length);
    if (!sandboxId) {
      throw new Error("Invalid Daytona sandbox id");
    }

    const detectedServer = await detectDaytonaServerForSandboxId(sandboxId);
    await ctx.runMutation(internal.project.setProjectDaytonaServer, {
      projectId: project._id,
      daytonaServer: detectedServer,
    });

    console.log(
      `[DaytonaMigration] resolved daytona_server projectId=${project._id} server=${detectedServer}`,
    );

    return { daytonaServer: detectedServer };
  },
});

export const migrateAllLegacyProjectsToNewServer = internalAction({
  args: {
    cursor: v.optional(v.string()),
    scanned: v.optional(v.number()),
    updated: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const totalScanned = args.scanned ?? 0;
    const totalUpdated = args.updated ?? 0;
    const page: LegacyBackfillPage = await ctx.runQuery(
      internal.daytona_migration.backfill.readLegacyProjectsPage,
      {
        cursor: args.cursor,
        pageSize: args.pageSize,
      },
    );

    let batchUpdated = 0;
    if (!args.dryRun && page.projectIds.length > 0) {
      const result = await ctx.runMutation(
        internal.daytona_migration.backfill.markProjectsAsNewServer,
        {
          projectIds: page.projectIds,
        },
      );
      batchUpdated = result.updated;
    }

    const nextScanned = totalScanned + page.scanned;
    const nextUpdated = totalUpdated + batchUpdated;

    console.log(
      `[DaytonaMigration][Backfill] scanned=${nextScanned} updated=${nextUpdated} batchUpdated=${batchUpdated} legacyInBatch=${page.projectIds.length} done=${page.isDone} dryRun=${args.dryRun === true}`,
    );

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, self.migrateAllLegacyProjectsToNewServer, {
        cursor: page.cursor ?? undefined,
        scanned: nextScanned,
        updated: nextUpdated,
        pageSize: args.pageSize,
        dryRun: args.dryRun,
      });
      return {
        status: "scheduled_next_batch",
        scanned: nextScanned,
        updated: nextUpdated,
      };
    }

    console.log(
      `[DaytonaMigration][Backfill] complete scanned=${nextScanned} updated=${nextUpdated} dryRun=${args.dryRun === true}`,
    );

    return {
      status: "completed",
      scanned: nextScanned,
      updated: nextUpdated,
      dryRun: args.dryRun === true,
    };
  },
});

export const startMigrateAllLegacyProjectsToNewServer = internalAction({
  args: {
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, self.migrateAllLegacyProjectsToNewServer, {
      pageSize: args.pageSize,
      dryRun: args.dryRun,
    });

    console.log(
      `[DaytonaMigration][Backfill] started pageSize=${args.pageSize ?? 200} dryRun=${args.dryRun === true}`,
    );

    return {
      status: "started",
      pageSize: args.pageSize ?? 200,
      dryRun: args.dryRun === true,
    };
  },
});

export const migrateLegacyProjectToNewDaytona = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<MigrationResult> => {
    console.log(
      `[DaytonaMigration] start projectId=${args.projectId} action=migrateLegacyProjectToNewDaytona`,
    );

    const project: Doc<"project"> | null = await ctx.runQuery(
      internal.project.getProject,
      {
      projectId: args.projectId,
      },
    );

    if (!project) {
      console.log(`[DaytonaMigration] project not found projectId=${args.projectId}`);
      throw new Error("Project not found");
    }

    const migration = await ctx.runQuery(
      internal.project.getProjectDaytonaMigration,
      {
        projectId: project._id,
      },
    );

    console.log(
      `[DaytonaMigration] loaded project semantic=${project.semantic_identifier} sandbox_id=${project.sandbox_id} daytona_server=${migration?.daytona_server ?? "undefined"} packageManager=${project.packageManager ?? "undefined"}`,
    );

    if (!project.sandbox_id.startsWith("daytona:")) {
      console.log(
        `[DaytonaMigration] project sandbox is not Daytona sandbox_id=${project.sandbox_id}`,
      );
      throw new Error("Project is not a Daytona sandbox");
    }

    const sourceSandboxId = project.sandbox_id.slice("daytona:".length);
    if (!sourceSandboxId) {
      console.log(`[DaytonaMigration] invalid source sandbox id parsed empty`);
      throw new Error("Invalid source sandbox id");
    }

    let currentServer: DaytonaServer = migration?.daytona_server ?? "legacy";
    if (!migration?.daytona_server) {
      currentServer = await detectDaytonaServerForSandboxId(sourceSandboxId);
      await ctx.runMutation(internal.project.setProjectDaytonaServer, {
        projectId: project._id,
        daytonaServer: currentServer,
      });
      console.log(
        `[DaytonaMigration] inferred missing daytona_server projectId=${project._id} inferred=${currentServer}`,
      );
    }
    if (currentServer === "new") {
      console.log(
        `[DaytonaMigration] project already on new server sandbox_id=${project.sandbox_id}`,
      );
      return { status: "already_migrated", sandboxId: project.sandbox_id };
    }

    const packageManager: ProjectPackageManager = project.packageManager ?? "bun";

    console.log(
      `[DaytonaMigration] sourceSandboxId=${sourceSandboxId} sourceServer=${currentServer} targetServer=new packageManager=${packageManager}`,
    );

    await ctx.runMutation(internal.project.updateDaytonaMigrationState, {
      projectId: args.projectId,
      migrationStatus: "queued",
      startedAt: Date.now(),
      migrationError: undefined,
    });

    const legacySdk = DaytonaSdkManager.getDaytonaSDK("legacy");
    const newSdk = DaytonaSdkManager.getDaytonaSDK("new");
    console.log("[DaytonaMigration] resolved Daytona SDK clients for legacy and new");

    let targetSandboxId: string | undefined;

    try {
      await ctx.runMutation(internal.project.updateDaytonaMigrationState, {
        projectId: args.projectId,
        migrationStatus: "copying",
      });
      console.log(
        `[DaytonaMigration] migration_status=copying projectId=${args.projectId}`,
      );

      const sourceSandbox = await openSandboxWithRetries(legacySdk, sourceSandboxId);
      console.log(
        `[DaytonaMigration] source sandbox opened sourceSandboxId=${sourceSandboxId}`,
      );

      const targetPackageManager: ProjectPackageManager = "bun";

      const targetSandbox = await newSdk.create({
        snapshot: process.env.DAYTONA_SNAPSHOT_ID,
        public: true,
        autoStopInterval: 10,
      });
      targetSandboxId = targetSandbox.id;
      console.log(
        `[DaytonaMigration] created target sandbox targetSandboxId=${targetSandboxId} snapshot=${process.env.DAYTONA_SNAPSHOT_ID ?? "undefined"}`,
      );

      await ctx.runMutation(internal.project.updateDaytonaMigrationState, {
        projectId: args.projectId,
        migrationStatus: "copying",
        targetSandboxId,
      });

      if (packageManager === "pnpm") {
        console.log(
          "[DaytonaMigration] pnpm source detected, removing legacy 'crud' dependency before archiving",
        );
        const sanitizeResult = await sourceSandbox.process.executeCommand(
          getRemoveCrudDependencyCommand(),
          DAYTONA_CODEBASE_PATH,
        );
        if (sanitizeResult.exitCode !== 0) {
          console.log(
            `[DaytonaMigration] failed to sanitize package.json exitCode=${sanitizeResult.exitCode} output=${sanitizeResult.result}`,
          );
          throw new Error(
            `Failed to sanitize pnpm package.json before migration: ${sanitizeResult.result}`,
          );
        }
        console.log(
          `[DaytonaMigration] package.json sanitized output=${sanitizeResult.result}`,
        );
      }

      const sourceArchiveCommand = getTarCommand(packageManager);
      console.log(
        `[DaytonaMigration] creating source archive command=${sourceArchiveCommand}`,
      );
      const tarResult = await sourceSandbox.process.executeCommand(
        sourceArchiveCommand,
        "/home/daytona",
      );

      if (tarResult.exitCode !== 0) {
        console.log(
          `[DaytonaMigration] source archive failed exitCode=${tarResult.exitCode} output=${tarResult.result}`,
        );
        throw new Error(`Failed to archive source codebase: ${tarResult.result}`);
      }
      console.log("[DaytonaMigration] source archive created successfully");

      const archiveBuffer = await sourceSandbox.fs.downloadFile(MIGRATION_ARCHIVE_PATH);
      console.log(
        `[DaytonaMigration] archive downloaded bytes=${archiveBuffer.length}`,
      );

      const targetSandboxStarted = await openSandboxWithRetries(newSdk, targetSandboxId);
      console.log(
        `[DaytonaMigration] target sandbox opened targetSandboxId=${targetSandboxId}`,
      );
      await targetSandboxStarted.fs.uploadFile(
        archiveBuffer,
        MIGRATION_ARCHIVE_PATH,
        10,
      );
      console.log("[DaytonaMigration] archive uploaded to target sandbox");

      const extractResult = await targetSandboxStarted.process.executeCommand(
        [
          `rm -rf ${DAYTONA_CODEBASE_PATH}`,
          "mkdir -p /home/daytona",
          `tar -xzf ${MIGRATION_ARCHIVE_PATH} -C /home/daytona`,
          `rm -f ${MIGRATION_ARCHIVE_PATH}`,
        ].join(" && "),
        "/home/daytona",
      );

      if (extractResult.exitCode !== 0) {
        console.log(
          `[DaytonaMigration] extract failed exitCode=${extractResult.exitCode} output=${extractResult.result}`,
        );
        throw new Error(`Failed to extract archive in target sandbox: ${extractResult.result}`);
      }
      console.log("[DaytonaMigration] archive extracted in target sandbox");

      const installResult = await targetSandboxStarted.process.executeCommand(
        getInstallCommand(targetPackageManager),
        DAYTONA_CODEBASE_PATH,
      );
      if (installResult.exitCode !== 0) {
        console.log(
          `[DaytonaMigration] dependency install failed exitCode=${installResult.exitCode} output=${installResult.result}`,
        );
        throw new Error(`Dependency install failed: ${installResult.result}`);
      }
      console.log(
        `[DaytonaMigration] dependency install successful packageManager=${targetPackageManager}`,
      );

      await ctx.runMutation(internal.project.updateDaytonaMigrationState, {
        projectId: args.projectId,
        migrationStatus: "validating",
        targetSandboxId,
      });

      const newCodebase = await initializeCodebase(
        `daytona:${targetSandboxId}`,
        targetPackageManager,
        "new",
      );
      console.log("[DaytonaMigration] initialized target codebase abstraction");

      if (!hasDevServer(newCodebase)) {
        throw new Error("Target codebase does not support dev server management");
      }
      await newCodebase.restartDevServer();
      console.log("[DaytonaMigration] target dev server restarted successfully");

      const previewDomain = `5173-${targetSandboxId}.proxy.daytona.works`;
      const previewUrl = `https://${previewDomain}`;

      await ctx.runMutation(internal.project.updateDaytonaMigrationState, {
        projectId: args.projectId,
        migrationStatus: "cutting_over",
        targetSandboxId,
      });
      console.log(
        `[DaytonaMigration] migration_status=cutting_over projectId=${args.projectId}`,
      );

      await ctx.runMutation(internal.project.finalizeDaytonaServerMigration, {
        projectId: args.projectId,
        newSandboxId: targetSandboxId,
        previewUrl,
        templateId: process.env.DAYTONA_SNAPSHOT_ID,
        newServer: "new",
        packageManager: targetPackageManager,
      });
      console.log(
        `[DaytonaMigration] finalizeDaytonaServerMigration complete newSandboxId=${targetSandboxId}`,
      );

      const proxyTarget = previewUrl.replace(/^https?:\/\//, "");

      await configProxy({
        slug: project.semantic_identifier,
        target: proxyTarget,
      });
      console.log(
        `[DaytonaMigration] proxy configured slug=${project.semantic_identifier} target=${proxyTarget}`,
      );

      return {
        status: "success",
        sourceSandboxId,
        targetSandboxId,
        server: "new",
      };
    } catch (error) {
      console.log(
        `[DaytonaMigration] failed projectId=${args.projectId} targetSandboxId=${targetSandboxId ?? "none"} error=${error instanceof Error ? error.message : String(error)}`,
      );
      await ctx.runMutation(internal.project.updateDaytonaMigrationState, {
        projectId: args.projectId,
        migrationStatus: "failed",
        targetSandboxId,
        migrationError: error instanceof Error ? error.message : String(error),
        completedAt: Date.now(),
      });
      throw error;
    }
  },
});
