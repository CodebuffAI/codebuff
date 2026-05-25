import { configureUsageLogging, createDeployKey } from "!/convex_management";
import axios, { isAxiosError } from "axios";
import { DeploymentSource } from "freestyle-sandboxes";
import { ActionCtx } from "../convex/_generated/server";
import { Failure, Result, Success } from "../lib/utils";
import { injectBranding } from "./branding/branding-injector";
import {
  Codebase,
  DevServerCodebase,
  EnvironmentVariableCodebase,
  EnvVars,
  FreestyleDeployableCodebase,
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
  const result = await convexDashboardAxios.get<{ projectId: ConvexProjectId }>(
    `/dashboard/teams/5950/deployments/${deploymentName}`,
  );
  return result.data.projectId;
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
) {
  try {
    await axios.post(
      `https://${deploymentName}.convex.cloud/api/update_environment_variables`,
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

export async function deployCodebaseProd(
  slug: string,
  codebase: EnvironmentVariableCodebase &
    FreestyleDeployableCodebase &
    DevServerCodebase &
    PackageManagerCodebase &
    Codebase,
  envVars: EnvVars,
  ctx: ActionCtx,
  setLog: (log: string) => Promise<void>,
  skipBranding: boolean,
  prodCredentials?: { name: string; key: string },
): Promise<
  Result<
    { deploymentId: string; projectId: string; domains: string[] },
    DeploymentError
  >
> {
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
  const { key: convexProdDeployKey, name: prodDeploymentName } = prodCredentials
    ? {
        key: prodCredentials.key as `prod:${string}|${string}`,
        name: prodCredentials.name,
      }
    : await getConvexProdDeployKey(codebase);

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
  );

  try {
    await setLog("Running build...");

    // Use the correct package manager for this codebase
    const pm = codebase.getPackageManager();

    await codebase.runCommandThrow(
      `${pm.add("convex@latest")} && CONVEX_DEPLOY_KEY='${convexProdDeployKey}' ${pm.run("convex deploy --yes --cmd 'tsc -b && vite build'")}`,
      120_000,
    );

    // Inject Vly branding into dist/index.html (skip for paid users with no_vlyai_branding feature)
    if (!skipBranding) {
      try {
        // 1. Read dist/index.html from the sandbox
        const html = await codebase.readFile("dist/index.html");

        // 2. Apply centralized branding injection logic
        const updatedHtml = injectBranding(html);

        // 3. Write the updated HTML back to dist/index.html
        await codebase.writeFile("dist/index.html", updatedHtml);
      } catch (err) {
        console.error("Branding injection failed:", err);
        if (err instanceof Error) {
          console.error("Error message:", err.message);
          if ((err as any).stack) {
            console.error("Stack:", (err as any).stack);
          }
        }
        const anyErr = err as any;
        if (anyErr && anyErr.stdout) {
          console.error("[branding-inject] stdout:\n" + anyErr.stdout);
        }
        if (anyErr && anyErr.stderr) {
          console.error("[branding-inject] stderr:\n" + anyErr.stderr);
        }
        // Optionally: rethrow or continue
      }
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
    // Stage deployment artifacts inside projectDir (`codebase/isolate`) so we
    // don't depend on write permissions in the parent directory.
    await codebase.runCommandThrow(
      "mkdir -p isolate && find isolate -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -R dist isolate",
      20_000,
    );
    await codebase.runCommandThrow("cp package.json isolate");
    await codebase.runCommandThrow("cp main.ts isolate");

    // Copy the appropriate lockfile based on package manager
    const lockfileName = codebase.getLockfileName();

    // Check if lockfile exists using direct command (we're already in projectDir)
    const checkResult = await codebase.runCommand(
      `test -f ${lockfileName} && echo "exists" || echo "not found"`,
    );
    const lockfileExists = checkResult.output.trim() === "exists";

    if (lockfileExists) {
      await codebase.runCommandThrow(`cp ${lockfileName} isolate`);
    } else {
      console.warn(
        `[deployCodebaseProd] Warning: Expected lockfile '${lockfileName}' not found. Checking for alternative lockfiles...`,
      );

      // Check for alternative lockfile (pnpm-lock.yaml if we expected bun.lock, or vice versa)
      const alternativeLockfile =
        lockfileName === "bun.lock" ? "pnpm-lock.yaml" : "bun.lock";
      const altCheckResult = await codebase.runCommand(
        `test -f ${alternativeLockfile} && echo "exists" || echo "not found"`,
      );
      const alternativeExists = altCheckResult.output.trim() === "exists";

      if (alternativeExists) {
        console.warn(
          `[deployCodebaseProd] Found alternative lockfile '${alternativeLockfile}'. This indicates a package manager mismatch.`,
        );
        await codebase.runCommandThrow(`cp ${alternativeLockfile} isolate`);
      } else {
        throw new Error(
          `No lockfile found (checked ${lockfileName} and ${alternativeLockfile}). Cannot proceed with deployment.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      // Check if this is a cancellation error and propagate it directly
      if (error.message === "Deployment cancelled by user") {
        return Failure(
          new DeploymentError(error.message, {
            buildLog: "",
          }),
        );
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

  const deploymentSource =
    (await codebase.prepareForDeployment()) satisfies DeploymentSource;

  console.log(Object.keys(deploymentSource.files));

  try {
    try {
      await setLog("Deploying artifacts...");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Deployment cancelled by user"
      ) {
        return Failure(new DeploymentError(error.message, { buildLog: "" }));
      }
      throw error;
    }

    // Using the HTTP api instead of SDK because SDK causes bundle size to be too large
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000 * 60 * 10); // 10 minutes

    const requestBody = {
      source: deploymentSource,
      config: {
        domains: [`${slug}.vly.site`],
        entrypoint: "main.ts",
        envVars: {
          ...envVars.frontend,
        },
      },
    };

    const requestBodySize = JSON.stringify(requestBody).length;

    console.log("requestBodySize: " + requestBodySize);

    let fetchResponse: Response;
    try {
      fetchResponse = await fetch(
        "https://api.freestyle.sh/web/v1/deployment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              "Bearer RknaoLCFjJyV3qo8c1j2mo-9dn2c9DvpCB5x29GvjNp1jpPe7nRAXw8WihTHx3edqK5",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    console.log("status:", fetchResponse.status);

    let data: any;
    try {
      data = await fetchResponse.json();
    } catch (e) {
      throw new DeploymentError("Failed to parse deployment response", {
        buildLog: `Invalid JSON response: ${e}`,
      });
    }

    if ("message" in data) {
      console.log("result.data:", JSON.stringify(data, null, 2));
      return Failure(
        new DeploymentError("Failed to deploy codebase", {
          buildLog: data.message,
        }),
      );
    }

    return Success(data);
  } catch (error) {
    // Check if this is a cancellation error and propagate it
    if (
      error instanceof Error &&
      error.message === "Deployment cancelled by user"
    ) {
      return Failure(
        new DeploymentError(error.message, {
          buildLog: "",
        }),
      );
    }

    console.log("Error deploying codebase:", JSON.stringify(error, null, 2));
    // fetch does not have isAxiosError, so just print error
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      console.error("Deployment error: request timed out or aborted");
    } else {
      console.error("Unexpected error:", error);
    }
    throw error;
  }
}
