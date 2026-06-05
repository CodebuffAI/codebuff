import { createHash } from "crypto";
import { Daytona, Sandbox } from "@daytonaio/sdk";
import path from "path";
import {
  Codebase,
  Commit,
  DevServerCodebase,
  EnvironmentVariableCodebase,
  EnvVars,
  VercelDeployableCodebase,
  VercelDeploymentFile,
  PackageManagerCodebase,
  SandboxStats,
  SandboxStatsCodebase,
  VersionControlledCodebase,
} from "./Codebase";
import { BackupInfo, ExtendedGitOperations } from "./ExtendedGitOperations";
import { IntegrityManager } from "../hooks/IntegrityManager";
import type { IntegrityCheckRegistry } from "../hooks/types";
import { DaytonaSdkManager } from "./DaytonaSdkManager";
import {
  PackageManager,
  PackageManagerType,
  getPackageManager,
} from "../packageManager";

const SANDBOX_IP_ERROR_PATTERNS = [
  "no ip address found",
  "is the sandbox started",
];

const ANSI_ESCAPE_REGEX =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g;

function isSandboxIpResolutionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalizedMessage = message.toLowerCase();
  return SANDBOX_IP_ERROR_PATTERNS.some((pattern) =>
    normalizedMessage.includes(pattern),
  );
}

function hasSandboxTarget(sandbox: Sandbox): boolean {
  return Boolean((sandbox as { target?: unknown }).target);
}

function hasConvexAuthError(output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("401 unauthorized") ||
    normalized.includes("authenticationfailed") ||
    normalized.includes("authenticate with")
  );
}

export class DaytonaCodebase
  implements
    Codebase,
    VersionControlledCodebase,
    ExtendedGitOperations,
    EnvironmentVariableCodebase,
    VercelDeployableCodebase,
    DevServerCodebase,
    PackageManagerCodebase,
    SandboxStatsCodebase
{
  __versionControlled = true as const;

  private sdk: Daytona;
  private sandboxId: string;
  private sandbox: Sandbox | null = null;
  allFilePaths: string[] = [];
  private filePathsCacheTime: number = 0;
  private readonly FILE_PATHS_CACHE_TTL = 60000; // 60 seconds cache TTL
  private readonly projectDir = "codebase"; // Project directory (relative path for file operations)
  private readonly projectPath = "/home/daytona/codebase"; // Absolute path for git operations

  // Stats scripts version tracking - only set after successful installation
  private statsScriptsVersion: string | undefined;

  // Integrity manager for ensuring workspace is in expected state
  private integrityManager: IntegrityManager;

  // Package manager used by this codebase
  private packageManager: PackageManager;

  // Base check registry (without stats monitoring, which is feature-flagged)
  private getCheckRegistry(
    enableStatsMonitoring: boolean,
  ): IntegrityCheckRegistry {
    const sandboxConfigurationVersion = "autostop:10|autoarchive:4320";
    const registry: IntegrityCheckRegistry = {
      ensureSandboxConfiguration: {
        frequency: "when",
        trackValue: () => sandboxConfigurationVersion,
        execute: async () => await this.ensureSandboxConfiguration(),
      },
      ensureStatsScripts: {
        frequency: "when",
        trackValue: () => this.statsScriptsVersion,
        execute: async () => await this.ensureStatsScripts(),
        // No dependencies - uses tar which is always available
      },
      ensureVlyIntegrationsPackage: {
        frequency: "always",
        execute: async () => await this.ensureVlyIntegrationsPackage(),
      },
      ensureVlyPluginInViteConfig: {
        frequency: "always",
        execute: async () => await this.ensureVlyPluginInViteConfig(),
        dependencies: ["ensureVlyIntegrationsPackage"],
      },
      // ensureIntegrations is handled separately in verifyProjectAccessAndConnect
      // when the vly_integrations_enabled feature flag is enabled
    };

    // Conditionally add stats monitoring check based on feature flag
    if (enableStatsMonitoring) {
      registry.ensureStatsMonitoring = {
        frequency: "always",
        execute: async () => await this.ensureStatsMonitoring(),
        dependencies: ["ensureStatsScripts"], // Requires scripts to be extracted
      };
    }

    return registry;
  }

  constructor(
    sandboxId: string,
    sdk?: Daytona,
    packageManagerType: PackageManagerType = "bun",
  ) {
    this.sandboxId = sandboxId;
    // Use provided SDK instance or get the singleton
    this.sdk = sdk ?? DaytonaSdkManager.getDaytonaSDK();
    // Initialize package manager (defaults to bun for new projects)
    this.packageManager = getPackageManager(packageManagerType);
    // Initialize with stats monitoring disabled by default (feature flag will be checked later)
    this.integrityManager = new IntegrityManager(
      this.getCheckRegistry(false),
      (path) => this.readStateFile(path),
      (path, content) => this.writeStateFile(path, content),
      ".local/.vly-integrity-state.json", // Store alongside scripts in $HOME/.local
    );
  }

  public static async create(
    sandboxId: string,
    packageManagerType?: PackageManagerType,
  ) {
    const codebase = new DaytonaCodebase(
      sandboxId,
      undefined,
      packageManagerType,
    );
    await codebase.initialize();
    return codebase;
  }

  private _filterFilePath(filePath: string): boolean {
    // Exclude vly-toolbar-readonly.tsx (read-only file)
    if (
      filePath === "vly-toolbar-readonly.tsx" ||
      filePath.endsWith("/vly-toolbar-readonly.tsx")
    )
      return false;
    // Exclude paths containing '_generated'
    if (filePath.includes("_generated")) return false;
    // Exclude files beginning with a dot
    if (/\/(\.[^/]+)$|^(\.[^/]+)$/.test(filePath)) return false;
    // Exclude any folder name beginning with '_'
    const segments = filePath.split("/");
    if (segments.slice(0, -1).some((seg) => seg.startsWith("_"))) return false;
    // Exclude any folder name beginning with a dot
    if (segments.slice(0, -1).some((seg) => seg.startsWith("."))) return false;
    // Exclude paths containing 'tsconfig'
    if (filePath.includes("tsconfig")) return false;
    // Exclude assets.json
    if (filePath.includes("assets.json")) return false;
    // Only allow files in /src or /public, or README.md, package.json, .md/.txt files
    const allowedExceptions = [
      "README.md",
      "package.json",
      "index.html",
      "components.json",
    ];
    const isMarkdownOrTxt = /\.(md|txt)$/i.test(filePath);
    if (
      filePath.startsWith("src/") ||
      filePath.startsWith("public/") ||
      allowedExceptions.includes(filePath) ||
      isMarkdownOrTxt
    ) {
      return true;
    }
    return false;
  }

  // Private retry helper method
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Verify sandbox state before attempting operation
        if (this.sandbox) {
          const currentState = this.sandbox.state;
          if (currentState !== "started") {
            console.log(
              `[DaytonaCodebase.withRetry] Sandbox state is ${currentState}, refreshing...`,
            );
            await this.sandbox.refreshData();

            // If still not started after refresh, re-initialize
            if (this.sandbox.state !== "started") {
              console.log(
                `[DaytonaCodebase.withRetry] Sandbox state is ${this.sandbox.state}, re-initializing`,
              );
              await this.initialize();
            }
          }

          // Daytona toolbox calls require a resolved sandbox target/IP.
          // Refresh and re-open the sandbox if target metadata is missing.
          if (
            this.sandbox.state === "started" &&
            !hasSandboxTarget(this.sandbox)
          ) {
            console.log(
              "[DaytonaCodebase.withRetry] Sandbox target is missing, re-opening sandbox",
            );
            this.sandbox = await openDaytonaSandboxWithRetry(this.sandboxId);
          }
        }

        return await operation();
      } catch (error: any) {
        const errorMessage =
          error instanceof Error ? error.message : String(error ?? "");
        const isSandboxInactiveError =
          errorMessage.includes("SANDBOX NOT ACTIVE");
        const isIpResolutionError = isSandboxIpResolutionError(error);

        if ((isSandboxInactiveError || isIpResolutionError) && attempt < 3) {
          console.log(
            `[DaytonaCodebase.withRetry] Sandbox unavailable (${isIpResolutionError ? "missing target/IP" : "inactive"}), re-initializing (attempt ${attempt}/3)`,
          );
          await this.initialize();
          continue;
        }
        throw error;
      }
    }
    throw new Error("Retry logic failed unexpectedly");
  }

  /**
   * Ensure sandbox configuration is properly set for all active codebases
   * This configures auto-stop and auto-archive intervals to optimize resource usage
   */
  private async ensureSandboxConfiguration(): Promise<void> {
    try {
      if (!this.sandbox) {
        return;
      }

      // Configure autostop interval (10 minutes)
      // Sandboxes will automatically stop after 10 minutes of inactivity
      const desiredAutostopInterval = 10;
      if (this.sandbox.autoStopInterval !== desiredAutostopInterval) {
        await this.sandbox.setAutostopInterval(desiredAutostopInterval);
      }

      // Configure auto-archive interval (3 days)
      // This prevents sandboxes from being archived too quickly
      const desiredAutoArchiveInterval = 3 * 24 * 60; // 3 days in minutes
      if (this.sandbox.autoArchiveInterval !== desiredAutoArchiveInterval) {
        await this.sandbox.setAutoArchiveInterval(desiredAutoArchiveInterval);
      }
    } catch {

    }
  }

  /**
   * Ensure stats daemon scripts are installed in the workspace
   * Downloads and installs scripts from S3 if they're not already present
   */
  private async ensureStatsScripts(): Promise<void> {
    try {
      if (!this.sandbox) {
        return;
      }

      const currentSnapshot = process.env.DAYTONA_SNAPSHOT_ID || "no-snapshot";

      // Load version from IntegrityManager state if this instance doesn't have it yet
      // This prevents redundant reinstallation across different DaytonaCodebase instances
      if (!this.statsScriptsVersion) {
        try {
          const state = await this.integrityManager.getState();
          const lastValue = state["ensureStatsScripts"]?.lastValue;
          if (lastValue && state["ensureStatsScripts"]?.success) {
            this.statsScriptsVersion = lastValue;
          }
        } catch {
          // State file doesn't exist yet, that's fine - first installation
        }
      }

      // Check multiple possible locations for the scripts
      const checkResult = await this.runCommand(
        "[ -f /usr/local/bin/vly-stats-daemon.sh ] && echo 'EXISTS' || " +
          "[ -f $HOME/.local/bin/vly-stats-daemon.sh ] && echo 'EXISTS' || " +
          "echo 'MISSING'",
        5000,
      );

      const scriptsExist = checkResult.output?.trim() === "EXISTS";

      // Fast path: Scripts exist AND same snapshot - skip ETag check
      if (
        scriptsExist &&
        this.statsScriptsVersion?.endsWith(`-${currentSnapshot}`)
      ) {
        return;
      }

      // Default S3 URL - can be overridden via environment variable
      const scriptsUrl =
        process.env.VLY_STATS_SCRIPTS_URL ||
        "https://vly-sandbox-scripts.s3.us-west-1.amazonaws.com/vlyscripts.tar.gz";

      // Fetch S3 ETag to use as version identifier
      let s3Version: string | undefined;
      try {
        const headResponse = await fetch(scriptsUrl, { method: "HEAD" });
        const etag = headResponse.headers.get("etag");
        s3Version = etag?.replace(/"/g, "") || "unknown";
      } catch {
        console.warn(
          "[DaytonaCodebase] Could not fetch S3 version, using fallback",
        );
        s3Version = "fallback";
      }

      const versionKey = `${s3Version}-${currentSnapshot}`;

      // If scripts exist and version matches (snapshot changed but same S3 version)
      // just update our tracking
      if (scriptsExist && this.statsScriptsVersion === versionKey) {
        this.statsScriptsVersion = versionKey;
        return;
      }

      // Install to user-writable directory ($HOME/.local/bin)
      // Using tar (always available) instead of unzip (requires installation)
      const installCommands = [
        "cd /tmp",
        `curl -fsSL "${scriptsUrl}" -o vlyscripts.tar.gz`,
        "tar -xzf vlyscripts.tar.gz",
        "mkdir -p $HOME/.local/bin",
        "cp *.sh $HOME/.local/bin/",
        "chmod +x $HOME/.local/bin/vly-stats-*.sh",
        "rm -f vlyscripts.tar.gz *.sh",
        "cd -",
      ].join(" && ");

      const installResult = await this.runCommand(installCommands, 30000); // 30 second timeout

      if (installResult.exitCode === 0) {
        // ONLY set version after successful installation to prove we fetched them
        this.statsScriptsVersion = versionKey;
      } else {
        // Don't set version on failure
      }
    } catch (error) {
      // Non-critical failure - log but don't block initialization
      // Don't throw - if scripts are in the snapshot, workspace will still work
    }
  }

  /**
   * Ensure stats monitoring daemon is running in the workspace
   * This allows collecting resource usage metrics (CPU, memory, disk, etc.)
   */
  private async ensureStatsMonitoring(): Promise<void> {
    try {
      if (!this.sandbox) {
        return;
      }

      // Check if daemon processes are already running by looking for PIDs
      const pidCheckResult = await this.runCommand(
        "pgrep -f 'vly-stats-stream.sh|vly-stats-sync.sh' > /dev/null 2>&1 && echo 'RUNNING' || echo 'STOPPED'",
        5000,
      );

      const isRunning = pidCheckResult.output?.trim() === "RUNNING";

      if (isRunning) {
        return;
      }

      // First try to find the script location
      const findScriptResult = await this.runCommand(
        "[ -f /usr/local/bin/vly-stats-daemon.sh ] && echo '/usr/local/bin/vly-stats-daemon.sh' || " +
          "[ -f $HOME/.local/bin/vly-stats-daemon.sh ] && echo '$HOME/.local/bin/vly-stats-daemon.sh' || " +
          "which vly-stats-daemon.sh 2>/dev/null || echo 'NOT_FOUND'",
        5000,
      );

      const scriptPath = findScriptResult.output?.trim();

      if (!scriptPath || scriptPath === "NOT_FOUND") {
        console.warn(
          "[DaytonaCodebase] Could not locate vly-stats-daemon.sh script",
        );
        return;
      }

      // Set up environment variables for the daemon
      const sandboxUsageEndpoint =
        process.env.VLY_SANDBOX_USAGE_ENDPOINT ||
        "https://sandbox-usage.vly.ai/webhook";
      const sandboxUsageApiKey = process.env.VLY_SANDBOX_USAGE_API_KEY || "";

      // Start daemon with environment variables
      const startCommand = sandboxUsageApiKey
        ? `VLY_API_ENDPOINT="${sandboxUsageEndpoint}" VLY_API_KEY="${sandboxUsageApiKey}" ${scriptPath} start`
        : `VLY_API_ENDPOINT="${sandboxUsageEndpoint}" ${scriptPath} start`;

      const startResult = await this.runCommand(startCommand, 10000);

      const startedOk =
        startResult.exitCode === 0 ||
        startResult.output?.includes("already running");
      if (!startedOk) {
        console.warn(
          "[DaytonaCodebase] Failed to start stats monitoring daemon:",
          startResult.output,
        );
      }
    } catch (error) {
      // Non-critical failure - log but don't block initialization
      console.warn(
        "[DaytonaCodebase] Could not ensure stats monitoring daemon (non-critical):",
        error,
      );
      // Don't throw - stats monitoring is optional, workspace should still work
    }
  }

  /**
   * Ensure @vly-ai/integrations package is installed and up-to-date
   * Checks npm registry for latest version and updates if needed
   */
  private async ensureVlyIntegrationsPackage(): Promise<void> {
    try {
      if (!this.sandbox) {
        return;
      }

      const packageJsonContents = await this.readFile("package.json").catch(
        () => "",
      );
      const pm = this.getPackageManager();

      if (
        packageJsonContents &&
        packageJsonContents.includes('"@vly-ai/integrations"')
      ) {
        // check if it's the latest version
        let installedVersion: string | undefined;
        try {
          const parsed = JSON.parse(packageJsonContents);
          installedVersion =
            parsed.dependencies?.["@vly-ai/integrations"] ||
            parsed.devDependencies?.["@vly-ai/integrations"];
        } catch {
          // If package.json can't be parsed, fall through to install
        }

        if (installedVersion) {
          let latestVersion: string | undefined;
          try {
            const registryResponse = await fetch(
              "https://registry.npmjs.org/@vly-ai/integrations/latest",
            );
            if (registryResponse.ok) {
              const registryData = (await registryResponse.json()) as {
                version?: string;
              };
              latestVersion = registryData.version;
            }
          } catch {
            console.warn(
              "[DaytonaCodebase] Could not fetch latest version from npm registry",
            );
            return;
          }

          if (latestVersion && installedVersion === latestVersion) {
            return;
          }
        }

        const updateResult = await this.runCommand(
          pm.add("@vly-ai/integrations@latest"),
          60000,
        );

        if (updateResult.exitCode !== 0) {
          console.warn(
            "[DaytonaCodebase] Failed to update @vly-ai/integrations:",
            updateResult.output,
          );
        }
        return;
      }

      // Package not present — install it
      const installResult = await this.runCommand(
        pm.add("@vly-ai/integrations"),
        60000,
      );

      if (installResult.exitCode !== 0) {
        console.warn(
          "[DaytonaCodebase] Failed to install @vly-ai/integrations:",
          installResult.output,
        );
      }
    } catch (error) {
      console.error(
        "[DaytonaCodebase] @vly-ai/integrations setup failed:",
        error,
      );
    }
  }

  /**
   * Ensure vlyPlugin is configured in vite.config.ts
   */
  private async ensureVlyPluginInViteConfig(): Promise<void> {
    try {
      if (!this.sandbox) {
        return;
      }

      // 1. Read vite.config.ts
      let viteConfig: string;
      try {
        viteConfig = await this.readFile("vite.config.ts");
      } catch (error) {
        console.warn(
          "[DaytonaCodebase] Could not read vite.config.ts, skipping vlyPlugin setup",
        );
        return;
      }

      // 2. Check if vlyPlugin already exists
      if (viteConfig.includes("vlyPlugin")) {
        return;
      }

      // 3. Add import at the top of the file
      const importLine = 'import { vlyPlugin } from "@vly-ai/integrations";';
      let updatedConfig = importLine + "\n" + viteConfig;

      // 4. Add vlyPlugin() to plugins array (as first plugin)
      updatedConfig = updatedConfig.replace(
        /plugins:\s*\[/,
        "plugins: [vlyPlugin(), ",
      );

      // 5. Write updated config
      await this.writeFile("vite.config.ts", updatedConfig);
    } catch (error) {
      console.warn(
        "[DaytonaCodebase] Could not ensure vlyPlugin in vite.config (non-critical):",
        error,
      );
    }
  }

  /**
   * Ensure VLY integration files and environment variables exist in the codebase
   * Creates vly-integrations.ts, integrations.md, and sets env vars if they're missing
   * @param integrationKey Optional integration key to set as VLY_INTEGRATION_KEY
   */
  async ensureIntegrations(integrationKey: string | null): Promise<void> {
    try {
      if (!this.sandbox) {
        return;
      }

      // Step 1: Check if integration files exist
      let filesExist = true;
      try {
        await this.readFile("src/lib/vly-integrations.ts");
      } catch (error: any) {
        if (error?.message?.includes("File not found")) {
          filesExist = false;
        } else {
          throw error; // Re-throw non-file-not-found errors
        }
      }

      // Create vly-integrations.ts (imports from @vly-ai/integrations package)
      const vlyIntegrationsContent = `// VLY Integrations Configuration
// See /integrations.md for usage documentation

import { createVlyIntegrations } from '@vly-ai/integrations';

export const vly = createVlyIntegrations({
  deploymentToken: process.env.VLY_INTEGRATION_KEY!,
  debug: process.env.NODE_ENV === 'development'
});
`;

      // Step 2: Create integration files if missing
      if (!filesExist) {
        await this.writeFile(
          "src/lib/vly-integrations.ts",
          vlyIntegrationsContent,
        );

        // Create integrations.md
        const integrationsMdContent = `# VLY Integrations

First-order integrations for AI, email, and payments with automatic usage billing through VLY integration keys.

## Environment Variables

The following environment variables are automatically set during project creation:

- \`VLY_INTEGRATION_KEY\`: Your unique integration key (format: \`sk_*\`)
- \`VLY_INTEGRATION_BASE_URL\`: The base URL for the integration gateway (default: \`https://integrations.vly.ai/\`)

## Installation

The \`@vly-ai/integrations\` package is already included in package.json.

**Alternative AI Providers:** While you can use OpenAI, OpenRouter, or other AI providers directly with your own API keys, @vly-ai/integrations is simpler as it works out-of-the-box without requiring you to supply and manage API keys.

## Usage in Convex Actions

\`\`\`typescript
"use node";

import { vly } from '../lib/vly-integrations';
import { action } from "./_generated/server";

export const generateAIResponse = action({
  handler: async (ctx, args) => {
    // AI Completions
    const completion = await vly.ai.completion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ],
      temperature: 0.7,
      maxTokens: 150
    });

    return completion;
  }
});
\`\`\`

## Available Features

### AI Integration
\`\`\`typescript
// Create completion
const completion = await vly.ai.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [...],
  temperature: 0.7,
  maxTokens: 150
});

// Stream completion
await vly.ai.streamCompletion(
  request,
  (chunk: string) => console.log(chunk)
);

// Generate embeddings
const embeddings = await vly.ai.embeddings("Your text here");
\`\`\`

### Email Integration
\`\`\`typescript
// Send email
const emailResult = await vly.email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
});

// Send batch emails
const batchResult = await vly.email.sendBatch([...emails]);
\`\`\`

### Payments Integration
\`\`\`typescript
// Create payment intent
const paymentIntent = await vly.payments.createPaymentIntent({
  amount: 2000, // $20.00 in cents
  currency: 'usd',
  description: 'Premium subscription',
  customer: {
    email: 'customer@example.com'
  }
});

// Create subscription
const subscription = await vly.payments.createSubscription({...});

// Create checkout session
const session = await vly.payments.createCheckoutSession({...});
\`\`\`

## Error Handling

All methods return an ApiResponse object:

\`\`\`typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
\`\`\`

Example error handling:

\`\`\`typescript
const result = await vly.ai.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
\`\`\`

## Important Notes

1. The integration key (\`VLY_INTEGRATION_KEY\`) is automatically injected during project creation
2. All API calls are automatically billed to your deployment based on usage
3. Must be used in Convex actions with \`"use node"\` directive
4. The integration key should never be exposed to the client
5. **Alternative AI providers:** While you can use OpenAI, OpenRouter, or other AI providers directly with your own API keys, @vly-ai/integrations is simpler as it works out-of-the-box without requiring you to supply and manage API keys

## Checking Integration Status

To verify the integration is properly configured:

\`\`\`typescript
const hasIntegration = !!process.env.VLY_INTEGRATION_KEY;
if (!hasIntegration) {
  console.error("VLY integration key not found");
}
\`\`\`
`;

        await this.writeFile("integrations.md", integrationsMdContent);
      }

      // Note: @vly-ai/integrations is now loaded via vlyPlugin() in vite.config.ts
      // The ensureVlyPluginInViteConfig() function handles this migration

      // Step 3: Check and set backend environment variables if integrationKey provided
      if (integrationKey) {
        // Check if VLY_INTEGRATION_KEY exists
        const envListResult = await this.runCommand(
          this.packageManager.run("convex env list"),
        );

        if (envListResult.exitCode !== 0) {
          if (hasConvexAuthError(envListResult.output)) {
            console.warn(
              "[DaytonaCodebase] Convex auth unavailable in sandbox, skipping backend integration env vars",
            );
            return;
          }

          throw new Error(
            `[DaytonaCodebase] Failed to list Convex env vars: ${envListResult.output}`,
          );
        }

        const envListOutput = envListResult.output.toLowerCase();
        const hasIntegrationKey = envListOutput.includes("vly_integration_key");
        const hasIntegrationBaseUrl = envListOutput.includes(
          "vly_integration_base_url",
        );

        const envVarsToSet: Record<string, string> = {};

        if (!hasIntegrationKey) {
          envVarsToSet.VLY_INTEGRATION_KEY = integrationKey;
        }

        if (!hasIntegrationBaseUrl) {
          envVarsToSet.VLY_INTEGRATION_BASE_URL =
            "https://integrations.vly.ai/";
        }

        if (Object.keys(envVarsToSet).length > 0) {
          await this.setEnvVars({
            frontend: {},
            backend: envVarsToSet,
          });
        }
      }
    } catch (error) {
      // Don't throw - template should have files anyway, and env vars can be set later
      console.warn(
        "[DaytonaCodebase] Failed to ensure integrations (non-critical):",
        error,
      );
    }
  }

  // Codebase interface methods
  async initialize(): Promise<void> {
    this.sandbox = await openDaytonaSandboxWithRetry(this.sandboxId);
    if (!this.sandbox) {
      throw new Error("Failed to initialize sandbox");
    }

    // Verify sandbox is in a usable state
    if (this.sandbox.state !== "started") {
      throw new Error(
        `Sandbox is not started. Current state: ${this.sandbox.state}`,
      );
    }
    if (!hasSandboxTarget(this.sandbox)) {
      throw new Error("Sandbox is started but target/IP metadata is missing");
    }

    // Workspace integrity checks are now run explicitly via ensureWorkspaceIntegrity()
    // This prevents race conditions when multiple actions initialize the codebase in parallel

    // VLY integration files are ensured separately in verifyProjectAccessAndConnect
    // when the vly_integrations_enabled feature flag is enabled

    // get all file paths by running a command that respects gitignore
    await this.getAllFilePaths();

    // Note: Dev server is NOT started here. It should be started explicitly
    // by the caller after package manager detection is complete.
  }

  /**
   * Ensure workspace integrity (configuration, stats scripts, monitoring)
   * Should be called once per user session, typically in verifyProjectAccessAndConnect
   * Checks execute conditionally based on their frequency and state
   * @param enableStatsMonitoring - Whether to enable stats monitoring daemon (controlled by feature flag)
   */
  async ensureWorkspaceIntegrity(
    enableStatsMonitoring: boolean = false,
  ): Promise<void> {
    // Reconfigure the integrity manager with the appropriate check registry
    // This allows dynamic enabling/disabling of stats monitoring based on feature flag
    this.integrityManager = new IntegrityManager(
      this.getCheckRegistry(enableStatsMonitoring),
      (path) => this.readStateFile(path),
      (path, content) => this.writeStateFile(path, content),
      ".local/.vly-integrity-state.json",
    );

    await this.integrityManager.ensureAll();
  }

  async downloadCodebase(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async runCommand(
    command: string,
    timeout?: number,
    onStreamChunk?: (chunk: string) => void,
  ): Promise<{ output: string; exitCode?: number | undefined }> {
    void onStreamChunk; // Currently unused but kept for API compatibility
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        const deployKeyResult = await this.sandbox.process.executeCommand(
          'cat $HOME/.vly-convex/dev.key 2>/dev/null || echo ""',
        );

        const deployKey = deployKeyResult.result;
        const prefixedCommand = command;

        const output = await this.sandbox.process.executeCommand(
          prefixedCommand,
          this.projectPath, // Use absolute path for Daytona
          {
            CONVEX_DEPLOY_KEY: deployKey,
            GIT_TERMINAL_PROMPT: "0", // Disable git interactive prompts
            PATH: `/home/daytona/.local/bin:${process.env.PATH || "/usr/local/bin:/usr/bin:/bin"}`,
          },
          timeout,
        );
        return { output: output.result, exitCode: output.exitCode };
      } catch (e) {
        throw new Error("ERROR RUNNING COMMAND: " + e);
      }
    });
  }

  async runCommandThrow(
    command: string,
    timeout?: number,
    _onStreamChunk?: (chunk: string) => void,
  ): Promise<{ output: string; exitCode?: number | undefined }> {
    const result = await this.runCommand(command, timeout, _onStreamChunk);
    if (result.exitCode !== 0) {
      throw new Error(result.output);
    }
    return result;
  }

  async readFile(filePath: string): Promise<string> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        const output = await this.sandbox.fs.downloadFile(
          path.join(this.projectDir, filePath),
        );
        return output.toString();
      } catch (e: any) {
        // Check if it's a file not found error
        const errorMsg = e?.message?.toLowerCase() || "";
        if (
          errorMsg.includes("404") ||
          errorMsg.includes("no such file") ||
          errorMsg.includes("file not found") ||
          errorMsg.includes("not found")
        ) {
          throw new Error(`File not found: ${filePath}`);
        }
        throw new Error("ERROR READING FILE: " + e);
      }
    });
  }

  async readFileBytes(filePath: string): Promise<Uint8Array> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        const output = await this.sandbox.fs.downloadFile(
          path.join(this.projectDir, filePath),
        );
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        const binaryExtensions = [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "webp",
          "bmp",
          "ico",
          "pdf",
        ];

        if (binaryExtensions.includes(ext)) {
          return output;
        } else {
          return Buffer.from(output.toString("utf8"));
        }
      } catch (e: any) {
        // Check if it's a file not found error
        const errorMsg = e?.message?.toLowerCase() || "";
        if (
          errorMsg.includes("404") ||
          errorMsg.includes("no such file") ||
          errorMsg.includes("file not found") ||
          errorMsg.includes("not found")
        ) {
          throw new Error(`File not found: ${filePath}`);
        }
        throw new Error("ERROR READING FILE BYTES: " + e);
      }
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        await this.sandbox.fs.uploadFile(
          Buffer.from(content),
          path.join(this.projectDir, filePath),
          10,
        );
      } catch (e) {
        throw new Error("ERROR WRITING FILE: " + e);
      }
    });
  }

  async writeBinaryFile(filePath: string, content: Uint8Array): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        await this.sandbox.fs.uploadFile(
          Buffer.from(content),
          path.join(this.projectDir, filePath),
          10,
        );
      } catch (e) {
        throw new Error("ERROR WRITING BINARY FILE: " + e);
      }
    });
  }

  /**
   * Read state file from absolute path (outside project directory)
   * Used by IntegrityManager to store state alongside scripts in $HOME/.local
   */
  private async readStateFile(filePath: string): Promise<string> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        // Use absolute path from home directory
        const absolutePath = path.join("/home/daytona", filePath);
        const output = await this.sandbox.fs.downloadFile(absolutePath);
        return output.toString();
      } catch (e: any) {
        // Check if it's a file not found error
        const errorMsg = e?.message?.toLowerCase() || "";
        if (
          errorMsg.includes("404") ||
          errorMsg.includes("no such file") ||
          errorMsg.includes("file not found") ||
          errorMsg.includes("not found")
        ) {
          throw new Error(`File not found: ${filePath}`);
        }
        throw new Error("ERROR READING STATE FILE: " + e);
      }
    });
  }

  /**
   * Write state file to absolute path (outside project directory)
   * Used by IntegrityManager to store state alongside scripts in $HOME/.local
   */
  private async writeStateFile(
    filePath: string,
    content: string,
  ): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        // Use absolute path from home directory
        const absolutePath = path.join("/home/daytona", filePath);
        await this.sandbox.fs.uploadFile(
          Buffer.from(content),
          absolutePath,
          10,
        );
      } catch (e) {
        throw new Error("ERROR WRITING STATE FILE: " + e);
      }
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        await this.sandbox.fs.deleteFile(path.join(this.projectDir, filePath));
      } catch (e) {
        throw new Error("ERROR RUNNING COMMAND: " + e);
      }
    });
  }

  /**
   * Delete a file or directory at a path relative to the sandbox root (/home/daytona/).
   * Uses the Daytona file system API (DELETE /files) instead of shell rm, which may
   * avoid permission issues. For directories, pass recursive: true.
   */
  async deleteFileAtPath(
    sandboxRelativePath: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        await this.sandbox.fs.deleteFile(
          sandboxRelativePath,
          options?.recursive ?? false,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to delete: ${msg}`);
      }
    });
  }

  async createDirectory(dirPath: string): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        await this.sandbox.fs.createFolder(
          path.join(this.projectDir, dirPath),
          "755",
        );
      } catch (e) {
        throw new Error("ERROR CREATING DIRECTORY: " + e);
      }
    });
  }

  async checkIfFileExists(filePath: string): Promise<boolean> {
    // Use cached file paths from git ls-files (more reliable than sandbox.fs.listFiles)
    return await this.checkIfFileExistsInCodebase(filePath);
  }

  // with loop through allFilePaths
  async checkIfFileExistsInCodebase(filePath: string): Promise<boolean> {
    for (const file of this.allFilePaths) {
      if (file === filePath) {
        return true;
      }
    }
    return false;
  }

  async getAllFilePaths(forceRefresh: boolean = false) {
    // Return cached paths unless force refresh is requested or cache is expired
    const now = Date.now();
    const isCacheValid =
      this.allFilePaths.length > 0 &&
      now - this.filePathsCacheTime < this.FILE_PATHS_CACHE_TTL;

    if (!forceRefresh && isCacheValid) {
      return this.allFilePaths;
    }

    try {
      // Command will be executed in the project directory via runCommand
      const result = await this.runCommandThrow(
        "git ls-files --cached --others --exclude-standard",
      );
      this.allFilePaths = result.output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((path) => path.replace(/\r$/, "")) // Remove trailing \r if present
        .filter(this._filterFilePath);
    } catch (error) {
      console.error(
        "Failed to get file paths with git, trying fallback:",
        error,
      );

      try {
        // Fallback command will be executed in the project directory via runCommand
        const result = await this.runCommandThrow(
          'find . -type f -not -path "*/\\.*" -not -path "*/node_modules/*" ' +
            '-not -path "*/dist/*" -not -path "*/.dist/*" -not -path "*/build/*" ' +
            '-not -path "*/coverage/*" -not -path "*/.next/*" -not -path "*/.nuxt/*" ' +
            '-not -path "*/.output/*" -not -path "*/tmp/*"',
        );
        // Remove the leading './' from each path and filter out empty strings
        this.allFilePaths = result.output
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((path: string) => {
            // Remove trailing \r if present
            path = path.replace(/\r$/, "");
            // Remove leading ./ if present
            return path.startsWith("./") ? path.substring(2) : path;
          })
          .filter(this._filterFilePath);
      } catch (fallbackError) {
        console.error("Fallback file listing also failed:", fallbackError);
        this.allFilePaths = [];
      }
    }

    // Update cache timestamp
    this.filePathsCacheTime = Date.now();

    return this.allFilePaths;
  }

  async refreshFilePaths(): Promise<string[]> {
    return this.getAllFilePaths(true);
  }

  // VersionControlledCodebase interface methods
  async commit(message: string, allowEmpty: boolean = false): Promise<Commit> {
    if (this.sandbox) {
      try {
        const repoPath = this.projectPath;

        await this.sandbox.git.add(repoPath, ["."]);
        await this.sandbox.git.commit(
          repoPath,
          message,
          "Freebuff Agent",
          "agent@mail.freebuff.app",
          allowEmpty,
        );
        const commits = await this.getCommits();
        return commits[0];
      } catch (e) {
        console.error("[DaytonaCodebase] commit failed:", e);
        throw e;
      }
    } else {
      await this.initialize();
      return this.commit(message, allowEmpty);
    }
  }

  async getCommits(maxCount: number = 100): Promise<Commit[]> {
    try {
      // the -m is for monochrome output
      // Limit to maxCount commits for performance (default 100)
      const result = await this.runCommand(
        `git log --max-count=${maxCount} | jc --git-log -m`,
      );

      if (result.output.includes("fatal: your current branch")) {
        // no commits yet
        return [];
      }

      const parsedCommits: {
        commit: string;
        author: string;
        author_email: string;
        epoch: number;
        message: string;
      }[] = JSON.parse(result.output.replace(/[\x00-\x1F\x7F]/g, ""));

      return parsedCommits.map((commit) => ({
        hash: commit.commit,
        message: commit.message,
        author: commit.author,
        timestamp: commit.epoch,
      }));
    } catch (err) {
      console.error("Failed to get commits");
      throw err;
    }
  }
  // We use reverting now mostly, commented out to avoid confusion
  // async resetToCommit(hash: string) {
  //   await this.runCommandThrow(`git reset --hard ${hash}`);
  // }

  /**
   * Helper to sanitize command output by removing ANSI codes and extracting JSON
   */
  private sanitizeJsonOutput(output: string): string {
    // Remove ANSI escape codes
    let sanitized = output.replace(ANSI_ESCAPE_REGEX, "");

    // Remove other common control characters but preserve newlines for multi-line JSON
    sanitized = sanitized.replace(CONTROL_CHAR_REGEX, "");

    // Trim whitespace
    sanitized = sanitized.trim();

    // Try to extract JSON if there's extra text around it.
    // Prefer object payloads first because bun/bunx logs often contain bracketed
    // timing snippets (e.g. "[0.1ms]") that are valid arrays but not our data.
    const objectMatch = sanitized.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0].trim();
    }

    const arrayMatch = sanitized.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0].trim();
    }

    return sanitized;
  }

  private cleanCommandOutput(output: string): string {
    return output.replace(ANSI_ESCAPE_REGEX, "").replaceAll("⠙", "").trim();
  }

  private looksLikeJsonPayload(output: string): boolean {
    const trimmed = output.trim();
    return trimmed.startsWith("{") || trimmed.startsWith("[");
  }

  private normalizeEnvObject(value: unknown): Record<string, string> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => typeof entryValue === "string",
    ) as [string, string][];

    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }

  private normalizeEnvItemsArray(items: unknown): Record<string, string> | null {
    if (!Array.isArray(items)) {
      return null;
    }

    const envVars: Record<string, string> = {};
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const record = item as Record<string, unknown>;
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof record.key === "string"
            ? record.key
            : typeof record.variable === "string"
              ? record.variable
            : null;
      const value = this.extractEnvValue(
        record.value ??
          record.val ??
          record.resolvedValue ??
          record.plaintextValue,
      );

      if (name && value !== null) {
        envVars[name] = value;
      }
    }

    return Object.keys(envVars).length > 0 ? envVars : null;
  }

  private extractEnvValue(value: unknown, depth: number = 0): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (depth >= 4 || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;

    // Handle nested wrappers like { value: { value: "..." } }
    if ("value" in record) {
      return this.extractEnvValue(record.value, depth + 1);
    }

    if ("plaintext" in record) {
      return this.extractEnvValue(record.plaintext, depth + 1);
    }

    if ("plainText" in record) {
      return this.extractEnvValue(record.plainText, depth + 1);
    }

    if ("resolvedValue" in record) {
      return this.extractEnvValue(record.resolvedValue, depth + 1);
    }

    return null;
  }

  private normalizeEnvObjectArray(items: unknown): Record<string, string> | null {
    if (!Array.isArray(items)) {
      return null;
    }

    const envVars: Record<string, string> = {};
    for (const item of items) {
      const normalized = this.normalizeEnvObject(item);
      if (!normalized) {
        continue;
      }

      Object.assign(envVars, normalized);
    }

    return Object.keys(envVars).length > 0 ? envVars : null;
  }

  private describeEnvJsonShape(value: unknown): string {
    if (value === null) {
      return "null";
    }

    if (Array.isArray(value)) {
      const firstItem = value[0];
      if (!firstItem || typeof firstItem !== "object") {
        return `array(len=${value.length}, first=${typeof firstItem})`;
      }

      const firstKeys = Object.keys(firstItem as Record<string, unknown>).slice(
        0,
        6,
      );
      return `array(len=${value.length}, firstKeys=[${firstKeys.join(",") || "none"}])`;
    }

    if (typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>).slice(0, 10);
      return `object(keys=[${keys.join(",") || "none"}])`;
    }

    return typeof value;
  }

  private normalizeEnvJson(value: unknown): Record<string, string> | null {
    const directObject = this.normalizeEnvObject(value);
    if (directObject) {
      return directObject;
    }

    const objectArray = this.normalizeEnvObjectArray(value);
    if (objectArray) {
      return objectArray;
    }

    const directArray = this.normalizeEnvItemsArray(value);
    if (directArray) {
      return directArray;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const environmentVariables = (value as { environmentVariables?: unknown })
        .environmentVariables;
      const fromEnvironmentVariables = this.normalizeEnvObject(
        environmentVariables,
      );
      if (fromEnvironmentVariables) {
        return fromEnvironmentVariables;
      }

      const parsed = (value as { parsed?: unknown }).parsed;
      const fromParsed = this.normalizeEnvObject(parsed);
      if (fromParsed) {
        return fromParsed;
      }

      const keys = (value as { keys?: unknown }).keys;
      const fromKeysObject = this.normalizeEnvObject(keys);
      if (fromKeysObject) {
        return fromKeysObject;
      }

      const fromKeys = this.normalizeEnvItemsArray(keys);
      if (fromKeys) {
        return fromKeys;
      }

      const items = (value as { items?: unknown }).items;
      const fromItems = this.normalizeEnvItemsArray(items);
      if (fromItems) {
        return fromItems;
      }
    }

    return null;
  }

  private parseBackendEnvFromText(output: string): Record<string, string> {
    const envVars: Record<string, string> = {};

    // Parse KEY=VALUE format, handling values that contain '=' characters
    // (e.g., base64 encoded JWTs like "JWT_PRIVATE_KEY=eyJ...==")
    for (const line of output.split("\n")) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Find the first '=' to split key from value
      const eqIndex = trimmedLine.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmedLine.substring(0, eqIndex);
        const value = trimmedLine.substring(eqIndex + 1);
        if (key && value) {
          envVars[key] = value;
        }
      }
    }

    return envVars;
  }

  /**
   * Fallback method to read .env.local file directly and parse it
   */
  private async readEnvFileDirect(
    filePath: string,
  ): Promise<Record<string, string>> {
    try {
      const content = await this.readFile(filePath);
      const envVars: Record<string, string> = {};

      // Parse line by line
      const lines = content.split("\n");
      for (const line of lines) {
        // Skip empty lines and comments
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) {
          continue;
        }

        // Parse KEY=VALUE format
        const match = trimmedLine.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();

          // Remove surrounding quotes if present
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          envVars[key] = value;
        }
      }

      return envVars;
    } catch (error) {
      console.warn(`Failed to read env file ${filePath}:`, error);
      return {};
    }
  }

  // EnvironmentVariableCodebase interface methods
  async getEnvVars(): Promise<EnvVars> {
    // Try to get frontend env vars
    let frontendEnv: Record<string, string> = {};
    try {
      const frontendEnvResult = await this.runCommand(
        this.packageManager.run("@dotenvx/dotenvx get -f .env.local"),
      );

      if (frontendEnvResult.exitCode === 0) {
        const sanitized = this.sanitizeJsonOutput(frontendEnvResult.output);
        const parsed = JSON.parse(sanitized);
        const frontendShape = this.describeEnvJsonShape(parsed);

        const normalizedFrontend = this.normalizeEnvJson(parsed);
        if (!normalizedFrontend) {
          console.warn(
            `[DaytonaCodebase] dotenvx returned unsupported format (${frontendShape}). Falling back to direct file read.`,
          );
          frontendEnv = await this.readEnvFileDirect(".env.local");
        } else {
          frontendEnv = normalizedFrontend;
        }
      } else {
        console.warn(
          `[DaytonaCodebase] dotenvx command failed with exit code ${frontendEnvResult.exitCode}. Output: ${frontendEnvResult.output.substring(0, 200)}`,
        );
        frontendEnv = await this.readEnvFileDirect(".env.local");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[DaytonaCodebase] Error getting frontend env vars: ${errorMessage}`,
      );

      try {
        frontendEnv = await this.readEnvFileDirect(".env.local");
      } catch (fallbackError) {
        console.warn(
          "[DaytonaCodebase] Fallback also failed, using empty object:",
          fallbackError,
        );
      }
    }

    // Try to get backend env vars
    let backendEnv: Record<string, string> = {};
    try {
      const backendEnvResult = await this.runCommand(
        `CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/dev.key 2>/dev/null) ${this.packageManager.run("convex env list")}`,
      );

      // Check if it's an authentication error
      if (backendEnvResult.exitCode !== 0) {
        if (hasConvexAuthError(backendEnvResult.output)) {
          console.warn(
            "Convex authentication not available in sandbox, skipping backend env vars",
          );
        } else {
          console.warn(
            "Failed to get backend env vars:",
            backendEnvResult.output,
          );
        }
      } else {
        const backendEnvOutput = this.cleanCommandOutput(backendEnvResult.output);

        // Prefer KEY=VALUE parsing first. `convex env list` commonly returns
        // line-based output, and values may contain JSON blobs (e.g. JWKS)
        // which would confuse JSON extraction if parsed first.
        backendEnv = this.parseBackendEnvFromText(backendEnvOutput);
        if (Object.keys(backendEnv).length > 0) {
          return { frontend: frontendEnv, backend: backendEnv };
        }

        // Convex can return either KEY=VALUE lines or JSON payloads
        // (e.g. { items: [{ name, value, deploymentTypes }], pagination: ... }).
        if (this.looksLikeJsonPayload(backendEnvOutput)) {
          try {
            const parsed = JSON.parse(this.sanitizeJsonOutput(backendEnvOutput));
            backendEnv = this.normalizeEnvJson(parsed) ?? {};
          } catch {
            backendEnv = {};
          }
        }
      }
    } catch (error) {
      console.warn("Error getting backend env vars:", error);
    }

    return { frontend: frontendEnv, backend: backendEnv };
  }

  async setEnvVars(envVars: EnvVars) {
    // set frontend env vars
    for (const [key, value] of Object.entries(envVars.frontend)) {
      try {
        await this.runCommandThrow("[ -f .env.local ] || touch .env.local");
        await this.runCommandThrow(
          `${this.packageManager.run(`@dotenvx/dotenvx set "${key.replace(/"/g, '\\"')}" "${value.replace(/"/g, '\\"')}" -f .env.local -p`)}`,
        );
      } catch (error) {
        console.error(`Failed to set frontend env var ${key}:`, error);
        throw error;
      }
    }

    // set backend env vars
    for (const [key, value] of Object.entries(envVars.backend)) {
      try {
        const result = await this.runCommand(
          this.packageManager.run(
            `convex env set "${key.replace(/"/g, '\\"')}" -- "${value.replace(/"/g, '\\"')}"`,
          ),
        );

        // Check for authentication errors
        if (result.exitCode !== 0) {
          if (hasConvexAuthError(result.output)) {
            throw new Error(
              "Convex authentication not available in sandbox. Backend environment variables cannot be set from here.",
            );
          } else {
            throw new Error(
              `Error executing command: Command ERROR: \n${result.output}`,
            );
          }
        }
      } catch (error) {
        throw error;
      }
    }
  }

  // VercelDeployableCodebase interface methods
  async prepareForDeployment(): Promise<VercelDeploymentFile[]> {
    if (!this.sandbox) {
      throw new Error("Cannot prepare for deployment: sandbox not initialized");
    }

    const filePaths: string[] = [];
    const session = await this.sandbox;

    const artifactDirCandidates = [`${this.projectDir}/isolate`, "isolate"];
    let artifactDir: string | undefined;
    for (const candidate of artifactDirCandidates) {
      try {
        await session.fs.listFiles(candidate);
        artifactDir = candidate;
        break;
      } catch {
        // Try next candidate
      }
    }

    if (!artifactDir) {
      throw new Error(
        "Cannot prepare for deployment: artifact directory not found (expected codebase/isolate or isolate)",
      );
    }

    const processDir = async (dir: string) => {
      const entries = await session.fs.listFiles(dir);
      for (const entry of entries) {
        if (!entry.isDir) {
          filePaths.push(path.join(dir, entry.name));
        } else if (entry.isDir) {
          await processDir(path.join(dir, entry.name));
        }
      }
    };

    await processDir(artifactDir);

    const files: [string, Uint8Array][] = await Promise.all(
      filePaths.map(async (filePath) => {
        const readPath = filePath.startsWith(`${this.projectDir}/`)
          ? filePath.slice(this.projectDir.length + 1)
          : path.join("..", filePath);
        return [filePath, await this.readFileBytes(readPath)];
      }),
    );

    const artifactPrefix = `${artifactDir}/`;
    return files.map(([filePath, content]) => {
      const normalizedFilePath = filePath.startsWith(artifactPrefix)
        ? filePath.slice(artifactPrefix.length)
        : filePath.replace("isolate/", "");
      const buf = Buffer.from(content);
      const sha = createHash("sha1").update(buf).digest("hex");
      return {
        file: normalizedFilePath,
        sha,
        size: buf.length,
        content: buf,
      };
    });
  }

  // DevServerCodebase interface methods
  private static readonly DEV_SESSIONS = ["dev", "convex-dev"] as const;
  private static readonly SESSION_DELETE_TIMEOUT = 10000;
  private static readonly SESSION_DELETE_CHECK_INTERVAL = 1000;

  // Instance property to use the detected package manager's dev command
  private get DEV_SERVER_COMMANDS() {
    return {
      dev: { setup: "cd codebase", start: this.packageManager.dev() },
      "convex-dev": {
        setup:
          "cd codebase && export CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/dev.key)",
        start: this.packageManager.run("convex dev"),
      },
    } as const;
  }

  /**
   * Check if dev servers are currently running.
   *
   * This method verifies that all required dev sessions ('dev' and 'convex-dev')
   * exist and have healthy running commands (exit code is null/undefined).
   *
   * @returns {Promise<boolean>} True if all dev servers are running, false otherwise
   *
   * @example
   * ```typescript
   * const isRunning = await codebase.isDevServerRunning();
   * if (!isRunning) {
   *   await codebase.restartDevServer();
   * }
   * ```
   */
  async isDevServerRunning(): Promise<boolean> {
    if (!this.sandbox) {
      return false;
    }

    const sessions = await this.sandbox.process.listSessions();

    // Use strict health check to ensure correct package manager commands are running
    for (const requiredSessionId of DaytonaCodebase.DEV_SESSIONS) {
      const health = await this.checkSessionHealth(sessions, requiredSessionId);
      if (health !== "running") {
        return false;
      }
    }

    return true;
  }

  async restartDevServer() {
    if (!this.sandbox) {
      throw new Error("Cannot restart dev server: sandbox not initialized");
    }

    console.log(
      `[restartDevServer] Restarting dev servers with ${this.packageManager.name}`,
    );

    await this.stopDevServer();

    // Create and start sessions
    for (const sessionId of DaytonaCodebase.DEV_SESSIONS) {
      await this.sandbox.process.createSession(sessionId);

      const commands = this.DEV_SERVER_COMMANDS[sessionId];
      const { setup, start } = commands;

      // Combine setup and start commands to run in the same shell context
      // This ensures environment variables and directory changes persist
      const fullCommand = setup ? `${setup} && ${start}` : start;

      const startResult = await this.sandbox.process.executeSessionCommand(
        sessionId,
        {
          command: fullCommand,
          runAsync: true,
        },
      );

      // Verify command was submitted
      if (!startResult.cmdId) {
        console.warn(
          `[${sessionId}] Command may not have started - no cmdId returned`,
        );
      }
    }

    console.info("Dev servers restarted");
  }

  async stopDevServer() {
    if (!this.sandbox) {
      throw new Error("Cannot stop dev server: sandbox not initialized");
    }

    const sessions = await this.sandbox.process.listSessions();
    const existingIds = new Set(sessions.map((s) => s.sessionId));

    // Delete target sessions
    for (const sessionId of DaytonaCodebase.DEV_SESSIONS) {
      if (existingIds.has(sessionId)) {
        try {
          await this.sandbox.process.deleteSession(sessionId);
        } catch (error) {
          console.warn(`Failed to delete ${sessionId} session:`, error);
        }
      }
    }

    // Wait for deletion to propagate
    if (existingIds.size > 0) {
      const startTime = Date.now();
      while (Date.now() - startTime < DaytonaCodebase.SESSION_DELETE_TIMEOUT) {
        await new Promise((resolve) =>
          setTimeout(resolve, DaytonaCodebase.SESSION_DELETE_CHECK_INTERVAL),
        );

        const verifySessions = await this.sandbox.process.listSessions();
        const remaining = new Set(verifySessions.map((s) => s.sessionId));
        const allDeleted = DaytonaCodebase.DEV_SESSIONS.every(
          (id) => !remaining.has(id),
        );

        if (allDeleted) {
          return;
        }
      }
    }

    console.info("Dev servers stopped");
  }

  /**
   * Check health of a specific session
   *
   * @param sessions - List of current sessions from the sandbox
   * @param sessionId - The session ID to check
   * @returns 'running' if healthy, 'failed' if exited with error, 'missing' if not found
   */
  private async checkSessionHealth(
    sessions: Array<{
      sessionId: string;
      commands: Array<{
        id?: string;
        command: string;
        exitCode?: number | null;
      }>;
    }>,
    sessionId: string,
  ): Promise<"running" | "failed" | "missing"> {
    const session = sessions.find((s) => s.sessionId === sessionId);

    if (!session || session.commands.length === 0) {
      return "missing";
    }

    // Strictly match the exact expected command
    // This ensures sessions with wrong package manager commands (e.g., npx instead of bunx)
    // are properly detected as unhealthy and recreated with the correct command
    const expectedCommand =
      this.DEV_SERVER_COMMANDS[
        sessionId as (typeof DaytonaCodebase.DEV_SESSIONS)[number]
      ].start;
    const devCommand = session.commands.find(
      (cmd) => cmd.command === expectedCommand,
    );

    if (!devCommand) {
      return "missing";
    }

    // null/undefined exitCode = still running
    if (devCommand.exitCode === null || devCommand.exitCode === undefined) {
      return "running";
    }

    return "failed";
  }

  /**
   * Wait for specific sessions to be deleted.
   * Polls the session list until all specified sessions are gone or timeout is reached.
   *
   * @param sessionIds - Array of session IDs to wait for
   * @param timeout - Maximum time to wait in milliseconds (default: 5000)
   */
  private async waitForSessionDeletion(
    sessionIds: string[],
    timeout: number = 5000,
  ): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const sessions = await this.sandbox.process.listSessions();
      const remaining = sessions.map((s) => s.sessionId);
      const allDeleted = sessionIds.every((id) => !remaining.includes(id));

      if (allDeleted) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Start commands for a specific session.
   * Executes setup commands (if any) followed by the main dev server command.
   *
   * @param sessionId - The session ID to start commands for
   * @throws {Error} If sandbox is not initialized
   */
  private async startSessionCommands(
    sessionId: (typeof DaytonaCodebase.DEV_SESSIONS)[number],
  ): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const commands = this.DEV_SERVER_COMMANDS[sessionId];
    const { setup, start } = commands;

    // Combine setup and start commands to run in the same shell context
    // This ensures environment variables and directory changes persist
    const fullCommand = setup ? `${setup} && ${start}` : start;

    const startResult = await this.sandbox.process.executeSessionCommand(
      sessionId,
      {
        command: fullCommand,
        runAsync: true,
      },
    );

    // Verify command was submitted
    if (!startResult.cmdId) {
      console.warn(
        `[${sessionId}] Command may not have started - no cmdId returned`,
      );
    }
  }

  /**
   * Ensure a single session is running.
   * Handles 409 conflicts gracefully by checking health and only deleting if needed.
   *
   * This method attempts to create a session. If it already exists (409 conflict),
   * it checks the session health and only recreates it if unhealthy.
   *
   * @param sessionId - The session ID to ensure is running
   * @throws {Error} If sandbox is not initialized or session creation fails
   */
  private async ensureSingleSessionRunning(
    sessionId: (typeof DaytonaCodebase.DEV_SESSIONS)[number],
  ): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    try {
      // Try to create (might 409 if exists)
      await this.sandbox.process.createSession(sessionId);
    } catch (error: any) {
      // Check for 409 conflict in multiple possible places
      const is409 =
        error.response?.status === 409 ||
        error.status === 409 ||
        error.statusCode === 409 ||
        error.message?.includes("409") ||
        error.message?.includes("Conflict") ||
        error.message?.includes("already exists");

      if (is409) {
        // Re-check health (might have recovered)
        const sessions = await this.sandbox.process.listSessions();
        const health = await this.checkSessionHealth(sessions, sessionId);

        if (health === "running") {
          return; // Already healthy
        }

        // Unhealthy but exists - delete and recreate
        await this.sandbox.process.deleteSession(sessionId);
        await this.waitForSessionDeletion([sessionId], 5000);
        await this.sandbox.process.createSession(sessionId);
      } else {
        throw error;
      }
    }

    // Start the commands for this session
    await this.startSessionCommands(sessionId);
  }

  /**
   * Intelligently ensure dev servers are running.
   * Only starts/restarts what's actually broken - doesn't touch healthy sessions.
   *
   * This method checks the health of each required dev session ('dev' and 'convex-dev')
   * and only restarts sessions that are missing or unhealthy. Healthy sessions are
   * left untouched to avoid disrupting running dev servers.
   *
   * @throws {Error} If sandbox is not initialized
   *
   * @example
   * ```typescript
   * // After package manager validation, ensure dev servers are running
   * await codebase.ensureDevServersRunning();
   * ```
   */
  async ensureDevServersRunning(): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Cannot ensure dev servers: sandbox not initialized");
    }

    const sessions = await this.sandbox.process.listSessions();

    // Check each session independently
    for (const sessionId of DaytonaCodebase.DEV_SESSIONS) {
      const health = await this.checkSessionHealth(sessions, sessionId);

      if (health === "running") {
        continue; // Already healthy, don't touch it
      }

      // Only restart unhealthy/missing sessions
      try {
        await this.ensureSingleSessionRunning(sessionId);
      } catch {
        // Continue with other sessions even if one fails
      }
    }
  }

  async getPreviewUrl() {
    if (!this.sandbox) {
      throw new Error("Cannot get preview url: sandbox not initialized");
    }
    const result = await this.sandbox.getPreviewLink(5173);
    return result.url;
  }

  async installDependencies(): Promise<void> {
    try {
      const command = this.packageManager.install();
      const result = await this.runCommand(command, 300000); // 5 minute timeout
      if (result.exitCode !== 0) {
        console.error(
          `[DaytonaCodebase] ${this.packageManager.name} install failed:`,
          result.output,
        );
        throw new Error(
          `${this.packageManager.name} install failed: ${result.output}`,
        );
      }
    } catch (error) {
      console.error("[DaytonaCodebase] Failed to install dependencies:", error);
      throw error;
    }
  }

  getLockfileName(): string {
    return this.packageManager.lockfileName;
  }

  getPackageManagerName(): "pnpm" | "bun" {
    return this.packageManager.name;
  }

  getPackageManager(): PackageManager {
    return this.packageManager;
  }

  // ExtendedGitOperations implementation
  async getCurrentBranch(): Promise<string> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      // Use git command directly as it's more reliable
      const result = await this.runCommandThrow("git branch --show-current");
      return result.output.trim();
    });
  }

  async createBranch(branchName: string, fromRef?: string): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      const repoPath = this.projectPath;

      // If fromRef is specified, use git command directly since Daytona SDK doesn't support it
      if (fromRef) {
        await this.runCommandThrow(`git branch ${branchName} ${fromRef}`);
      } else {
        await this.sandbox.git.createBranch(repoPath, branchName);
      }
    });
  }

  async checkoutBranch(branchName: string): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      const repoPath = this.projectPath;
      await this.sandbox.git.checkoutBranch(repoPath, branchName);
    });
  }

  async deleteBranch(
    branchName: string,
    force: boolean = false,
  ): Promise<void> {
    void force; // Force flag not supported by Daytona SDK, kept for API compatibility
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      const repoPath = this.projectPath;
      await this.sandbox.git.deleteBranch(repoPath, branchName);
    });
  }

  async listBranches(): Promise<string[]> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      // Use git command for consistency with CSB implementation
      const result = await this.runCommandThrow("git branch -a");
      return result.output
        .trim()
        .split("\n")
        .map((line) => line.replace(/^[\s\*]+/, "").trim())
        .filter(Boolean)
        .filter((branch) => !branch.includes("backup-")); // Filter out backup branches for performance
    });
  }

  async getStatus(): Promise<{
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      // Use single efficient git status --porcelain command instead of 3 separate commands
      const result = await this.runCommand("git status --porcelain");

      // Check exitCode for errors
      if (result.exitCode !== 0) {
        console.warn("git status failed:", result.output);
        return {
          staged: [],
          unstaged: [],
          untracked: [],
        };
      }

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      // Parse porcelain format: XY FILENAME
      // X = index status, Y = working tree status
      const lines = result.output.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        if (line.length < 4) continue; // Malformed line

        const indexStatus = line[0]; // First character
        const workTreeStatus = line[1]; // Second character
        const filename = line.substring(3); // Skip "XY "

        // Index status (staged changes)
        if (indexStatus !== " " && indexStatus !== "?") {
          staged.push(filename);
        }

        // Working tree status (unstaged changes)
        if (workTreeStatus !== " " && workTreeStatus !== "?") {
          unstaged.push(filename);
        }

        // Untracked files
        if (indexStatus === "?" && workTreeStatus === "?") {
          untracked.push(filename);
        }
      }

      return {
        staged,
        unstaged,
        untracked,
      };
    });
  }

  async getDiff(
    cached: boolean = false,
    nameOnly: boolean = false,
  ): Promise<string> {
    let command = "git diff";
    if (cached) command += " --cached";
    if (nameOnly) command += " --name-only";

    const result = await this.runCommand(command);
    return result.output;
  }

  /**
   * Set up secure in-memory git credential helper
   * This configures git to use credentials without writing them to files
   *
   * FIXED: Scope credential helper to github.com specifically.
   * This ensures git uses the credential helper when prompted for https://github.com URLs,
   * instead of failing immediately because terminal prompts are disabled.
   */
  private async setupGitCredentialHelper(token: string): Promise<void> {
    const credentialHelper = `'!f() { echo "username=x-access-token"; echo "password=${token}"; }; f'`;

    // Scope to github.com so the credential helper is triggered for GitHub URLs
    await this.runCommandThrow(
      `git config credential.https://github.com.helper ${credentialHelper}`,
    );

    // Also set the global helper as fallback
    await this.runCommandThrow(
      `git config credential.helper ${credentialHelper}`,
    );
  }

  /**
   * Clean up git credential configuration
   */
  private async cleanupGitCredentialHelper(): Promise<void> {
    try {
      // Clean up both scoped and global credential helpers
      await this.runCommand(
        `git config --unset credential.https://github.com.helper`,
      );
      await this.runCommand(`git config --unset credential.helper`);
    } catch (error) {
      // Non-fatal error - log but don't throw
      console.warn("Warning: Could not cleanup git credentials:", error);
    }
  }

  async fetch(
    remote: string = "origin",
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void> {
    if (token && repoOwner && repoName) {
      // Use secure credential helper with clean URL
      const repoUrl = `https://github.com/${repoOwner}/${repoName}.git`;
      try {
        await this.setupGitCredentialHelper(token);
        await this.runCommandThrow(
          `git fetch --force ${repoUrl} main:refs/remotes/github/main`,
        );
      } finally {
        await this.cleanupGitCredentialHelper();
      }
    } else {
      // Use existing remote
      await this.runCommandThrow(`git fetch ${remote}`);
    }
  }

  async pull(
    remote: string = "origin",
    branch?: string,
    token?: string,
    repoOwner?: string,
    repoName?: string,
    noRebase: boolean = true,
  ): Promise<void> {
    if (token && repoOwner && repoName) {
      // Use secure credential helper with clean URL
      const repoUrl = `https://github.com/${repoOwner}/${repoName}.git`;
      const rebaseFlag = noRebase ? "--no-rebase" : "";
      const branchArg = branch || "main";
      // Add flags to prevent any interactive prompts
      const pullCommand =
        `git pull ${rebaseFlag} --no-edit --commit ${repoUrl} ${branchArg}`
          .replace(/\s+/g, " ")
          .trim();
      try {
        await this.setupGitCredentialHelper(token);
        await this.runCommandThrow(pullCommand);
      } finally {
        await this.cleanupGitCredentialHelper();
      }
    } else {
      // Use Daytona's native pull method
      void remote; // Not used when using native SDK method
      return this.withRetry(async () => {
        if (!this.sandbox) {
          throw new Error("SANDBOX NOT ACTIVE");
        }

        const repoPath = this.projectPath;
        await this.sandbox.git.pull(repoPath);
      });
    }
  }

  async push(
    remote: string = "origin",
    branch?: string,
    force: boolean = false,
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void> {
    if (token && repoOwner && repoName) {
      // Use secure credential helper with clean URL
      const repoUrl = `https://github.com/${repoOwner}/${repoName}.git`;
      const branchArg = branch || "main";
      const forceFlag = force ? "--force" : "";
      const pushCommand = `git push ${forceFlag} ${repoUrl} ${branchArg}`
        .replace(/\s+/g, " ")
        .trim();
      try {
        await this.setupGitCredentialHelper(token);
        await this.runCommandThrow(pushCommand);
      } finally {
        await this.cleanupGitCredentialHelper();
      }
    } else {
      // Use Daytona's native push method
      void remote; // Not used when using native SDK method
      return this.withRetry(async () => {
        if (!this.sandbox) {
          throw new Error("SANDBOX NOT ACTIVE");
        }

        const repoPath = this.projectPath;
        await this.sandbox.git.push(repoPath);
      });
    }
  }

  async addFiles(files: string[]): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      const repoPath = this.projectPath;
      await this.sandbox.git.add(repoPath, files);
    });
  }

  async addAll(): Promise<void> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      const repoPath = this.projectPath;
      await this.sandbox.git.add(repoPath, ["."]);
    });
  }

  async resetFiles(files: string[]): Promise<void> {
    // Daytona SDK doesn't have a direct reset method, use git command
    if (files.length === 0) return;
    await this.runCommandThrow(`git reset ${files.join(" ")}`);
  }

  async getRemotes(): Promise<string[]> {
    const result = await this.runCommand("git remote");
    return result.output.trim().split("\n").filter(Boolean);
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.runCommandThrow(`git remote add ${name} ${url}`);
  }

  async removeRemote(name: string): Promise<void> {
    await this.runCommandThrow(`git remote remove ${name}`);
  }

  // Commit operations
  async getCommitHash(ref: string = "HEAD"): Promise<string> {
    const result = await this.runCommandThrow(`git rev-parse ${ref}`);
    return result.output.trim();
  }

  async getCommitCount(ref: string = "HEAD"): Promise<number> {
    const result = await this.runCommand(
      `git rev-list --count ${ref} 2>/dev/null || echo '0'`,
    );
    return parseInt(result.output.trim()) || 0;
  }

  async getCurrentCommitHash(): Promise<string> {
    const result = await this.runCommand(
      "git rev-parse HEAD 2>/dev/null || echo ''",
    );
    const hash = result.output.trim();
    if (!hash) {
      throw new Error("No commits found in repository");
    }
    return hash;
  }

  // Remote state operations
  async getRemoteHead(remote: string, branch: string): Promise<string | null> {
    const result = await this.runCommand(
      `git ls-remote ${remote} ${branch}`,
      20000,
    );

    if (result.exitCode === 0 && result.output.trim()) {
      const output = result.output.trim();
      if (output) {
        // ls-remote output format: "commit_hash\tref_name"
        const hash = output.split("\t")[0];
        return hash || null;
      }
    }

    return null;
  }

  async getAheadBehindCounts(
    remote: string,
    branch: string,
  ): Promise<{ ahead: number; behind: number }> {
    const remoteBranch = `refs/remotes/${remote}/${branch}`;

    // Count commits ahead (local commits not in remote)
    const aheadResult = await this.runCommand(
      `git rev-list --count HEAD ^${remoteBranch} 2>/dev/null || echo '0'`,
      5000,
    );
    const ahead = parseInt(aheadResult.output.trim()) || 0;

    // Count commits behind (remote commits not in local)
    const behindResult = await this.runCommand(
      `git rev-list --count ${remoteBranch} ^HEAD 2>/dev/null || echo '0'`,
      5000,
    );
    const behind = parseInt(behindResult.output.trim()) || 0;

    return { ahead, behind };
  }

  // Reset operations
  async resetHard(ref: string): Promise<void> {
    await this.runCommandThrow(`git reset --hard ${ref}`);
  }

  // Remote URL management
  async setRemoteUrl(
    name: string,
    url: string,
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void> {
    if (token && repoOwner && repoName) {
      // Use clean URL (credentials handled by credential.helper during operations)
      const repoUrl = `https://github.com/${repoOwner}/${repoName}.git`;
      await this.runCommandThrow(`git remote set-url ${name} ${repoUrl}`);
    } else {
      // Use provided URL
      await this.runCommandThrow(`git remote set-url ${name} ${url}`);
    }
  }

  async getRemoteUrl(name: string): Promise<string> {
    const result = await this.runCommandThrow(`git remote get-url ${name}`);
    return result.output.trim();
  }

  // Branch tracking
  async setUpstreamBranch(
    remote: string,
    remoteBranch: string,
    localBranch?: string,
  ): Promise<void> {
    const branch = localBranch || (await this.getCurrentBranch());
    await this.runCommandThrow(
      `git branch --set-upstream-to=${remote}/${remoteBranch} ${branch}`,
    );
  }

  // Repository initialization
  async initRepository(): Promise<void> {
    await this.runCommand("git init");
  }

  async configureUser(name: string, email: string): Promise<void> {
    await this.runCommandThrow(
      `git config user.name "${name}" && git config user.email "${email}"`,
    );
  }

  // Tag operations
  async createTag(
    tagName: string,
    message?: string,
    ref: string = "HEAD",
  ): Promise<void> {
    if (message) {
      await this.runCommandThrow(
        `git tag -a ${tagName} -m "${message}" ${ref}`,
      );
    } else {
      await this.runCommandThrow(`git tag ${tagName} ${ref}`);
    }
  }

  async pushTag(
    remote: string,
    tagName: string,
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void> {
    if (token && repoOwner && repoName) {
      // Use secure credential helper with clean URL
      const repoUrl = `https://github.com/${repoOwner}/${repoName}.git`;
      const pushCommand = `git push ${repoUrl} ${tagName}`;
      try {
        await this.setupGitCredentialHelper(token);
        await this.runCommandThrow(pushCommand);
      } finally {
        await this.cleanupGitCredentialHelper();
      }
    } else {
      // Fall back to simple git push without authentication
      await this.runCommandThrow(`git push ${remote} ${tagName}`);
    }
  }

  async listTags(): Promise<string[]> {
    const result = await this.runCommand("git tag -l");
    if (result.exitCode !== 0 || !result.output.trim()) {
      return [];
    }
    return result.output.trim().split("\n").filter(Boolean);
  }

  async deleteTag(tagName: string): Promise<void> {
    await this.runCommandThrow(`git tag -d ${tagName}`);
  }

  async revertToCommit(targetHash: string): Promise<string> {
    try {
      // Get current commit hash
      const currentHashResult =
        await this.runCommandThrow("git rev-parse HEAD");
      const currentHash = currentHashResult.output.trim();

      // If already at target commit, nothing to do
      if (currentHash === targetHash) {
        return currentHash;
      }

      // Get list of commits between target and current (newest first)
      const commitsResult = await this.runCommandThrow(
        `git rev-list ${targetHash}..HEAD`,
      );

      if (!commitsResult.output.trim()) {
        return currentHash;
      }

      // Get the target commit message
      const targetMsgResult = await this.runCommandThrow(
        `git log -1 --format=%s ${targetHash}`,
      );
      const targetMsg = targetMsgResult.output
        .replace(/^=[\r\n]+/gm, "")
        .replace(/=\r/g, "")
        .replace(/=\n/g, "")
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/>\s*$/g, "")
        .trim();

      // Revert all commits in a single operation using --no-commit, then commit once
      const revertMessage = `Revert to "${targetMsg}"`;

      // Use --no-commit to stage all reverts without committing, then commit once
      await this.runCommandThrow(`git revert --no-commit ${targetHash}..HEAD`);

      // Use heredoc for commit message to avoid escaping issues
      // Use --allow-empty in case there are no changes (e.g., reverting an empty commit)
      await this.runCommandThrow(
        `git commit --allow-empty -F - <<'EOF'\n${revertMessage}\nEOF`,
      );

      // Return the final commit hash
      const finalHashResult = await this.runCommandThrow("git rev-parse HEAD");
      return finalHashResult.output.trim();
    } catch (error) {
      console.error(`Failed to revert to commit ${targetHash}:`, error);

      // Try to abort any ongoing revert operation
      try {
        await this.runCommandThrow("git revert --abort");
      } catch {
        // Ignore abort errors - there might not be an ongoing revert
      }

      throw new Error(`Revert to commit ${targetHash} failed: ${error}`);
    }
  }

  // Backup operations
  async createBackupBranch(operation: string = "sync"): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupBranch = `backup-${operation}-${timestamp}`;

    // Get current branch
    const originalBranch = await this.getCurrentBranch();

    // Check for uncommitted work
    const status = await this.getStatus();
    const hasUncommittedWork =
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0;

    await this.commitIfDirty();

    // Create backup branch from current HEAD
    await this.createBranch(backupBranch);

    // If we're on a backup branch, switch to main to leave a clean state for subsequent operations
    if (originalBranch.startsWith("backup-")) {
      try {
        await this.checkoutBranch("main");
      } catch (error) {
        console.warn(
          "[DaytonaCodebase] Failed to switch to main branch:",
          error,
        );
      }
    }

    // Ensure working directory is clean after backup creation
    await this.commitIfDirty();

    // Get the commit hash for reference
    let commitHash: string | undefined;
    try {
      commitHash = await this.getCommitHash("HEAD");
    } catch {
      // Non-fatal: hash is best-effort metadata
    }

    return {
      branchName: backupBranch,
      timestamp,
      commitHash,
      originalBranch,
      hasUncommittedWork,
    };
  }

  async restoreFromBackup(backupInfo: BackupInfo): Promise<void> {
    // Switch to original branch
    await this.checkoutBranch(backupInfo.originalBranch);

    // Reset to backup state
    await this.resetHard(backupInfo.branchName);
  }

  async cleanupOldBackups(keepCount: number = 5): Promise<void> {
    // Get all local backup branches sorted by creation time
    const branchListResult = await this.runCommand(
      "git for-each-ref --sort=-creatordate --format='%(refname:short)' refs/heads/backup-*",
    );

    if (branchListResult.exitCode !== 0 || !branchListResult.output?.trim()) {
      return;
    }

    const branches = branchListResult.output
      .trim()
      .split("\n")
      .filter((b: string) => b.trim());

    if (branches.length > keepCount) {
      const branchesToDelete = branches.slice(keepCount);

      for (const branch of branchesToDelete) {
        try {
          await this.deleteBranch(branch.trim(), true);
        } catch (deleteError) {
          console.warn(
            `[DaytonaCodebase] Failed to delete local backup branch ${branch}:`,
            deleteError,
          );
        }
      }
    }
  }

  async listBackupBranches(): Promise<
    Array<{
      branchName: string;
      commitHash: string;
      commitDate: string;
      commitMessage: string;
    }>
  > {
    const branchInfoResult = await this.runCommand(
      "git for-each-ref --sort=-creatordate --format='%(refname:short)|%(objectname:short)|%(creatordate:iso)|%(subject)' refs/heads/backup-*",
    );

    if (branchInfoResult.exitCode !== 0 || !branchInfoResult.output?.trim()) {
      return [];
    }

    const branches = branchInfoResult.output
      .trim()
      .split("\n")
      .map((line: string) => {
        const [branchName, commitHash, commitDate, commitMessage] =
          line.split("|");
        return {
          branchName: branchName.trim(),
          commitHash: commitHash.trim(),
          commitDate: commitDate.trim(),
          commitMessage: commitMessage?.trim() || "No message",
        };
      });

    return branches;
  }

  async verifyBackup(
    backupInfo: BackupInfo,
  ): Promise<{ isValid: boolean; error?: string }> {
    // Check if backup branch exists
    const branchExistsResult = await this.runCommand(
      `git show-ref --verify --quiet refs/heads/${backupInfo.branchName}`,
    );

    if (branchExistsResult.exitCode !== 0) {
      return {
        isValid: false,
        error: "Backup branch does not exist",
      };
    }

    // Check if commit hash matches (if available)
    if (backupInfo.commitHash) {
      const currentHash = await this.getCommitHash(backupInfo.branchName);

      if (currentHash !== backupInfo.commitHash) {
        return {
          isValid: false,
          error: "Backup commit hash mismatch",
        };
      }
    }

    return { isValid: true };
  }

  // Conflict detection and validation
  async detectPotentialConflicts(
    token: string,
    repoOwner: string,
    repoName: string,
    remote: string = "github",
  ): Promise<{ hasConflicts: boolean; errorMessage?: string }> {
    try {
      // Fetch latest changes from GitHub using authenticated fetch
      await this.fetch(remote, token, repoOwner, repoName);

      // Check what files would conflict using git diff
      const diffFilesResult = await this.runCommand(
        `git --no-pager diff --name-only HEAD ${remote}/main`,
        15000,
      );

      if (diffFilesResult.exitCode !== 0 || !diffFilesResult.output.trim()) {
        return { hasConflicts: false };
      }

      // Helper function to determine if a file is meaningful (not build artifacts)
      const isMeaningfulFile = (filePath: string): boolean => {
        const normalizedPath = filePath.trim().toLowerCase();
        if (!normalizedPath) return false;

        const ignoredPatterns = [
          "node_modules/",
          ".pnpm/",
          "dist/",
          "build/",
          ".next/",
          ".cache/",
          ".log",
          ".lock",
          "package-lock.json",
          "pnpm-lock.yaml",
          "bun.lock",
          "yarn.lock",
          ".git/",
          "coverage/",
          ".nyc_output/",
          ".DS_Store",
          "thumbs.db",
        ];

        return !ignoredPatterns.some((pattern) =>
          normalizedPath.includes(pattern),
        );
      };

      // Clean up ANSI escape sequences and filter out irrelevant files
      const cleanDiffFiles = diffFilesResult.output
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
        .trim();
      const changedFiles = cleanDiffFiles
        .split("\n")
        .filter(
          (file: string) =>
            file.trim() && !file.includes("\x1B") && isMeaningfulFile(file),
        );

      if (changedFiles.length === 0) {
        return {
          hasConflicts: false,
          errorMessage:
            "Only build artifact changes detected - safe to proceed",
        };
      }

      // Use git merge-tree to simulate merge without affecting working directory
      const mergeSimulationResult = await this.runCommand(
        `git merge-tree $(git merge-base HEAD ${remote}/main) HEAD ${remote}/main`,
        20000,
      );

      if (mergeSimulationResult.exitCode !== 0) {
        return { hasConflicts: false };
      }

      const mergeSimulation = mergeSimulationResult.output;

      // Check if merge-tree output contains conflict markers
      if (
        mergeSimulation.includes("<<<<<<<") ||
        mergeSimulation.includes("=======") ||
        mergeSimulation.includes(">>>>>>>")
      ) {
        // Extract conflicted files from conflict markers
        const conflictLines = mergeSimulation.split("\n");
        const conflictedFiles = new Set<string>();

        for (const line of conflictLines) {
          if (line.startsWith("<<<<<<< ")) {
            const parts = line.split(" ");
            if (parts.length > 1) {
              const filePath = parts.slice(1).join(" ").trim();
              conflictedFiles.add(filePath);
            }
          }
        }

        const meaningfulConflictedFiles =
          Array.from(conflictedFiles).filter(isMeaningfulFile);

        if (meaningfulConflictedFiles.length > 0) {
          return {
            hasConflicts: true,
            errorMessage: `Repository divergence detected with conflicts in ${meaningfulConflictedFiles.length} source files: ${meaningfulConflictedFiles.join(", ")}`,
          };
        } else {
          return {
            hasConflicts: false,
            errorMessage:
              "Only build artifact conflicts detected - safe to proceed",
          };
        }
      }

      // No conflicts detected - safe to proceed
      return { hasConflicts: false };
    } catch (error: any) {
      console.error(
        "[DaytonaCodebase] Error during conflict detection:",
        error,
      );
      return {
        hasConflicts: false,
        errorMessage: `Failed to detect conflicts: ${error.message}`,
      };
    }
  }

  async commitIfDirty(): Promise<void> {
    const status = await this.getStatus();

    const totalChanges =
      status.staged.length + status.unstaged.length + status.untracked.length;

    if (totalChanges === 0) {
      return;
    }

    try {
      await this.addAll();
      await this.commit("WIP: Auto-commit to ensure clean working directory");
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      // If the error is about a clean working tree, it means the tree became clean
      // between our status check and the commit attempt - this is fine
      if (
        !errorMessage.includes("clean working tree") &&
        !errorMessage.includes("nothing to commit")
      ) {
        throw error;
      }
    }
  }

  async abortMerge(): Promise<void> {
    try {
      await this.runCommand("git merge --abort", 10000);
    } catch (error: any) {
      // Ignore errors - there might not be an ongoing merge
      const errorMessage = error?.message || String(error);
      const isNoMerge =
        errorMessage.includes("no merge in progress") ||
        errorMessage.includes("There is no merge to abort");
      if (!isNoMerge) {
        console.warn(
          "[DaytonaCodebase] Error aborting merge (non-critical):",
          error,
        );
      }
    }
  }

  async cleanupConflictedState(): Promise<void> {
    // Step 1: Abort any ongoing merge
    await this.abortMerge();

    // Step 2: Reset to HEAD (removes all uncommitted changes)
    try {
      await this.runCommand("git reset --hard HEAD", 10000);
    } catch (error) {
      console.warn("[DaytonaCodebase] Error resetting to HEAD:", error);
    }

    // Step 3: Clean untracked files and directories
    try {
      await this.runCommand("git clean -fd", 10000);
    } catch (error) {
      console.warn(
        "[DaytonaCodebase] Error cleaning untracked files:",
        error,
      );
    }
  }

  // SandboxStatsCodebase implementation
  async getStats(): Promise<SandboxStats> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      try {
        // Ensure stats scripts are installed before trying to use them
        // This is idempotent - if already installed, it returns immediately
        await this.ensureStatsScripts();

        // Use absolute path with .sh extension
        // Scripts are installed to /home/daytona/.local/bin with .sh extension
        const result = await this.runCommandThrow(
          "/home/daytona/.local/bin/vly-stats-json.sh",
        );
        const stats: SandboxStats = JSON.parse(result.output.trim());
        return stats;
      } catch (error) {
        console.error("[DaytonaCodebase] Failed to get stats:", error);
        throw new Error(`Failed to get sandbox stats: ${error}`);
      }
    });
  }

  /**
   * Run a command in a PTY terminal with streaming output callback
   * @param command - Command to execute
   * @param onStdout - Callback function for stdout data chunks
   * @param ptyId - Optional PTY session ID (defaults to timestamp-based ID)
   * @returns Promise with exit code
   */
  async runPtyCommand(
    command: string,
    onStdout: (data: string) => void | Promise<void>,
    ptyId?: string,
  ): Promise<{ exitCode: number | null; error?: string }> {
    return this.withRetry(async () => {
      if (!this.sandbox) {
        throw new Error("SANDBOX NOT ACTIVE");
      }

      const sessionId = ptyId || `pty-${Date.now()}`;
      let ptyHandle: any = null;

      try {
        // Create PTY session
        ptyHandle = await this.sandbox.process.createPty({
          id: sessionId,
          cols: 120,
          rows: 30,
          onData: (data: Uint8Array) => {
            const text = new TextDecoder().decode(data);
            void onStdout(text);
          },
        });

        // Wait for PTY connection to be ready
        await ptyHandle.waitForConnection();

        // Send command input (following Daytona docs pattern)
        await ptyHandle.sendInput(`${command}\n`);

        // Close the terminal session before waiting (as per Daytona docs)
        // This ensures the command terminates properly
        await ptyHandle.sendInput("exit\n");

        // Wait for command to complete
        const result = await ptyHandle.wait();

        return {
          exitCode: result.exitCode ?? null,
          error: result.error,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(`ERROR RUNNING PTY COMMAND: ${errorMessage}`);
      } finally {
        // Clean up PTY session
        if (ptyHandle) {
          try {
            await ptyHandle.kill();
          } catch (killError: any) {
            // Ignore 404 errors - PTY session may have already been closed/terminated
            // This is expected behavior when the session completes naturally
            const is404Error =
              killError?.statusCode === 404 ||
              killError?.response?.status === 404 ||
              killError?.status === 404 ||
              killError?.response?.data?.error === "PTY session not found" ||
              killError?.name === "DaytonaNotFoundError";

            if (!is404Error) {
              console.error(
                "[DaytonaCodebase] Error killing PTY session:",
                killError,
              );
            }
            // Silently ignore 404 errors (session already closed)
          }
        }
      }
    });
  }
}

async function openDaytonaSandboxWithRetry(sandboxId: string) {
  const maxRetries = 10;
  let lastError: Error | null = null;
  let retryCount = 0;

  // Get the singleton SDK instance
  const sdk = DaytonaSdkManager.getDaytonaSDK();

  while (retryCount < maxRetries) {
    try {
      let sandbox = await sdk.get(sandboxId);

      if (sandbox.state === "error") {
        throw new Error(
          `Sandbox is in error state: ${sandbox.errorReason || "Unknown error"}`,
        );
      }

      if (sandbox.state !== "started") {
        // Start the sandbox with explicit timeout (60 seconds)
        // This internally uses waitUntilStarted() which polls the API
        await sdk.start(sandbox, 60);
      }

      // Re-fetch after start to avoid stale sandbox metadata in long-lived objects.
      sandbox = await sdk.get(sandboxId);

      // Handle transitional states by waiting explicitly, then re-fetch again.
      if ((sandbox.state as string) === "starting") {
        await sandbox.waitUntilStarted(60);
        sandbox = await sdk.get(sandboxId);
      }

      if ((sandbox.state as string) !== "started") {
        throw new Error(
          `Sandbox failed to start. Current state: ${sandbox.state}`,
        );
      }

      // Toolbox-backed process/fs calls need sandbox target/IP metadata.
      // Refresh once and re-fetch to resolve eventual-consistency gaps.
      if (!hasSandboxTarget(sandbox)) {
        console.log(
          `Sandbox ${sandboxId} has no target/IP yet, refreshing metadata`,
        );
        await sandbox.refreshData();
        sandbox = await sdk.get(sandboxId);
      }

      if (!hasSandboxTarget(sandbox)) {
        throw new Error(
          `Sandbox ${sandboxId} started but target/IP is unavailable`,
        );
      }

      return sandbox;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      lastError = error as Error;
      retryCount++;

      if (retryCount >= maxRetries) {
        break;
      }

      // Check if the error is "State change in progress"
      const isStateChangeInProgress = errorMessage.includes(
        "State change in progress",
      );
      // For other errors, use standard exponential backoff
      const backoffTime = isStateChangeInProgress
        ? 1000 + retryCount * 2000
        : Math.pow(2, retryCount) * 1000;

      await new Promise((resolve) => setTimeout(resolve, backoffTime));
    }
  }

  // If we've exhausted all retries, throw the last error
  console.error("Failed to open Daytona sandbox after all retries:", lastError);
  throw (
    lastError ||
    new Error(
      `Failed to open sandbox ${sandboxId} after ${maxRetries} attempts`,
    )
  );
}
