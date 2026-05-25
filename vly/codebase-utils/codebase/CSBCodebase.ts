"use node";

import { CodeSandbox, Sandbox, SandboxClient } from "@codesandbox/sdk";
import { DeploymentSource } from "freestyle-sandboxes";
import path from "path";
import { filterTerminalOuptut } from "../../lib/utils";
import { openSandboxWithRetry } from "../instanceManager";
import {
  Codebase,
  Commit,
  DevServerCodebase,
  EnvironmentVariableCodebase,
  EnvVars,
  FreestyleDeployableCodebase,
  PackageManagerCodebase,
  SandboxStats,
  SandboxStatsCodebase,
  VersionControlledCodebase,
} from "./Codebase";
import { BackupInfo, ExtendedGitOperations } from "./ExtendedGitOperations";
import {
  PackageManager,
  PackageManagerType,
  getPackageManager,
} from "../packageManager";

export class CSBCodebase
  implements
    Codebase,
    VersionControlledCodebase,
    ExtendedGitOperations,
    EnvironmentVariableCodebase,
    FreestyleDeployableCodebase,
    DevServerCodebase,
    PackageManagerCodebase,
    SandboxStatsCodebase
{
  __versionControlled = true as const;

  private sdk: CodeSandbox;
  private sandboxId: string;
  private sandbox: Sandbox | null = null;
  private session: SandboxClient | null = null;
  allFilePaths: string[] = [];
  private filePathsCacheTime: number = 0;
  private readonly FILE_PATHS_CACHE_TTL = 60000; // 60 seconds cache TTL
  private readonly projectDir = "codebase"; // Project directory path

  // Package manager used by this codebase
  private packageManager: PackageManager;

  constructor(
    sandboxId: string,
    packageManagerType: PackageManagerType = "bun",
  ) {
    this.sandboxId = sandboxId;
    const sdk = new CodeSandbox(process.env.CSB_API_KEY);
    this.sdk = sdk;
    // Initialize package manager (defaults to bun for new projects)
    this.packageManager = getPackageManager(packageManagerType);
  }

  async initialize() {
    this.sandbox = await openSandboxWithRetry(this.sdk, this.sandboxId);
    if (!this.sandbox) {
      throw new Error("Failed to initialize sandbox");
    }
    this.session = await this.sandbox.connect();
    // File paths are loaded lazily on first access to avoid initialization overhead
  }

  public static async create(
    sandboxId: string,
    packageManagerType?: PackageManagerType,
  ) {
    const codebase = new CSBCodebase(sandboxId, packageManagerType);
    await codebase.initialize();
    return codebase;
  }

  private async getSession(): Promise<SandboxClient> {
    if (!this.sandbox) {
      console.error("Failed to initialize sandbox");
      throw new Error("Failed to initialize sandbox");
    }

    if (!this.session) {
      console.log("Creating new session");
      this.sandbox = await openSandboxWithRetry(this.sdk, this.sandboxId);
      this.session = await this.sandbox.connect();
      this.session.keepActiveWhileConnected(true);
    }

    // Simple health check - attempt a basic operation
    try {
      await this.session.fs.stat("/"); // Check root directory
    } catch (error) {
      console.warn("Session health check failed, reconnecting...", error);
      this.session = await this.sandbox.connect();
    }

    return this.session;
  }

  /**
   * @returns the download url of the codebase
   */
  async downloadCodebase() {
    if (!this.sandbox) {
      throw new Error("Cannot download codebase: sandbox not initialized");
    }
    const session = await this.getSession();
    const { downloadUrl } = await session.fs.download(`./${this.projectDir}`);

    return downloadUrl;
  }

  /**
   * Runs a command with streaming and timeout support.
   * @param command - The command to run.
   * @param timeout - The timeout for the command in milliseconds.
   * @param onStreamChunk - A callback function that receives chunks of the command output.
   * @returns The final output of the command.
   */
  async runCommand(
    command: string,
    timeout: number = 30000,
    onStreamChunk?: (chunk: string) => void,
  ) {
    if (!this.sandbox) {
      throw new Error("Cannot run command: sandbox not initialized");
    }

    const session = await this.getSession();

    let timer: NodeJS.Timeout;

    try {
      // TODO: add option to load prod key

      // Set GIT_TERMINAL_PROMPT=0 to completely disable git interactive prompts
      // This prevents git from hanging while waiting for user input
      const prefixedCommand = `cd ${this.projectDir} && CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/dev.key 2>/dev/null || echo "") GIT_TERMINAL_PROMPT=0 ${command}`;
      const commandShell =
        await session.commands.runBackground(prefixedCommand);

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Kill the command if it times out
          commandShell.kill();
          reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
        }, timeout);
      });

      // Set up streaming if callback is provided
      if (onStreamChunk) {
        commandShell.onOutput((output: string) => {
          onStreamChunk(output);
        });
      }

      const result = await Promise.race([
        commandShell.waitUntilComplete(),
        timeoutPromise,
      ]);
      clearTimeout(timer!);

      // TODO: statusCode 0 is hardcoded here for backwards compatibility; at some point it should be refactored away

      // filter out escape characters
      const formattedOutput = filterTerminalOuptut(result);
      return { output: formattedOutput, exitCode: 0 };
    } catch (error: unknown) {
      clearTimeout(timer!);
      return {
        output: filterTerminalOuptut(
          `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
        ),
        exitCode: 1,
      };
    }
  }

  // TODO: deprecated this
  async runCommandThrow(
    command: string,
    timeout: number = 10000,
    onStreamChunk?: (chunk: string) => void,
  ) {
    const result = await this.runCommand(command, timeout, onStreamChunk);
    if (result.exitCode !== 0) {
      throw new Error(result.output);
    }
    return result;
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
      // Command will be automatically prefixed with "cd {projectDir} &&" in runCommand
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
        // Fallback command will be automatically prefixed with "cd {projectDir} &&" in runCommand
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

  /**
   * Refreshes the file paths cache - call this after adding/removing files
   */
  async refreshFilePaths() {
    return this.getAllFilePaths(true);
  }

  async deleteFile(filePath: string): Promise<void> {
    console.log("trying to delete file:", filePath);
    if (!this.sandbox) {
      console.log("sandbox not initialized");
      throw new Error("Cannot delete file: sandbox not initialized");
    }

    const maxRetries = 3;
    const baseDelay = 250;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const session = await this.getSession();
        // Support deleting files outside codebase with ../ prefix
        const prefixedPath = filePath.startsWith("../")
          ? filePath.substring(3) // Remove ../ and use as-is (relative to sandbox root)
          : `${this.projectDir}/${filePath}`;
        console.log(
          `Deleting file (attempt ${attempt + 1}/${maxRetries + 1}) at path:`,
          prefixedPath,
        );

        // Use the filesystem API to delete the file
        await session.fs.remove(prefixedPath);
        console.log("File deleted successfully:", prefixedPath);

        // Update file paths cache if deleting from codebase directory
        if (!filePath.startsWith("../")) {
          console.log("Updating file paths cache after file deletion");
          const index = this.allFilePaths.indexOf(filePath);
          if (index !== -1) {
            this.allFilePaths.splice(index, 1);
          }
        }

        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to delete file ${filePath} (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`,
          error,
        );

        if (attempt === maxRetries) {
          throw new Error(
            `File could not be deleted after ${maxRetries + 1} attempts: ${filePath}. Final error: ${errorMessage}`,
          );
        }

        console.log("Invalidating session for reconnection on next attempt");
        this.session = null;

        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying delete in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Cannot create directory: sandbox not initialized");
    }

    try {
      // Use mkdir command which was working before
      await this.runCommand(`mkdir -p "${dirPath}"`);
      console.log("Directory created successfully:", dirPath);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to create directory ${dirPath}: ${errorMessage}`,
        error,
      );
      throw new Error(
        `Directory could not be created: ${dirPath}. Error: ${errorMessage}`,
      );
    }
  }

  async readFile(filePath: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error("Cannot read file: sandbox not initialized");
    }

    const maxRetries = 0; // turned off retries for now
    const baseDelay = 250;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const session = await this.getSession();
        // Support reading files outside codebase with ../ prefix
        const prefixedPath = path.join(this.projectDir, filePath);
        const file = await session.fs.readTextFile(prefixedPath);
        return file;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to read file ${filePath} (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`,
          error,
        );

        if (attempt === maxRetries) {
          throw new Error(
            `File could not be read after ${maxRetries + 1} attempts: ${filePath}. Final error: ${errorMessage}`,
          );
        }

        console.log("Invalidating session for reconnection on next attempt");
        this.session = null;

        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying read in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This line should never be reached due to the throw above, but TypeScript requires it
    throw new Error("Unexpected error in readFile");
  }

  async readFileBytes(filePath: string): Promise<Uint8Array> {
    if (!this.sandbox) {
      throw new Error("Cannot read file: sandbox not initialized");
    }

    const maxRetries = 1;
    const baseDelay = 250;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const session = await this.getSession();
        // Support reading files outside codebase with ../ prefix
        const prefixedPath = path.join(this.projectDir, filePath);
        const file = await session.fs.readFile(prefixedPath);
        return file;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to read binary file ${filePath} (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`,
          error,
        );

        if (attempt === maxRetries) {
          throw new Error(
            `Binary file could not be read after ${maxRetries + 1} attempts: ${filePath}. Final error: ${errorMessage}`,
          );
        }

        console.log("Invalidating session for reconnection on next attempt");
        this.session = null;

        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying binary read in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This line should never be reached due to the throw above, but TypeScript requires it
    throw new Error("Unexpected error in readFileBytes");
  }

  async checkIfFileExists(filePath: string): Promise<boolean> {
    if (!this.sandbox) {
      throw new Error("Cannot check if file exists: sandbox not initialized");
    }
    // First check if file is in the pre-populated list of files
    if (this.allFilePaths.includes(filePath)) {
      return true;
    }
    // If not found in the list, try to read the file to be sure
    try {
      const session = await this.getSession();
      // Support checking files outside codebase with ../ prefix
      const prefixedPath = path.join(this.projectDir, filePath);
      await session.fs.readTextFile(prefixedPath);
      return true;
    } catch (error) {
      console.log("file does not exist", error);
      return false;
    }
  }

  async writeFile(filePath: string, content: string) {
    console.log("trying to write file");
    if (!this.sandbox) {
      console.error("sandbox not initialized");
      throw new Error("Cannot write file: sandbox not initialized");
    }

    const maxRetries = 3;
    const baseDelay = 250; // 1 second base delay

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const session = await this.getSession();
        // Support writing files outside codebase with ../ prefix
        const prefixedPath = path.join(this.projectDir, filePath);
        console.log(
          `Writing file (attempt ${attempt + 1}/${maxRetries + 1}): ${prefixedPath}`,
        );
        console.log("editor url", session.editorUrl);
        await session.fs.writeTextFile(prefixedPath, content);
        console.log("file written completely w/ session id", session.id);

        // Update file paths cache if writing to codebase directory
        if (!filePath.startsWith("../")) {
          console.log("Updating file paths cache after file write");
          if (!this.allFilePaths.includes(filePath)) {
            this.allFilePaths.push(filePath);
          }
        }

        // Success - exit the retry loop
        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to write file ${filePath} (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`,
          error,
        );

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw new Error(
            `File could not be written after ${maxRetries + 1} attempts: ${filePath}. Final error: ${errorMessage}`,
          );
        }

        console.log("Invalidating session for reconnection on next attempt");
        this.session = null;

        // Calculate exponential backoff delay
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async writeBinaryFile(filePath: string, content: Uint8Array) {
    console.log("trying to write binary file");
    if (!this.sandbox) {
      console.log("sandbox not initialized");
      throw new Error("Cannot write binary file: sandbox not initialized");
    }

    const maxRetries = 3;
    const baseDelay = 250;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const session = await this.getSession();
        // Support writing files outside codebase with ../ prefix
        const prefixedPath = path.join(this.projectDir, filePath);
        console.log(
          `Writing binary file (attempt ${attempt + 1}/${maxRetries + 1}): ${prefixedPath}`,
        );
        console.log("editor url", session.editorUrl);
        await session.fs.writeFile(prefixedPath, content);
        console.log("binary file written completely w/ session id", session.id);

        // Update file paths cache if writing to codebase directory
        if (!filePath.startsWith("../")) {
          console.log("Updating file paths cache after binary file write");
          if (!this.allFilePaths.includes(filePath)) {
            this.allFilePaths.push(filePath);
          }
        }

        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to write binary file ${filePath} (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`,
          error,
        );

        if (attempt === maxRetries) {
          throw new Error(
            `Binary file could not be written after ${maxRetries + 1} attempts: ${filePath}. Final error: ${errorMessage}`,
          );
        }

        console.log("Invalidating session for reconnection on next attempt");
        this.session = null;

        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying binary write in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // TODO: this should be preloaded asynchronously for the frontend
  async getEnvVars(): Promise<EnvVars> {
    // Try to get frontend env vars
    let frontendEnv: Record<string, string> = {};
    try {
      const frontendEnvResult = await this.runCommand(
        this.packageManager.run("@dotenvx/dotenvx get -f .env.local"),
      );
      if (frontendEnvResult.exitCode === 0) {
        frontendEnv = Object.fromEntries(
          Object.entries(
            JSON.parse(frontendEnvResult.output) as Record<string, string>,
          ),
        );
      } else {
        console.warn("Failed to get frontend env vars, using empty object");
      }
    } catch (error) {
      console.warn("Error getting frontend env vars:", error);
    }

    // Try to get backend env vars
    let backendEnv: Record<string, string> = {};
    try {
      const backendEnvResult = await this.runCommand(
        this.packageManager.run("convex env list"),
      );

      // Check if it's an authentication error
      if (backendEnvResult.exitCode !== 0) {
        if (
          backendEnvResult.output.includes("401 Unauthorized") ||
          backendEnvResult.output.includes("AuthenticationFailed") ||
          backendEnvResult.output.includes("Authenticate with")
        ) {
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
        const backendEnvOutput = backendEnvResult.output
          .replaceAll(
            /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
            "",
          )
          .replaceAll("⠙", "");

        // Parse KEY=VALUE format, handling values that contain '=' characters
        // (e.g., base64 encoded JWTs like "JWT_PRIVATE_KEY=eyJ...==")
        for (const line of backendEnvOutput.split("\n")) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Find the first '=' to split key from value
          const eqIndex = trimmedLine.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmedLine.substring(0, eqIndex);
            const value = trimmedLine.substring(eqIndex + 1);
            if (key && value) {
              backendEnv[key] = value;
            }
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
      console.log(`Setting frontend env var: ${key} = ${value}`);
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
          if (
            result.output.includes("401 Unauthorized") ||
            result.output.includes("AuthenticationFailed") ||
            result.output.includes("Authenticate with")
          ) {
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
        console.error(`Failed to set backend env var ${key}:`, error);
        throw error;
      }
    }
  }

  async prepareForDeployment(): Promise<DeploymentSource & { kind: "files" }> {
    if (!this.sandbox) {
      throw new Error("Cannot prepare for deployment: sandbox not initialized");
    }

    // get all the file paths in the artifactDir

    const filePaths: string[] = [];

    const session = await this.getSession();

    const artifactDirCandidates = [`${this.projectDir}/isolate`, "isolate"];
    let artifactDir: string | undefined;
    for (const candidate of artifactDirCandidates) {
      try {
        await session.fs.readdir(candidate);
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
      const entries = await session.fs.readdir(dir);
      for (const entry of entries) {
        if (entry.type === "file") {
          filePaths.push(path.join(dir, entry.name));
        } else if (entry.type === "directory") {
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
    const base64EncodedFiles = files.map(([filePath, content]) => {
      const normalizedFilePath = filePath.startsWith(artifactPrefix)
        ? filePath.slice(artifactPrefix.length)
        : filePath.replace("isolate/", "");
      return [
        normalizedFilePath,
        {
          content: Buffer.from(content).toString("base64"),
          encoding: "base64",
        },
      ];
    });

    const preparedFiles: Record<
      string,
      { content: string; encoding: "base64" }
    > = Object.fromEntries(base64EncodedFiles);

    console.log("writing deployment-source.json");
    await this.session?.fs.writeTextFile(
      "deployment-source.json",
      JSON.stringify(preparedFiles),
    );
    console.log("deployment-source.json written");

    return {
      kind: "files",
      files: preparedFiles,
    };
  }

  async commit(message: string, allowEmpty: boolean = false): Promise<Commit> {
    // Add all changes and commit
    const allowEmptyFlag = allowEmpty ? " --allow-empty" : "";
    const commitCommand = `git add . && git commit${allowEmptyFlag} -F - <<'EOF'\n${message}\nEOF`;

    await this.runCommandThrow(commitCommand);

    const hashResult = await this.runCommandThrow("git rev-parse HEAD");
    const hash = hashResult.output.trim();

    const logResult = await this.runCommandThrow(
      `git log -1 --format="%s|%an|%at"`,
    );
    const [msg, author, timestamp] = logResult.output.trim().split("|");

    return {
      hash,
      message: msg,
      author,
      timestamp: parseInt(timestamp),
    };
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

      const cleanedOutput = result.output
        .replace(/[\x00-\x1F\x7F]/g, "")
        .trim();

      if (!cleanedOutput || cleanedOutput === "") {
        // no commits yet or empty output
        return [];
      }

      const parsedCommits: {
        commit: string;
        author: string;
        author_email: string;
        epoch: number;
        message: string;
      }[] = JSON.parse(cleanedOutput);

      return parsedCommits.map((commit) => ({
        hash: commit.commit,
        message: commit.message,
        author: commit.author,
        timestamp: commit.epoch,
      }));
    } catch (err) {
      console.error("Failed to get commits", err);
      throw err;
    }
  }

  /**
   * Revert to a specific commit using git revert (safe for GitHub sync)
   * This creates new commits that undo changes instead of rewriting history
   */
  async revertToCommit(targetHash: string): Promise<string> {
    try {
      // Get current commit hash
      const currentHashResult =
        await this.runCommandThrow("git rev-parse HEAD");
      const currentHash = currentHashResult.output.trim();

      // If already at target commit, nothing to do
      if (currentHash === targetHash) {
        console.log(`Already at target commit ${targetHash}`);
        return currentHash;
      }

      // Get list of commits between target and current (newest first)
      const commitsResult = await this.runCommandThrow(
        `git rev-list ${targetHash}..HEAD`,
      );

      if (!commitsResult.output.trim()) {
        console.log(`No commits to revert between ${targetHash} and HEAD`);
        return currentHash;
      }

      console.log(`Reverting commits to restore state at ${targetHash}`);

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
      const finalHash = finalHashResult.output.trim();

      console.log(
        `Successfully reverted to ${targetHash}, new HEAD is ${finalHash}`,
      );
      return finalHash;
    } catch (error) {
      console.error(`Failed to revert to commit ${targetHash}:`, error);

      // Try to abort any ongoing revert operation
      try {
        await this.runCommandThrow("git revert --abort");
        console.log("Aborted incomplete revert operation");
      } catch {
        // Ignore abort errors - there might not be an ongoing revert
      }

      throw new Error(`Revert to commit ${targetHash} failed: ${error}`);
    }
  }

  async restartDevServer() {
    if (!this.sandbox) {
      throw new Error("Cannot restart dev server: sandbox not initialized");
    }
    const session = await this.getSession();

    const devTask = await session.tasks.get("dev");
    if (!devTask) {
      throw new Error("Cannot restart dev server: task not found");
    }
    await devTask.restart();

    // wait for the dev server to restart
    const convexTask = await session.tasks.get("convex-dev");
    if (!convexTask) {
      throw new Error("Cannot restart dev server: dev server task not found");
    }

    await convexTask.restart();
  }

  async stopDevServer() {
    if (!this.sandbox) {
      throw new Error("Cannot stop dev server: sandbox not initialized");
    }
    const session = await this.getSession();
    (await session.tasks.get("dev"))?.stop();
    (await session.tasks.get("convex-dev"))?.stop();
  }

  async getPreviewUrl() {
    if (!this.sandbox) {
      throw new Error("Cannot get preview url: sandbox not initialized");
    }
    const session = await this.getSession();
    return session.hosts.getUrl(5173);
  }

  async installDependencies(): Promise<void> {
    console.log(
      `[CSBCodebase] Installing dependencies with ${this.packageManager.name}...`,
    );
    try {
      const command = this.packageManager.install();
      const result = await this.runCommand(command, 300000); // 5 minute timeout
      if (result.exitCode !== 0) {
        console.error(
          `[CSBCodebase] ${this.packageManager.name} install failed:`,
          result.output,
        );
        throw new Error(
          `${this.packageManager.name} install failed: ${result.output}`,
        );
      }
      console.log("[CSBCodebase] Dependencies installed successfully");
    } catch (error) {
      console.error("[CSBCodebase] Failed to install dependencies:", error);
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
    const result = await this.runCommandThrow("git branch --show-current");
    return result.output.trim();
  }

  async createBranch(branchName: string, fromRef?: string): Promise<void> {
    const command = fromRef
      ? `git branch ${branchName} ${fromRef}`
      : `git branch ${branchName}`;
    await this.runCommandThrow(command);
  }

  async checkoutBranch(branchName: string): Promise<void> {
    await this.runCommandThrow(`git checkout ${branchName}`);
  }

  async deleteBranch(
    branchName: string,
    force: boolean = false,
  ): Promise<void> {
    const forceFlag = force ? "-D" : "-d";
    await this.runCommandThrow(`git branch ${forceFlag} ${branchName}`);
  }

  async listBranches(): Promise<string[]> {
    const result = await this.runCommandThrow("git branch -a");
    return result.output
      .trim()
      .split("\n")
      .map((line) => line.replace(/^[\s\*]+/, "").trim())
      .filter(Boolean)
      .filter((branch) => !branch.includes("backup-")); // Filter out backup branches for performance
  }

  /**
   * Helper to safely parse git command output that should return file names.
   * Returns empty array if output contains error indicators.
   */
  private parseGitFileList(output: string): string[] {
    const trimmed = output.trim();

    // Check for common git error patterns
    if (
      !trimmed ||
      trimmed.includes("ERROR:") ||
      trimmed.includes("fatal:") ||
      trimmed.includes("error:") ||
      trimmed.startsWith("Command ERROR:")
    ) {
      return [];
    }

    return trimmed.split("\n").filter(Boolean);
  }

  async getStatus(): Promise<{
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }> {
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
   */
  private async setupGitCredentialHelper(token: string): Promise<void> {
    const credentialHelper = `'!f() { echo "username=x-access-token"; echo "password=${token}"; }; f'`;
    await this.runCommandThrow(
      `git config credential.helper ${credentialHelper}`,
    );
  }

  /**
   * Clean up git credential configuration
   */
  private async cleanupGitCredentialHelper(): Promise<void> {
    try {
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
          `git fetch --force ${repoUrl} main:refs/remotes/${remote}/main`,
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
      // Use existing remote
      const branchArg = branch || "";
      await this.runCommandThrow(`git pull ${remote} ${branchArg}`.trim());
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
      // Use existing remote
      let command = `git push ${remote}`;
      if (branch) command += ` ${branch}`;
      if (force) command += " --force";
      await this.runCommandThrow(command);
    }
  }

  async addFiles(files: string[]): Promise<void> {
    if (files.length === 0) return;
    await this.runCommandThrow(`git add ${files.join(" ")}`);
  }

  async addAll(): Promise<void> {
    await this.runCommandThrow("git add .");
  }

  async resetFiles(files: string[]): Promise<void> {
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

  // Backup operations
  async createBackupBranch(operation: string = "sync"): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupBranch = `backup-${operation}-${timestamp}`;

    console.log(`[CSBCodebase] Creating backup branch: ${backupBranch}`);

    // Get current branch
    const originalBranch = await this.getCurrentBranch();
    console.log(`[CSBCodebase] Current branch: '${originalBranch}'`);

    // Check for uncommitted work
    const status = await this.getStatus();
    const hasUncommittedWork =
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0;

    if (hasUncommittedWork) {
      console.log(
        "[CSBCodebase] Uncommitted work detected, committing WIP before creating backup branch",
      );

      // Use commitIfDirty to handle potential race conditions
      await this.commitIfDirty();

      console.log(
        `[CSBCodebase] Backup branch '${backupBranch}' will be created from current HEAD`,
      );
    }

    // Create backup branch from current HEAD
    await this.createBranch(backupBranch);

    // Ensure working directory is clean after backup creation
    await this.commitIfDirty();

    // Get the commit hash for reference
    let commitHash: string | undefined;
    try {
      commitHash = await this.getCommitHash("HEAD");
    } catch (error) {
      console.log("[CSBCodebase] Could not get commit hash:", error);
    }

    const backupInfo = {
      branchName: backupBranch,
      timestamp,
      commitHash,
      originalBranch,
      hasUncommittedWork,
    };

    console.log(
      `[CSBCodebase] Backup branch created successfully:`,
      backupInfo,
    );
    return backupInfo;
  }

  async restoreFromBackup(backupInfo: BackupInfo): Promise<void> {
    console.log(
      `[CSBCodebase] Restoring from backup branch: ${backupInfo.branchName}`,
    );

    // Switch to original branch
    await this.checkoutBranch(backupInfo.originalBranch);

    // Reset to backup state
    await this.resetHard(backupInfo.branchName);

    console.log("[CSBCodebase] Successfully restored from backup");
  }

  async cleanupOldBackups(keepCount: number = 5): Promise<void> {
    console.log(
      `[CSBCodebase] Cleaning up old local backup branches, keeping ${keepCount} recent ones`,
    );

    // Get all local backup branches sorted by creation time
    const branchListResult = await this.runCommand(
      "git for-each-ref --sort=-creatordate --format='%(refname:short)' refs/heads/backup-*",
    );

    if (branchListResult.exitCode !== 0 || !branchListResult.output?.trim()) {
      console.log("[CSBCodebase] No local backup branches found");
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
          console.log(
            `[CSBCodebase] Deleted old local backup branch: ${branch.trim()}`,
          );
        } catch (deleteError) {
          console.log(
            `[CSBCodebase] Failed to delete local backup branch ${branch}:`,
            deleteError,
          );
        }
      }

      console.log(
        `[CSBCodebase] Local cleanup complete, removed ${branchesToDelete.length} old backup branches`,
      );
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
      console.log(
        "[CSBCodebase] Performing dry-run conflict detection using git merge-tree",
      );

      // Fetch latest changes from GitHub using authenticated fetch
      console.log("[CSBCodebase] Fetching latest changes from GitHub");
      await this.fetch(remote, token, repoOwner, repoName);

      // Check what files would conflict using git diff
      console.log(
        "[CSBCodebase] Checking for conflicting files using git diff",
      );
      const diffFilesResult = await this.runCommand(
        `git --no-pager diff --name-only HEAD ${remote}/main`,
        15000,
      );

      if (diffFilesResult.exitCode !== 0 || !diffFilesResult.output.trim()) {
        console.log(
          "[CSBCodebase] No file differences detected - no conflicts possible",
        );
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

      console.log(
        `[CSBCodebase] Found ${cleanDiffFiles.split("\n").length} total changed files, ${changedFiles.length} meaningful files`,
      );

      if (changedFiles.length === 0) {
        console.log(
          "[CSBCodebase] Only build artifacts changed - proceeding with sync",
        );
        return {
          hasConflicts: false,
          errorMessage:
            "Only build artifact changes detected - safe to proceed",
        };
      }

      // Use git merge-tree to simulate merge without affecting working directory
      console.log("[CSBCodebase] Simulating merge using git merge-tree");
      const mergeSimulationResult = await this.runCommand(
        `git merge-tree $(git merge-base HEAD ${remote}/main) HEAD ${remote}/main`,
        20000,
      );

      if (mergeSimulationResult.exitCode !== 0) {
        console.log("[CSBCodebase] Merge-tree failed, assuming no conflicts");
        return { hasConflicts: false };
      }

      const mergeSimulation = mergeSimulationResult.output;

      // Check if merge-tree output contains conflict markers
      if (
        mergeSimulation.includes("<<<<<<<") ||
        mergeSimulation.includes("=======") ||
        mergeSimulation.includes(">>>>>>>")
      ) {
        console.log(
          "[CSBCodebase] Conflicts detected in merge-tree simulation",
        );

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

        console.log(
          `[CSBCodebase] Found ${meaningfulConflictedFiles.length} meaningful conflicted files from ${conflictedFiles.size} total`,
        );

        if (meaningfulConflictedFiles.length > 0) {
          return {
            hasConflicts: true,
            errorMessage: `Repository divergence detected with conflicts in ${meaningfulConflictedFiles.length} source files: ${meaningfulConflictedFiles.join(", ")}`,
          };
        } else {
          console.log(
            "[CSBCodebase] Only build artifact conflicts detected - proceeding with sync",
          );
          return {
            hasConflicts: false,
            errorMessage:
              "Only build artifact conflicts detected - safe to proceed",
          };
        }
      }

      // No conflicts detected - safe to proceed
      console.log(
        "[CSBCodebase] No conflicts detected in merge-tree simulation",
      );
      return { hasConflicts: false };
    } catch (error: any) {
      console.error("[CSBCodebase] Error during conflict detection:", error);
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

    if (totalChanges > 0) {
      console.log(
        `[CSBCodebase] Found ${totalChanges} uncommitted changes, auto-committing as WIP`,
      );
      try {
        await this.addAll();
        await this.commit("WIP: Auto-commit to ensure clean working directory");
        console.log("[CSBCodebase] Working directory is now clean");
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        // If the error is about a clean working tree, it means the tree became clean
        // between our status check and the commit attempt - this is fine
        if (
          errorMessage.includes("clean working tree") ||
          errorMessage.includes("nothing to commit")
        ) {
          console.log(
            "[CSBCodebase] Working tree became clean before commit - no action needed",
          );
        } else {
          // Re-throw actual errors
          throw error;
        }
      }
    } else {
      console.log("[CSBCodebase] Working directory is clean, safe to proceed");
    }
  }

  async abortMerge(): Promise<void> {
    try {
      console.log("[CSBCodebase] Attempting to abort any ongoing merge");
      await this.runCommand("git merge --abort", 10000);
      console.log("[CSBCodebase] Successfully aborted merge");
    } catch (error: any) {
      // Ignore errors - there might not be an ongoing merge
      const errorMessage = error?.message || String(error);
      if (
        errorMessage.includes("no merge in progress") ||
        errorMessage.includes("There is no merge to abort")
      ) {
        console.log("[CSBCodebase] No merge in progress to abort");
      } else {
        console.log(
          "[CSBCodebase] Error aborting merge (non-critical):",
          error,
        );
      }
    }
  }

  async cleanupConflictedState(): Promise<void> {
    console.log("[CSBCodebase] Cleaning up conflicted git state");

    // Step 1: Abort any ongoing merge
    await this.abortMerge();

    // Step 2: Reset to HEAD (removes all uncommitted changes)
    try {
      console.log("[CSBCodebase] Resetting to HEAD");
      await this.runCommand("git reset --hard HEAD", 10000);
      console.log("[CSBCodebase] Reset complete");
    } catch (error) {
      console.log("[CSBCodebase] Error resetting to HEAD:", error);
    }

    // Step 3: Clean untracked files and directories
    try {
      console.log("[CSBCodebase] Cleaning untracked files");
      await this.runCommand("git clean -fd", 10000);
      console.log("[CSBCodebase] Cleanup complete");
    } catch (error) {
      console.log("[CSBCodebase] Error cleaning untracked files:", error);
    }

    // Step 4: Verify we're in a clean state
    try {
      const status = await this.getStatus();
      const isClean =
        status.staged.length === 0 &&
        status.unstaged.length === 0 &&
        status.untracked.length === 0;
      console.log(
        `[CSBCodebase] Git state cleanup complete - ${isClean ? "clean" : "still has changes"}`,
      );
    } catch (error) {
      console.log("[CSBCodebase] Could not verify clean state:", error);
    }
  }

  // SandboxStatsCodebase implementation
  async getStats(): Promise<SandboxStats> {
    throw new Error("Stats not implemented for CodeSandbox");
  }
}
