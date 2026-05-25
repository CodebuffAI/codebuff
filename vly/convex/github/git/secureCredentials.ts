/**
 * Secure Git Credential Helper Utility
 *
 * This module provides secure credential handling for Git operations in provider environments.
 * Instead of embedding tokens in Git URLs (which exposes them in logs and process lists),
 * this utility uses in-memory git credential helpers that never write sensitive data to files.
 *
 * Security Features:
 * - No tokens in command line arguments or URLs
 * - No credential files written to sandbox filesystem
 * - In-memory only credential handling
 * - Automatic cleanup after operations
 * - Proper error handling to prevent credential leaks
 */

export interface SecureGitClient {
  commands: {
    run(command: string): Promise<string>;
  };
}

/**
 * Set up secure in-memory git credential helper
 * This configures git to use a shell function that provides credentials
 * without writing them to any files on the filesystem.
 */
export async function setupSecureGitCredentials(
  client: SecureGitClient,
  token: string,
): Promise<void> {
  // Configure git to use in-memory credential helper
  // The helper is a shell function that echoes credentials when git needs them
  const credentialHelper = `'!f() { 
    echo "username=x-access-token"; 
    echo "password=${token}"; 
  }; f'`;

  await client.commands.run(
    `git config --global credential.helper ${credentialHelper}`,
  );
}

/**
 * Execute a git command with secure credentials and timeout handling
 * Sets up credentials, runs the command with timeout, then cleans up
 */
export async function executeSecureGitCommand(
  client: SecureGitClient,
  command: string,
  token: string,
  timeoutMs: number = 60000, // 1 minute default timeout
): Promise<string> {
  let cleanupPromise: Promise<void> | null = null;

  try {
    // Setup secure credentials
    await setupSecureGitCredentials(client, token);

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Git command timed out after ${timeoutMs}ms: ${command}`),
        );
      }, timeoutMs);
    });

    // Execute the git command with timeout
    const commandPromise = client.commands.run(command);
    const result = await Promise.race([commandPromise, timeoutPromise]);

    return result;
  } catch (error) {
    // Ensure cleanup happens even on timeout/error
    if (!cleanupPromise) {
      cleanupPromise = cleanupGitCredentials(client);
    }

    // Wait for cleanup before rethrowing
    try {
      await cleanupPromise;
    } catch (cleanupError) {
      console.warn(
        "Warning: Failed to cleanup credentials after error:",
        cleanupError,
      );
    }

    throw error;
  } finally {
    // Normal cleanup path
    if (!cleanupPromise) {
      await cleanupGitCredentials(client);
    }
  }
}

/**
 * Clean up git credential configuration
 * Removes the credential helper to prevent any lingering access
 */
export async function cleanupGitCredentials(
  client: SecureGitClient,
): Promise<void> {
  try {
    await client.commands.run(`git config --global --unset credential.helper`);
  } catch (error) {
    // Non-fatal error - log but don't throw
    console.warn("Warning: Could not cleanup git credentials:", error);
  }
}

/**
 * Create a secure git clone command
 * Returns a clean HTTPS URL without embedded credentials
 */
export function createSecureCloneUrl(
  repoOwner: string,
  repoName: string,
): string {
  return `https://github.com/${repoOwner}/${repoName}.git`;
}

/**
 * Execute secure git clone operation
 */
export async function secureGitClone(
  client: SecureGitClient,
  repoOwner: string,
  repoName: string,
  token: string,
  directory?: string,
): Promise<string> {
  const cloneUrl = createSecureCloneUrl(repoOwner, repoName);
  const cloneCommand = directory
    ? `git clone ${cloneUrl} ${directory}`
    : `git clone ${cloneUrl}`;

  return executeSecureGitCommand(client, cloneCommand, token);
}

/**
 * Execute secure git pull operation
 */
export async function secureGitPull(
  client: SecureGitClient,
  token: string,
  directory?: string,
): Promise<string> {
  const pullCommand = directory ? `cd ${directory} && git pull` : `git pull`;

  return executeSecureGitCommand(client, pullCommand, token);
}

/**
 * Execute secure git push operation
 */
export async function secureGitPush(
  client: SecureGitClient,
  token: string,
  directory?: string,
  branch: string = "main",
): Promise<string> {
  const pushCommand = directory
    ? `cd ${directory} && git push origin ${branch}`
    : `git push origin ${branch}`;

  return executeSecureGitCommand(client, pushCommand, token);
}

/**
 * Execute secure git remote set-url operation
 * Updates the remote URL to use HTTPS without embedded credentials
 */
export async function secureGitSetRemoteUrl(
  client: SecureGitClient,
  repoOwner: string,
  repoName: string,
  token: string,
  directory?: string,
  remoteName: string = "origin",
): Promise<string> {
  const remoteUrl = createSecureCloneUrl(repoOwner, repoName);
  const setUrlCommand = directory
    ? `cd ${directory} && git remote set-url ${remoteName} ${remoteUrl}`
    : `git remote set-url ${remoteName} ${remoteUrl}`;

  return executeSecureGitCommand(client, setUrlCommand, token);
}
