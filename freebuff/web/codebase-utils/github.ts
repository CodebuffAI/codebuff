"use node";

import { App } from "octokit";
import { GITHUB_APP_CONFIG } from "./config";
import { parsePrivateKey } from "../convex/github/utils/octokit";

// Helper function to get installation Octokit instance
async function getInstallationOctokit(installationId: number) {
  const key = process.env.GITHUB_APP_PRIVATE_KEY!;

  const app = new App({
    appId: GITHUB_APP_CONFIG.APP_ID,
    privateKey: parsePrivateKey(key),
  });
  return await app.getInstallationOctokit(installationId);
}

// Get installation token
export async function getInstallationToken(installationId: number) {
  const octokit = await getInstallationOctokit(installationId);
  const result = await octokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
  });
  return result.data.token;
}

// Create repository
export async function createRepository(name: string, installationId: number) {
  const octokit = await getInstallationOctokit(installationId);
  const response = await octokit.rest.repos.createInOrg({
    org: GITHUB_APP_CONFIG.ORGANIZATION,
    name,
    description: "Programatically created repository",
    private: true,
  });
  return response.data;
}

// Delete repository
export async function deleteRepository(
  repositoryName: string,
  installationId: number,
) {
  const octokit = await getInstallationOctokit(installationId);
  await octokit.rest.repos.delete({
    owner: GITHUB_APP_CONFIG.ORGANIZATION,
    repo: repositoryName,
  });
}

// Invite user to repository
export async function inviteToRepository(
  repositoryId: string,
  username: string,
  installationId: number,
) {
  const octokit = await getInstallationOctokit(installationId);
  const response = await octokit.rest.repos.addCollaborator({
    owner: GITHUB_APP_CONFIG.ORGANIZATION,
    repo: repositoryId,
    username,
    permission: "admin",
  });
  return response.data;
}
