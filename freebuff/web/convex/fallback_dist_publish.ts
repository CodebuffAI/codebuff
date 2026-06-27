"use node";

import type { Codebase, VercelDeploymentFile } from "../codebase-utils/codebase/Codebase";
import {
  hasPackageManager,
  isVercelDeployable,
} from "../codebase-utils/codebase/Codebase";
import { initializeCodebase } from "../codebase-utils/codebase/initializeCodebase";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

type FrameworkType = "vite" | "nextjs" | "unsupported";

async function detectFramework(codebase: Codebase): Promise<FrameworkType> {
  try {
    const raw = await codebase.readFile("package.json");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("next" in allDeps) return "nextjs";
    if ("vite" in allDeps) return "vite";
    return "unsupported";
  } catch {
    // No package.json → Python, Ruby, or other non-JS project
    return "unsupported";
  }
}

const DIST_REFRESH_WINDOW_MS = 10 * 60 * 1000;
const DIST_BUILD_ROOT_PREFIX = "distBuild";

type R2Config = {
  accountId: string;
  apiToken: string;
  bucketName: string;
};

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.R2_API_TOKEN;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !apiToken || !bucketName) {
    throw new Error(
      "R2 credentials missing. Expected R2_ACCOUNT_ID, R2_API_TOKEN, and R2_BUCKET_NAME.",
    );
  }

  return { accountId, apiToken, bucketName };
}

function getR2ObjectsBaseUrl(config: R2Config): string {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucketName}/objects`;
}

function encodeObjectKeyPath(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getFallbackPrefix(semanticIdentifier: string): string {
  return `${DIST_BUILD_ROOT_PREFIX}/${semanticIdentifier}/`;
}

function getContentType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
    return "application/javascript; charset=utf-8";
  }
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".map")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function listR2KeysByPrefix(config: R2Config, prefix: string) {
  const baseUrl = getR2ObjectsBaseUrl(config);
  const keys: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("limit", "1000");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to list R2 objects for prefix ${prefix}: ${response.status} ${text}`,
      );
    }

    const body = (await response.json()) as {
      result?: {
        objects?: Array<{ key?: string }>;
        cursor?: string;
        result_info?: { cursor?: string };
      };
    };

    const result = body.result ?? {};
    const batchKeys = (result.objects ?? [])
      .map((item) => item.key)
      .filter((item): item is string => Boolean(item));

    keys.push(...batchKeys);

    const nextCursor = result.cursor ?? result.result_info?.cursor;
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  return keys;
}

async function deleteR2Prefix(config: R2Config, prefix: string) {
  const keys = await listR2KeysByPrefix(config, prefix);
  if (keys.length === 0) {
    return;
  }

  const baseUrl = getR2ObjectsBaseUrl(config);

  for (const key of keys) {
    const response = await fetch(`${baseUrl}/${encodeObjectKeyPath(key)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to delete R2 object ${key}: ${response.status} ${text}`,
      );
    }
  }
}

async function uploadDistFiles(
  config: R2Config,
  semanticIdentifier: string,
  files: VercelDeploymentFile[],
) {
  const baseUrl = getR2ObjectsBaseUrl(config);
  const prefix = getFallbackPrefix(semanticIdentifier);

  for (const file of files) {
    const key = `${prefix}${file.file}`;
    const response = await fetch(`${baseUrl}/${encodeObjectKeyPath(key)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": getContentType(file.file),
      },
      body: new Uint8Array(file.content),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to upload fallback dist file ${key}: ${response.status} ${text}`,
      );
    }
  }
}

export const publishFallbackDist = internalAction({
  args: {
    projectId: v.id("project"),
    force: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.sandbox_id?.startsWith("daytona:")) {
      return null;
    }

    const now = Date.now();
    const force = args.force === true;
    const lastDistBuildAt = project.last_dist_build_at ?? 0;
    if (!force && now - lastDistBuildAt <= DIST_REFRESH_WINDOW_MS) {
      return null;
    }

    const migration = await ctx.runQuery(internal.project.getProjectDaytonaMigration, {
      projectId: project._id,
    });

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
      migration?.daytona_server ?? "legacy",
    );

    if (!hasPackageManager(codebase)) {
      throw new Error("Codebase does not support package manager detection");
    }

    if (!isVercelDeployable(codebase)) {
      throw new Error("Codebase does not support deployment artifact preparation");
    }

    const packageManager = codebase.getPackageManager();

    const framework = await detectFramework(codebase);
    if (framework === "nextjs") {
      throw new Error(
        "Fallback dist publishing is not supported for Next.js projects yet.",
      );
    }
    if (framework === "unsupported") {
      throw new Error(
        "Fallback dist publishing is not supported for this project type yet. Only Vite projects are currently supported.",
      );
    }

    console.log("[FallbackDist] Starting dist build", {
      projectId: project._id,
      semanticIdentifier: project.semantic_identifier,
      lastDistBuildAt,
      force,
      framework,
    });

    const tscResult = await codebase.runCommand(
      packageManager.run("tsc -b"),
      60_000,
    );
    if (tscResult.exitCode !== 0) {
      console.warn("[FallbackDist] TypeScript errors in project (build continues):", tscResult.output);
    }

    await codebase.runCommandThrow(
      packageManager.run("vite build"),
      120_000,
    );

    await codebase.runCommandThrow(
      "mkdir -p isolate && find isolate -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -R dist/* isolate",
      20_000,
    );

    const files = await codebase.prepareForDeployment();
    const config = getR2Config();
    const prefix = getFallbackPrefix(project.semantic_identifier);

    await deleteR2Prefix(config, prefix);
    await uploadDistFiles(config, project.semantic_identifier, files);

    await ctx.runMutation(internal.project.setLastDistBuildAt, {
      projectId: project._id,
      lastDistBuildAt: Date.now(),
    });

    console.log("[FallbackDist] Dist publish complete", {
      projectId: project._id,
      semanticIdentifier: project.semantic_identifier,
      fileCount: files.length,
    });

    return null;
  },
});
