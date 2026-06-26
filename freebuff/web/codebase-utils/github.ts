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

/**
 * Open a pull request from `head` into `base` on a connected repo. If a PR for
 * the same head->base already exists, returns that one instead of erroring, so
 * the "Create PR" button is idempotent. `repoFullName` is "owner/name".
 */
export async function createPullRequest(params: {
  installationId: number;
  repoFullName: string;
  head: string;
  base: string;
  title: string;
  body?: string;
}): Promise<{ url: string; number: number; existing: boolean }> {
  const [owner, repo] = params.repoFullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo "${params.repoFullName}"`);
  }
  const octokit = await getInstallationOctokit(params.installationId);

  // An existing open PR for this head->base makes pulls.create 422; check first
  // so we return the existing PR rather than failing.
  const existing = await octokit.rest.pulls.list({
    owner,
    repo,
    head: `${owner}:${params.head}`,
    base: params.base,
    state: "open",
  });
  if (existing.data.length > 0) {
    const pr = existing.data[0];
    return { url: pr.html_url, number: pr.number, existing: true };
  }

  const created = await octokit.rest.pulls.create({
    owner,
    repo,
    head: params.head,
    base: params.base,
    title: params.title,
    body: params.body,
  });
  return { url: created.data.html_url, number: created.data.number, existing: false };
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
