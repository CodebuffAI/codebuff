import type { DaytonaCodebase } from "../../../codebase-utils/codebase/DaytonaCodebase";
import { getInstallationToken } from "../../../codebase-utils/github";
import { escapeShellArg } from "./shellEscape";

/**
 * Rewrite the sandbox `origin` remote with a freshly-minted GitHub App
 * installation token so agent-run git (fetch/pull/push) works on
 * `connected_repo` projects.
 *
 * The token embedded in `origin` at clone time expires ~1 hour later, which is
 * why the platform Git controls re-mint it before every network op (see
 * `cloud/git.ts#refreshOriginAuth`). When we let the cloud agent run git
 * directly we must do the same up front, otherwise a long-lived sandbox hits
 * "Invalid username or token" on the agent's first push/pull. A single refresh
 * at run start covers the whole turn (well under the token lifetime).
 *
 * Best-effort: local git (branch/commit/reset/clean) works regardless, so a
 * mint/set-url failure is logged, not fatal.
 */
export async function refreshConnectedRepoOrigin(
  codebase: DaytonaCodebase,
  project:
    | {
        repo_full_name?: string | null;
        github_installation_id?: number | null;
      }
    | null
    | undefined,
): Promise<void> {
  if (!project?.repo_full_name || !project.github_installation_id) return;

  let token: string;
  try {
    token = await getInstallationToken(project.github_installation_id);
  } catch (error) {
    console.error(
      "[cli_agent] failed to mint installation token for agent git",
      error,
    );
    return;
  }

  const remoteUrl = `https://x-access-token:${token}@github.com/${project.repo_full_name}.git`;
  try {
    await codebase.runCommand(
      `git remote set-url origin ${escapeShellArg(remoteUrl)}`,
      30_000,
    );
  } catch (error) {
    console.error(
      "[cli_agent] failed to set origin remote for agent git",
      error,
    );
  }
}
