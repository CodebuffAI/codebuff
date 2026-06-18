import { configureUsageLogging, createDeployKey } from "!/convex_management";
import axios, { isAxiosError } from "axios";
import { internal } from "../convex/_generated/api";
import { ActionCtx } from "../convex/_generated/server";
import { Failure, Result, Success } from "../lib/utils";
import { injectBranding } from "./branding/branding-injector";
import {
  Codebase,
  DevServerCodebase,
  EnvironmentVariableCodebase,
  EnvVars,
  VercelDeployableCodebase,
  VercelDeploymentFile,
  PackageManagerCodebase,
} from "./codebase/Codebase";

const convexAxiosV1 = axios.create({
  baseURL: "https://api.convex.dev/v1",
  headers: {
    Authorization: `Bearer ${process.env.CONVEX_ADMIN_KEY}`,
  },
});

const convexDashboardAxios = axios.create({
  baseURL: "https://api.convex.dev/api",
  headers: {
    Authorization: `Bearer ${process.env.CONVEX_ADMIN_KEY}`,
  },
});
export type ConvexProjectId = number & { __type: "convexProjectId" };
export type ConvexDeploymentId = number & { __type: "convexDeploymentId" };

export async function getDeploymentsForProject(projectId: ConvexProjectId) {
  try {
    const result = await convexAxiosV1.get<
      {
        id: ConvexDeploymentId;
        name: string;
        deploymentType: "dev" | "prod" | "preview";
        projectId: ConvexProjectId;
      }[]
    >(`/projects/${projectId}/list_deployments`);

    return result.data.map((d) => ({
      ...d,
      type: d.deploymentType,
    }));
  } catch (error) {
    console.error(`Error getting deployments for project ${projectId}:`, error);
    throw error;
  }
}

export async function listConvexProjects() {
  try {
    const projectResult = await convexDashboardAxios.get<
      { id: number; slug: string }[]
    >("/dashboard/teams/5950/projects");

    return projectResult.data;
  } catch (error) {
    console.error("Error listing Convex projects:", error);
    throw error;
  }
}

export async function findProjectIdForDeploymentName(
  deploymentName: string,
): Promise<ConvexProjectId | undefined> {
  try {
    const result = await convexAxiosV1.get<{
      projectId?: ConvexProjectId;
      project_id?: ConvexProjectId;
      project?: { id?: ConvexProjectId };
    }>(`/deployments/${deploymentName}`);

    const projectId =
      result.data.projectId ??
      result.data.project_id ??
      result.data.project?.id;

    if (!projectId) {
      console.error(
        `[Convex] Deployment lookup missing projectId for deploymentName=${deploymentName}`,
        result.data,
      );
      return undefined;
    }

    return projectId;
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        `[Convex] deployment lookup failed for deploymentName=${deploymentName} status=${error.response?.status} url=${error.config?.url}`,
      );
      console.error("[Convex] deployment lookup response:", error.response?.data);
    }
    throw error;
  }
}

export async function getConvexDeploymentAdminKey({
  projectSlug,
  deploymentType,
}: {
  projectSlug: string;
  deploymentType: "dev" | "prod";
}) {
  try {
    return await createDeployKey(projectSlug, deploymentType);
    const result = await convexDashboardAxios.post<{
      deploymentName: string;
      url: string;
      adminKey: string;
    }>(
      "/deployment/provision_and_authorize",
      {
        teamSlug: "vly",
        projectSlug,
        deploymentType,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    return result.data.adminKey;
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        "Error getting convex deployment admin key:",
        error.response?.data,
      );
    }
    throw error;
  }
}

/**
 * Gets or creates a prod deploy key for a deployment.
 * Checks if a key exists in the sandbox first before creating a new one.
 */
async function getOrCreateProdDeployKey(
  deploymentName: string,
  codebase: EnvironmentVariableCodebase & Codebase,
): Promise<string> {
  // Check if a prod key already exists in the sandbox
  const keyCheckResult = await codebase.runCommand(
    `cat $HOME/.vly-convex/prod.key 2>/dev/null || echo ""`,
  );

  const existingKey = keyCheckResult.output.trim();

  if (existingKey && keyCheckResult.exitCode === 0) {
    console.log(
      `Reusing existing prod deploy key for deployment ${deploymentName}`,
    );
    return existingKey;
  }

  // No existing key found, create a new one
  console.log(`Creating new prod deploy key for deployment ${deploymentName}`);
  const deployKey = await createDeployKey(deploymentName);

  // Store the key in the sandbox for future use
  await codebase.runCommand(
    `mkdir -p $HOME/.vly-convex && echo "${deployKey}" > $HOME/.vly-convex/prod.key`,
  );

  return deployKey;
}

export async function getOrCreateProdDeploymentName(
  projectId: ConvexProjectId,
  codebase?: EnvironmentVariableCodebase & Codebase,
) {
  const deployments = await getDeploymentsForProject(projectId);

  const prodDeployment = deployments.find((d) => d.type === "prod");

  if (prodDeployment) {
    return prodDeployment.name;
  }

  try {
    const result = await convexAxiosV1.post<{ name: string }>(
      `/projects/${projectId}/create_deployment`,
      { type: "prod" },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const prodDeploymentName = result.data.name;

    // Configure usage logging for the new prod deployment
    if (codebase) {
      try {
        const deployKey = await getOrCreateProdDeployKey(
          prodDeploymentName,
          codebase,
        );
        await configureUsageLogging(prodDeploymentName, deployKey);
      } catch (loggingError) {
        console.error(
          "Failed to configure usage logging for prod deployment:",
          loggingError,
        );
        // Don't fail the deployment if logging configuration fails
      }
    }

    return prodDeploymentName;
  } catch (error) {
    console.error(
      `Error creating prod deployment for project ${projectId}:`,
      error,
    );
    throw error;
  }
}

export async function getConvexProdDeploymentNameFromCodebase(
  codebase: EnvironmentVariableCodebase,
) {
  const devDeploymentName =
    await getConvexDevDeploymentNameFromCodebase(codebase);

  const projectId = await findProjectIdForDeploymentName(devDeploymentName);

  if (!projectId) {
    throw new Error(
      "No project id found for deployment name " + devDeploymentName,
    );
  }

  return await getOrCreateProdDeploymentName(projectId);
}

export async function getConvexDevDeploymentNameFromCodebase(
  codebase: EnvironmentVariableCodebase,
) {
  // get the convex dev deployment name from the environment variables
  const envVars = await codebase.getEnvVars();

  const convexDevDeploymentName =
    envVars.frontend.CONVEX_DEPLOYMENT?.split(":")[1];

  return convexDevDeploymentName;
}

export async function getConvexProdDeployKey(
  codebase: EnvironmentVariableCodebase & Codebase,
): Promise<{ name: string; key: `prod:${string}|${string}` }> {
  const convexDevDeploymentName =
    await getConvexDevDeploymentNameFromCodebase(codebase);

  if (!convexDevDeploymentName) {
    throw new Error("No convex dev deployment name found");
  }

  // find the convex project ID associated with that deployment name
  const projectId = await findProjectIdForDeploymentName(
    convexDevDeploymentName,
  );

  if (!projectId) {
    throw new Error(
      "No project id found for deployment name " + convexDevDeploymentName,
    );
  }

  const prodDeploymentName = await getOrCreateProdDeploymentName(
    projectId,
    codebase,
  );

  try {
    const deployKey = await getOrCreateProdDeployKey(
      prodDeploymentName,
      codebase,
    );

    return {
      name: prodDeploymentName,
      key: deployKey as any,
    };
  } catch (error) {
    console.error(
      `Error getting admin key for deployment ${prodDeploymentName}:`,
      error,
    );
    throw error;
  }
}

export async function setEnvVarsOnDeployment(
  deploymentName: string,
  deployKey: string,
  envVars: Record<string, string>,
  deploymentUrl?: string,
) {
  const baseUrl = deploymentUrl ?? `https://${deploymentName}.convex.cloud`;
  try {
    await axios.post(
      `${baseUrl}/api/v1/update_environment_variables`,
      {
        changes: Object.entries(envVars).map(([key, value]) => ({
          name: key,
          value,
        })),
      },
      {
        headers: {
          Authorization: `Convex ${deployKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log(
      "Successfully set environment variables on deployment",
      deploymentName,
    );
  } catch (error) {
    console.error(
      `Error setting environment variables on deployment ${deploymentName}:`,
      error,
    );
    throw error;
  }
}

export class DeploymentError extends Error {
  public readonly buildLog: string;

  constructor(message: string, options: { buildLog: string }) {
    super(message);

    this.name = this.constructor.name;
    this.buildLog = options.buildLog;
  }
}

async function uploadFilesToVercel(
  files: VercelDeploymentFile[],
): Promise<void> {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  await Promise.all(
    files.map(async (file) => {
      const response = await fetch(
        `https://api.vercel.com/v2/files?teamId=${teamId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            "Content-Type": "application/octet-stream",
            "Content-Length": String(file.size),
            "x-vercel-digest": file.sha,
          },
          body: new Uint8Array(file.content),
        },
      );

      if (!response.ok && response.status !== 409) {
        const text = await response.text();
        throw new Error(
          `Failed to upload file ${file.file}: ${response.status} ${text}`,
        );
      }
    }),
  );
}

async function getOrCreateVercelProject(
  slug: string,
  existingVercelProjectId?: string,
): Promise<string> {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  // 1. If we have an existing Vercel project ID from a previous deployment, verify it still exists
  if (existingVercelProjectId) {
    const checkResponse = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(existingVercelProjectId)}?teamId=${teamId}`,
      {
        headers: { Authorization: `Bearer ${vercelToken}` },
      },
    );

    if (checkResponse.ok) {
      console.log(
        `[Vercel] Reusing existing Vercel project by ID: ${existingVercelProjectId}`,
      );
      return existingVercelProjectId;
    }
    console.log(
      `[Vercel] Stored project ID ${existingVercelProjectId} not found on Vercel, falling back to slug lookup`,
    );
  }

  // 2. Try to find project by slug
  const getResponse = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(slug)}?teamId=${teamId}`,
    {
      headers: { Authorization: `Bearer ${vercelToken}` },
    },
  );

  if (getResponse.ok) {
    const project = await getResponse.json();
    console.log(
      `[Vercel] Found existing Vercel project by slug ${slug}: ${project.id}`,
    );
    return project.id;
  }

  // 3. Create new project only if no existing one was found
  console.log(
    `[Vercel] No existing project found, creating new Vercel project: ${slug}`,
  );
  const createResponse = await fetch(
    `https://api.vercel.com/v10/projects?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
        framework: null,
        buildCommand: "",
        outputDirectory: ".",
      }),
    },
  );

  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(
      `Failed to create Vercel project: ${createResponse.status} ${text}`,
    );
  }

  const created = await createResponse.json();
  return created.id;
}

async function createVercelDeployment(
  slug: string,
  vercelProjectId: string,
  files: VercelDeploymentFile[],
): Promise<{ id: string; url: string; readyState: string }> {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  const response = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
        target: "production",
        project: vercelProjectId,
        files: files.map((f) => ({
          file: f.file,
          sha: f.sha,
          size: f.size,
        })),
        projectSettings: {
          framework: null,
          buildCommand: "",
          outputDirectory: ".",
        },
        routes: [
          { handle: "filesystem" },
          { src: "/(.*)", dest: "/index.html" },
        ],
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new DeploymentError(`Vercel deployment failed: ${response.status}`, {
      buildLog: text,
    });
  }

  return await response.json();
}

async function assignVercelDomain(
  vercelProjectId: string,
  domain: string,
): Promise<void> {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${vercelProjectId}/domains?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    },
  );

  // 409 means domain already assigned — that's fine for subsequent deploys
  if (!response.ok && response.status !== 409) {
    const text = await response.text();
    console.error(
      `Failed to assign domain ${domain}: ${response.status} ${text}`,
    );
  }
}

export async function deployCodebaseProd(
  slug: string,
  codebase: EnvironmentVariableCodebase &
    VercelDeployableCodebase &
    DevServerCodebase &
    PackageManagerCodebase &
    Codebase,
  envVars: EnvVars,
  ctx: ActionCtx,
  setLog: (log: string) => Promise<void>,
  skipBranding: boolean,
  prodCredentials?: { name: string; key: string; url?: string },
  existingVercelProjectId?: string,
): Promise<
  Result<
    { deploymentId: string; projectId: string; domains: string[] },
    DeploymentError
  >
> {
  const isProdBrandingInjectionEnabled = await ctx.runQuery(
    internal.settings.getInternal,
    {
      key: "prod_branding_injection_enabled",
      defaultValue: true,
    },
  );

  try {
    await setLog("Setting up Convex prod deployment...");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Deployment cancelled by user"
    ) {
      return Failure(new DeploymentError(error.message, { buildLog: "" }));
    }
    throw error;
  }

  // Use provided credentials (self-hosted) or fetch from VLY
  const {
    key: convexProdDeployKey,
    name: prodDeploymentName,
    url: prodDeploymentUrl,
  } = prodCredentials
    ? {
        key: prodCredentials.key as `prod:${string}|${string}`,
        name: prodCredentials.name,
        url: prodCredentials.url,
      }
    : { ...(await getConvexProdDeployKey(codebase)), url: undefined };

  const strippedProdDeployKey = convexProdDeployKey.split(":")[1];

  try {
    await setLog("Setting environment variables...");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Deployment cancelled by user"
    ) {
      return Failure(new DeploymentError(error.message, { buildLog: "" }));
    }
    throw error;
  }

  await setEnvVarsOnDeployment(
    prodDeploymentName,
    strippedProdDeployKey,
    envVars.backend,
    prodDeploymentUrl,
  );

  try {
    await setLog("Running build...");

    const pm = codebase.getPackageManager();

    await codebase.runCommandThrow(
      `${pm.add("convex@latest")} && CONVEX_DEPLOY_KEY='${convexProdDeployKey}' ${pm.run("convex deploy --yes --cmd 'tsc -b && vite build'")}`,
      120_000,
    );

    if (!skipBranding && isProdBrandingInjectionEnabled) {
      try {
        const html = await codebase.readFile("dist/index.html");
        const updatedHtml = injectBranding(html);
        await codebase.writeFile("dist/index.html", updatedHtml);
      } catch (err) {
        console.error("Branding injection failed:", err);
      }
    } else if (!isProdBrandingInjectionEnabled) {
      console.log(
        "[Deploy] Skipping branding injection - disabled by admin setting",
      );
    } else {
      console.log(
        "[Deploy] Skipping branding injection - user has no_vlyai_branding feature",
      );
    }

    try {
      await setLog("Copying build artifacts...");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Deployment cancelled by user"
      ) {
        return Failure(new DeploymentError(error.message, { buildLog: "" }));
      }
      throw error;
    }

    // Stage only dist/ into isolate — Vercel serves static files directly, no server entrypoint needed
    await codebase.runCommandThrow(
      "mkdir -p isolate && find isolate -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -R dist/* isolate",
      20_000,
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Deployment cancelled by user") {
        return Failure(new DeploymentError(error.message, { buildLog: "" }));
      }
      console.error("Error running build:", error.message);
      return Failure(
        new DeploymentError("Failed to deploy codebase", {
          buildLog: error.message,
        }),
      );
    }
    throw error;
  }

  const deploymentFiles = await codebase.prepareForDeployment();
  console.log(
    "Files to deploy:",
    deploymentFiles.map((f) => f.file),
  );

  try {
    try {
      await setLog("Uploading files to Vercel...");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Deployment cancelled by user"
      ) {
        return Failure(new DeploymentError(error.message, { buildLog: "" }));
      }
      throw error;
    }

    // Step 1: Get or create Vercel project (reuse existing if available)
    const vercelProjectId = await getOrCreateVercelProject(
      slug,
      existingVercelProjectId,
    );

    // Step 2: Upload all files
    await uploadFilesToVercel(deploymentFiles);

    try {
      await setLog("Creating Vercel deployment...");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Deployment cancelled by user"
      ) {
        return Failure(new DeploymentError(error.message, { buildLog: "" }));
      }
      throw error;
    }

    // Step 3: Create deployment
    const vercelDeployment = await createVercelDeployment(
      slug,
      vercelProjectId,
      deploymentFiles,
    );

    console.log("Vercel deployment created:", vercelDeployment.id);

    await assignVercelDomain(vercelProjectId, `${slug}.freebuff.app`);

    return Success({
      deploymentId: vercelDeployment.id,
      projectId: vercelProjectId,
      domains: [`${slug}.freebuff.app`],
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Deployment cancelled by user"
    ) {
      return Failure(new DeploymentError(error.message, { buildLog: "" }));
    }

    if (error instanceof DeploymentError) {
      return Failure(error);
    }

    console.error("Error deploying to Vercel:", error);
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      console.error("Deployment error: request timed out or aborted");
    }
    throw error;
  }
}
