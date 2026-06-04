/**
 * Octokit utility functions
 */

/**
 * Parse private key from one-line format to proper PEM format
 * basically handles both literal \n characters and space-separated formats
 */
export function parsePrivateKey(privateKey: string): string {
  if (privateKey.includes("\n")) {
    return privateKey;
  }

  if (privateKey.includes("\\n")) {
    return privateKey.replace(/\\n/g, "\n");
  }

  // handle space-separated format (common in environment variables) -- regex match
  const keyPattern =
    /(-----BEGIN[^-]+-----)\s+([A-Za-z0-9+/=\s]+)\s+(-----END[^-]+-----)/;
  const match = privateKey.match(keyPattern);

  if (match) {
    const header = match[1];
    const keyContent = match[2].replace(/\s+/g, ""); // remove all spaces from key content
    const footer = match[3];

    const formattedKeyContent =
      keyContent.match(/.{1,64}/g)?.join("\n") || keyContent;

    return `${header}\n${formattedKeyContent}\n${footer}`;
  }

  // if no pattern matches, return as-is (will likely fail, but preserves original)
  return privateKey;
}

/**
 * Create a GitHub deployment for a repository
 */
export async function createGitHubDeployment(
  octokit: any,
  repoOwner: string,
  repoName: string,
  ref: string,
  environment: string,
  description: string,
  autoMerge: boolean = false,
  targetUrl?: string, // Add targetUrl parameter
): Promise<{ id: number; url: string }> {
  try {
    console.log(
      `[DEBUG] Creating GitHub deployment for ${repoOwner}/${repoName} on ${ref}`,
    );

    const deploymentParams: any = {
      owner: repoOwner,
      repo: repoName,
      ref: ref,
      environment: environment,
      description: description,
      auto_merge: autoMerge,
      required_contexts: [], // No required status checks
      // Add additional parameters to help with deployment status
      transient_environment: false, // Make production environments persistent
      production_environment: environment === "production", // Mark as production
      // Add parameters to make deployment more visible
      task: `deploy-${environment}`, // Add a task identifier
      payload: {
        // Add custom payload for better visibility
        deployment_type: "production",
        service: "vly.ai",
        environment: environment,
      },
    };

    // Add target_url if provided - this is crucial for making deployments visible
    if (targetUrl) {
      deploymentParams.target_url = targetUrl;
    }

    // Add environment_url for better visibility (this is what Vercel uses)
    if (targetUrl) {
      deploymentParams.environment_url = targetUrl;
    }

    console.log(`[DEBUG] GitHub deployment params:`, deploymentParams);

    const response =
      await octokit.rest.repos.createDeployment(deploymentParams);

    const deployment = response.data;
    console.log(`[DEBUG] GitHub deployment created with ID: ${deployment.id}`);
    console.log(`[DEBUG] GitHub deployment response:`, deployment);

    // Immediately create a deployment status to make it more visible
    if (targetUrl) {
      try {
        await octokit.rest.repos.createDeploymentStatus({
          owner: repoOwner,
          repo: repoName,
          deployment_id: deployment.id,
          state: "pending",
          target_url: targetUrl,
          description: "Deployment in progress...",
        });
        console.log(
          `[DEBUG] Created initial deployment status for deployment ${deployment.id}`,
        );
      } catch (statusError) {
        console.error(
          `[DEBUG] Failed to create initial deployment status:`,
          statusError,
        );
        // Don't fail the deployment creation if status creation fails
      }
    }

    return {
      id: deployment.id,
      url: deployment.url,
    };
  } catch (error) {
    console.error("[DEBUG] Failed to create GitHub deployment:", error);
    throw new Error(`Failed to create GitHub deployment: ${error}`);
  }
}

/**
 * Update GitHub deployment status
 */
export async function updateGitHubDeploymentStatus(
  octokit: any,
  repoOwner: string,
  repoName: string,
  deploymentId: number,
  state: "pending" | "success" | "failure" | "error" | "inactive",
  targetUrl?: string,
  description?: string,
): Promise<void> {
  try {
    console.log(
      `[DEBUG] Updating GitHub deployment ${deploymentId} status to ${state}`,
    );

    const statusParams = {
      owner: repoOwner,
      repo: repoName,
      deployment_id: deploymentId,
      state: state,
      target_url: targetUrl,
      description: description,
    };

    console.log(`[DEBUG] GitHub deployment status params:`, statusParams);

    await octokit.rest.repos.createDeploymentStatus(statusParams);

    console.log(
      `[DEBUG] GitHub deployment ${deploymentId} status updated to ${state}`,
    );
  } catch (error) {
    console.error("[DEBUG] Failed to update GitHub deployment status:", error);
    throw new Error(`Failed to update GitHub deployment status: ${error}`);
  }
}

/**
 * Get GitHub deployment by ID
 */
export async function getGitHubDeployment(
  octokit: any,
  repoOwner: string,
  repoName: string,
  deploymentId: number,
): Promise<any> {
  try {
    const response = await octokit.rest.repos.getDeployment({
      owner: repoOwner,
      repo: repoName,
      deployment_id: deploymentId,
    });

    return response.data;
  } catch (error) {
    console.error("Failed to get GitHub deployment:", error);
    throw new Error(`Failed to get GitHub deployment: ${error}`);
  }
}

/**
 * List GitHub deployments for a repository
 */
export async function listGitHubDeployments(
  octokit: any,
  repoOwner: string,
  repoName: string,
  environment?: string,
): Promise<any[]> {
  try {
    const params: any = {
      owner: repoOwner,
      repo: repoName,
      per_page: 100,
    };

    if (environment) {
      params.environment = environment;
    }

    const response = await octokit.rest.repos.listDeployments(params);
    return response.data;
  } catch (error) {
    console.error("Failed to list GitHub deployments:", error);
    throw new Error(`Failed to list GitHub deployments: ${error}`);
  }
}

/**
 * Update repository homepage URL to point to production deployment
 */
export async function updateRepositoryHomepage(
  octokit: any,
  repoOwner: string,
  repoName: string,
  productionUrl: string,
): Promise<void> {
  try {
    console.log(
      `[DEBUG] Updating repository ${repoOwner}/${repoName} homepage to ${productionUrl}`,
    );

    // Get current repository details
    const currentRepo = await octokit.rest.repos.get({
      owner: repoOwner,
      repo: repoName,
    });

    // Update repository with new homepage URL
    await octokit.rest.repos.update({
      owner: repoOwner,
      repo: repoName,
      homepage: productionUrl,
      // Preserve other repository settings
      name: currentRepo.data.name,
      description: currentRepo.data.description,
      private: currentRepo.data.private,
      has_issues: currentRepo.data.has_issues,
      has_projects: currentRepo.data.has_projects,
      has_wiki: currentRepo.data.has_wiki,
      default_branch: currentRepo.data.default_branch,
      allow_squash_merge: currentRepo.data.allow_squash_merge,
      allow_merge_commit: currentRepo.data.allow_merge_commit,
      allow_rebase_merge: currentRepo.data.allow_rebase_merge,
      delete_branch_on_merge: currentRepo.data.delete_branch_on_merge,
    });

    console.log(
      `[DEBUG] Repository ${repoOwner}/${repoName} homepage updated to ${productionUrl}`,
    );
  } catch (error) {
    console.error("[DEBUG] Failed to update repository homepage:", error);
    throw new Error(`Failed to update repository homepage: ${error}`);
  }
}
