"use node";

import {
  configureUsageLogging,
  createConvexProject,
  createDeployKey,
  generateJWTKeyPair,
  setConvexEnvironmentVariables,
} from "!/convex_management";
import { MODELS } from "!/utils/registry";
import { generateText } from "ai";
import { v } from "convex/values";
import crypto from "crypto";
import {
  Codebase,
  hasDevServer,
  hasEnvironmentVariables,
  hasPackageManager,
} from "../../codebase-utils/codebase/Codebase";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import {
  configProxy,
  createDaytonaSandbox,
} from "../../codebase-utils/instanceManager";
import { api, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

export const assignProxy = internalAction({
  args: {
    slug: v.string(),
    target: v.string(),
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    await configProxy({
      slug: args.slug,
      target: args.target,
    });

    const previewUrl = `https://${args.slug}.freebuff.dev`;
    // @ts-ignore
    await ctx.runMutation(internal.project.setPrettyPreviewUrl, {
      projectId: args.projectId,
      prettyPreviewUrl: previewUrl,
    });
  },
});

export const setupConvexProjectForSandboxAction = internalAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Fetch project details
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.sandbox_id) {
      throw new Error("Project does not have a sandbox_id");
    }

    // Create sandbox instance and call the helper function
    const migration = await ctx.runQuery(
      internal.project.getProjectDaytonaMigration,
      { projectId: project._id },
    );

    const sandbox = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
      migration?.daytona_server ?? "legacy",
    );
    const { convexProjectId, deploymentName } =
      await setupConvexProjectForSandbox(sandbox, project.semantic_identifier);

    await ctx.runMutation(internal.convex_instance.save, {
      projectId: args.projectId,
      convexProjectId: convexProjectId,
      devDeploymentName: deploymentName,
      prodDeploymentName: null,
      upsert: true,
    });
  },
});

/**
 * Helper function to set up Convex project infrastructure for a sandbox
 * Creates Convex project, sets environment variables, and configures deployment keys
 */
async function setupConvexProjectForSandbox(
  sandbox: Codebase,
  semanticIdentifier?: string,
): Promise<{
  convexProjectId: number;
  deploymentName: string;
  deploymentUrl: string;
}> {
  // Create Convex project
  const convexProject = await createConvexProject();
  console.log("Created convex project:", JSON.stringify(convexProject));

  // Set Convex environment variables
  console.log("Setting convex environment variables");
  if (!hasEnvironmentVariables(sandbox)) {
    throw new Error("Codebase does not support environment variables");
  }

  await sandbox.setEnvVars({
    frontend: {
      VITE_CONVEX_URL: convexProject.deploymentUrl,
      CONVEX_DEPLOYMENT: `dev:${convexProject.deploymentName}`,
      ...(semanticIdentifier && {
        VITE_VLY_APP_ID: semanticIdentifier,
        VITE_VLY_MONITORING_URL: `${process.env.CONVEX_SITE_URL}/runtime-error`,
      }),
    },
    backend: {},
  });
  // Create deployment key first (needed for both env vars and usage logging)
  const deploymentKey = await createDeployKey(convexProject.deploymentName);

  // Generate JWT key pair for Convex Auth
  console.log("Generating JWT key pair for Convex Auth");
  const { privateKey, jwks } = await generateJWTKeyPair();

  // Set Convex backend environment variables (JWT keys and site URL)
  console.log("Setting Convex backend environment variables");
  await setConvexEnvironmentVariables(
    convexProject.deploymentName,
    deploymentKey,
    {
      JWT_PRIVATE_KEY: privateKey,
      JWKS: jwks,
      SITE_URL: process.env.CONVEX_SITE_URL || "http://localhost:3000",
    },
  );
  // Configure usage logging for the deployment
  await configureUsageLogging(convexProject.deploymentName, deploymentKey);
  // Store deployment key in sandbox (for potential manual CLI usage)
  await sandbox.runCommand(
    `mkdir -p $HOME/.vly-convex && echo "${deploymentKey}" > $HOME/.vly-convex/dev.key`,
  );

  // Restart dev server to apply changes
  if (!hasDevServer(sandbox)) {
    throw new Error("Codebase does not support dev server management");
  }
  await sandbox.restartDevServer();

  return {
    convexProjectId: convexProject.projectId,
    deploymentName: convexProject.deploymentName,
    deploymentUrl: convexProject.deploymentUrl,
  };
}

export const initializeUnassignedProject = internalAction({
  args: {
    snapshotId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log("Starting background project creation");
    const snapshotId = args.snapshotId ?? process.env.DAYTONA_SNAPSHOT_ID;

    // Create the sandbox and start its preview server
    try {
      const { id: daytonaSandboxId } = await createDaytonaSandbox(
        "new",
        snapshotId,
      );
      console.log("Created daytona sandbox:", { daytonaSandboxId, snapshotId });

      // Create the sandbox codebase - initially without specifying package manager
      // so it will be auto-detected from the template
      const sandbox = await initializeCodebase(
        "daytona:" + daytonaSandboxId,
        undefined,
        "new",
      );

      await sandbox.runCommandThrow("rm -rf node_modules", 30_000);

      await sandbox.installDependencies();

      // Set up Convex project infrastructure
      const { convexProjectId, deploymentName } =
        await setupConvexProjectForSandbox(sandbox);

      // TODO: fix this
      // const { previewUrl } = await startPreviewServerAndGetUrl(codeSandboxId);
      const previewUrl = await sandbox.getPreviewUrl();

      // Get the detected package manager from the codebase
      if (!hasPackageManager(sandbox)) {
        throw new Error("Codebase does not support package manager detection");
      }
      const detectedPackageManager = sandbox.getPackageManagerName();
      console.log("Detected package manager:", detectedPackageManager);

      const { semanticIdentifier, id: projectId } = await ctx.runMutation(
        internal.codesandbox.projectCrud.createUnassignedProject,
        {
          preview_url: previewUrl,
          sandbox_id: "daytona:" + daytonaSandboxId,
          daytona_server: "new",
          github_url: "", //htmlUrl,
          template_id: snapshotId,
          packageManager: detectedPackageManager,
        },
      );
      console.log("created project", semanticIdentifier, projectId);

      console.log("Saving convex instance");
      await ctx.runMutation(internal.convex_instance.save, {
        projectId: projectId,
        convexProjectId: convexProjectId,
        devDeploymentName: deploymentName,
        prodDeploymentName: null,
        upsert: true,
      });

      const project = await ctx.runQuery(
        internal.project.getProjectFromIdentifier,
        {
          semanticIdentifier: semanticIdentifier,
        },
      );

      if (!project) {
        throw new Error("Assigned project does not exist");
      }

      // Generate a bearer token to be used for integration auth
      const integrationKey = "sk_" + crypto.randomBytes(32).toString("hex");
      console.log(
        "Generated integration key:",
        integrationKey.substring(0, 10) + "...",
      );

      console.log(
        "Saving integration key to database for project:",
        project._id,
      );
      await ctx.runMutation(
        internal.integration_auth.createIntegrationBearerKey,
        {
          projectId: project._id,
          key: integrationKey,
        },
      );

      // Set additional VLY app environment variables including integrations
      if (!hasEnvironmentVariables(sandbox)) {
        throw new Error("Codebase does not support environment variables");
      }

      // Set frontend environment variables
      await sandbox.setEnvVars({
        frontend: {
          VITE_VLY_APP_ID: semanticIdentifier,
          VITE_VLY_MONITORING_URL: `${process.env.CONVEX_SITE_URL}/runtime-error`,
        },
        backend: {}, // Backend vars will be set via API
      });

      // Set backend environment variables via Deployment API
      // Create a deployment-specific key for setting environment variables
      const envVarsDeployKey = await createDeployKey(
        deploymentName,
        `env-vars-init-${Date.now()}`,
      );
      await setConvexEnvironmentVariables(deploymentName, envVarsDeployKey, {
        VLY_INTEGRATION_KEY: integrationKey,
        VLY_INTEGRATION_BASE_URL: "https://integrations.vly.ai/",
      });

      console.log(
        "Environment variables set successfully, including integration key",
      );

      // Inject @vly-ai/integrations import into main.tsx for screenshots and future modules
      try {
        const mainTsxPath = "src/main.tsx";
        const mainTsxContent = await sandbox.readFile(mainTsxPath);
        const importLine = "import '@vly-ai/integrations';";

        if (!mainTsxContent.includes(importLine)) {
          const updatedContent = importLine + "\n" + mainTsxContent;
          await sandbox.writeFile(mainTsxPath, updatedContent);
          console.log("Injected @vly-ai/integrations import into main.tsx");
        }
      } catch (error) {
        console.warn("Could not inject import into main.tsx:", error);
      }

      // Restart the dev server to apply all env vars
      if (!hasDevServer(sandbox)) {
        throw new Error("Codebase does not support dev server management");
      }
      console.log("Restarting dev server to apply environment variables...");
      await sandbox.restartDevServer();
      console.log(
        "Dev server restarted successfully with new environment variables",
      );

      if (previewUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.codesandbox.createProject.assignProxy,
          {
            slug: semanticIdentifier,
            target: previewUrl,
            projectId: project._id,
          },
        );
      }
      console.log("Background project creation completed");
    } catch (error) {
      console.error("Background project creation failed:", error);
      throw error;
    }
  },
});

/**
 * Generates a project name from the initial document content using AI,
 * sets it as the project name in the database, and schedules initialization
 * of a new unassigned project to maintain the project pool.
 */
export const generateProjectNameAndSetAsEnvVarAndInitializeNew = internalAction(
  {
    args: {
      initialDocumentContent: v.string(),
      semanticIdentifier: v.string(),
      snapshotId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const result = await generateText({
        model: MODELS.PROJECT_NAME_GENERATOR_MODEL,
        prompt: `The user is creating a new project and needs a brief and concise name for it that captures the project's purpose. The name should be no more than 3 words.
    Here is the user's initial description:
    "${args.initialDocumentContent}"
    Immediately output only the name, and no other text. Your answer should be 1-3 words maximum.`,
        maxOutputTokens: 10,
      });

      // set the project name as a backend env var

      const project = await ctx.runQuery(
        internal.project.getProjectFromIdentifier,
        {
          semanticIdentifier: args.semanticIdentifier,
        },
      );

      if (!project) {
        return;
      }
      // @ts-ignore
      await ctx.runMutation(api.project.setProjectName, {
        projectId: project._id,
        name: result.text.trim(),
      });

      // this is so there will be a fresh project in the pool
      await ctx.scheduler.runAfter(
        5 * 1000,
        internal.codesandbox.createProject.initializeUnassignedProject,
        {
          snapshotId: args.snapshotId,
        },
      );
    },
  },
);

// test comment to force a a convex rebuild
