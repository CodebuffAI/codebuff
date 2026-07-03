"use node";

import { createHash, createHmac } from "node:crypto";

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
const UPLOAD_SCRIPT_PATH = ".vly-dist-upload.sh";
const PRESIGN_EXPIRY_SECONDS = 15 * 60;

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

type R2S3Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * S3-style credentials used only to presign PUT URLs so the sandbox can
 * upload the dist directly to R2. The master Cloudflare API token must never
 * enter the sandbox (user code runs there); presigned URLs are scoped to a
 * single object key and expire after a few minutes.
 */
function getR2S3Credentials(): R2S3Credentials | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    return null;
  }
  return { accessKeyId, secretAccessKey };
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

async function deleteR2Keys(config: R2Config, keys: string[]) {
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

async function deleteR2Prefix(config: R2Config, prefix: string) {
  const keys = await listR2KeysByPrefix(config, prefix);
  await deleteR2Keys(config, keys);
}

// --- SigV4 presigning (query-string auth) for R2's S3 API -------------------

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** RFC 3986 encoding as required by SigV4 canonical URIs/query strings. */
function awsUriEncode(value: string, encodeSlash: boolean): string {
  let out = "";
  for (const char of value) {
    if (/[A-Za-z0-9\-._~]/.test(char)) {
      out += char;
    } else if (char === "/" && !encodeSlash) {
      out += char;
    } else {
      out += Array.from(Buffer.from(char, "utf8"))
        .map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    }
  }
  return out;
}

function presignR2PutUrl(opts: {
  accountId: string;
  bucketName: string;
  credentials: R2S3Credentials;
  key: string;
  expiresSeconds: number;
  now?: Date;
}): string {
  const { accountId, bucketName, credentials, key, expiresSeconds } = opts;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now = opts.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalUri = `/${awsUriEncode(bucketName, false)}/${awsUriEncode(key, false)}`;

  const queryParams: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${credentials.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQueryString = queryParams
    .map(([k, v2]) => `${awsUriEncode(k, true)}=${awsUriEncode(v2, true)}`)
    .sort()
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// --- Sandbox-side upload ----------------------------------------------------

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build a shell script that uploads each dist file from inside the sandbox
 * directly to R2 via presigned PUT URLs. The dist bytes never transit the
 * Convex action, which previously accounted for the bulk of this function's
 * data egress.
 */
function buildUploadScript(
  uploads: Array<{ relativePath: string; url: string; contentType: string }>,
): string {
  const lines = [
    "#!/bin/bash",
    "set -u",
    "cd isolate",
    "fail=0",
    "upload() {",
    '  local p="$1"; local u="$2"; local ct="$3"',
    "  for attempt in 1 2 3; do",
    '    if curl --fail --silent --show-error -X PUT -H "Content-Type: $ct" --upload-file "$p" "$u"; then',
    "      return 0",
    "    fi",
    "    sleep 1",
    "  done",
    '  echo "UPLOAD FAILED: $p" >&2',
    "  return 1",
    "}",
  ];
  for (const upload of uploads) {
    lines.push(
      `upload ${shellQuote(upload.relativePath)} ${shellQuote(upload.url)} ${shellQuote(upload.contentType)} || fail=1`,
    );
  }
  lines.push('exit "$fail"');
  return lines.join("\n") + "\n";
}

async function listDistFiles(codebase: Codebase): Promise<string[]> {
  const result = await codebase.runCommandThrow(
    `cd isolate && find . -type f | sed 's|^\\./||'`,
    30_000,
  );
  return result.output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Upload directly from the sandbox to R2 using presigned URLs. */
async function uploadDistFromSandbox(
  codebase: Codebase,
  config: R2Config,
  s3Credentials: R2S3Credentials,
  semanticIdentifier: string,
): Promise<{ fileCount: number; uploadedKeys: string[] }> {
  const relativePaths = await listDistFiles(codebase);
  if (relativePaths.length === 0) {
    throw new Error("Dist build produced no files to upload");
  }

  const prefix = getFallbackPrefix(semanticIdentifier);
  const uploads = relativePaths.map((relativePath) => ({
    relativePath,
    url: presignR2PutUrl({
      accountId: config.accountId,
      bucketName: config.bucketName,
      credentials: s3Credentials,
      key: `${prefix}${relativePath}`,
      expiresSeconds: PRESIGN_EXPIRY_SECONDS,
    }),
    contentType: getContentType(relativePath),
  }));

  await codebase.writeFile(UPLOAD_SCRIPT_PATH, buildUploadScript(uploads));
  try {
    // Timeout scales with file count; uploads run sequentially with retries.
    const timeoutMs = Math.max(120_000, uploads.length * 5_000);
    await codebase.runCommandThrow(`bash ${UPLOAD_SCRIPT_PATH}`, timeoutMs);
  } finally {
    try {
      await codebase.deleteFile(UPLOAD_SCRIPT_PATH);
    } catch {
      // Best effort cleanup; a leftover script contains only expired URLs.
    }
  }

  return {
    fileCount: uploads.length,
    uploadedKeys: uploads.map((u) => `${prefix}${u.relativePath}`),
  };
}

/**
 * Legacy path: download every dist file into the action and PUT it to R2.
 * Only used when R2 S3 credentials are not configured. Expensive — the whole
 * dist transits the Convex action (egress + compute).
 */
async function uploadDistThroughAction(
  codebase: Codebase & { prepareForDeployment: () => Promise<VercelDeploymentFile[]> },
  config: R2Config,
  semanticIdentifier: string,
): Promise<{ fileCount: number }> {
  const files = await codebase.prepareForDeployment();
  const baseUrl = getR2ObjectsBaseUrl(config);
  const prefix = getFallbackPrefix(semanticIdentifier);

  await deleteR2Prefix(config, prefix);

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

  return { fileCount: files.length };
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

    const config = getR2Config();
    const prefix = getFallbackPrefix(project.semantic_identifier);
    const s3Credentials = getR2S3Credentials();

    let fileCount: number;
    if (s3Credentials) {
      // Upload new files first, then delete only stale keys, so a failed
      // upload never leaves the fallback prefix empty.
      const existingKeys = await listR2KeysByPrefix(config, prefix);
      const result = await uploadDistFromSandbox(
        codebase,
        config,
        s3Credentials,
        project.semantic_identifier,
      );
      fileCount = result.fileCount;

      const uploadedKeySet = new Set(result.uploadedKeys);
      const staleKeys = existingKeys.filter((key) => !uploadedKeySet.has(key));
      await deleteR2Keys(config, staleKeys);
    } else {
      console.warn(
        "[FallbackDist] R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set; falling back to uploading through the Convex action (expensive egress). Configure R2 S3 credentials to enable direct sandbox-to-R2 uploads.",
      );
      const result = await uploadDistThroughAction(
        codebase as any,
        config,
        project.semantic_identifier,
      );
      fileCount = result.fileCount;
    }

    await ctx.runMutation(internal.project.setLastDistBuildAt, {
      projectId: project._id,
      lastDistBuildAt: Date.now(),
    });

    console.log("[FallbackDist] Dist publish complete", {
      projectId: project._id,
      semanticIdentifier: project.semantic_identifier,
      fileCount,
      directUpload: !!s3Credentials,
    });

    return null;
  },
});
