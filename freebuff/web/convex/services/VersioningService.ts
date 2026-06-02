"use node";

import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";

/**
 * VersioningService - Encapsulates all checkpoint and revert logic
 *
 * This service provides a clean interface for version control operations,
 * hiding the complexity of git operations, message management, and error handling.
 */
export class VersioningService {
  constructor(private ctx: ActionCtx) {}

  /**
   * Create a checkpoint for the current state
   */
  async createCheckpoint(
    projectId: Id<"project">,
    message: string,
    messageId?: Id<"messages">,
  ): Promise<{ success: boolean; checkpointId?: string; error?: string }> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        // Check if project is busy (being reverted)
        const project = await this.ctx.runQuery(internal.project.getProject, {
          projectId,
        });

        if (!project) {
          return { success: false, error: "Project not found" };
        }

        // If project is being reverted, wait and retry
        if (project.state === "processing" && retryCount < maxRetries) {
          console.log(
            `[VersioningService] Project is processing, retry ${retryCount + 1}/${maxRetries}`,
          );
          await this.delay(2000);
          retryCount++;
          continue;
        }

        // Create the commit
        const commitResult: any = await this.ctx.runAction(
          internal.codesandbox.versionControl.commit,
          { projectId, message, messageId },
        );

        if (!commitResult) {
          if (retryCount < maxRetries) {
            await this.delay(1000);
            retryCount++;
            continue;
          }
          return {
            success: false,
            error: "Failed to create commit after multiple attempts",
          };
        }

        if (commitResult.hash === "no-changes") {
          // No file changes to commit \u2014 not an error, just a no-op.
          // First-message agent runs hit this before any tool has touched files.
          return {
            success: true,
            checkpointId: undefined,
          };
        }

        return {
          success: true,
          checkpointId: commitResult.hash,
        };
      } catch (error) {
        console.error(`[VersioningService] Error creating checkpoint:`, error);

        // Retry on transient errors
        if (retryCount < maxRetries && this.isTransientError(error)) {
          console.log(
            `[VersioningService] Transient error, retry ${retryCount + 1}/${maxRetries}`,
          );
          await this.delay(2000);
          retryCount++;
          continue;
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return {
      success: false,
      error: "Failed to create checkpoint after maximum retries",
    };
  }

  /**
   * Revert to a specific checkpoint
   */
  async revertToCheckpoint(
    projectId: Id<"project">,
    semanticIdentifier: string,
    commitHash: string,
    source?: "chat" | "versions_page",
  ): Promise<void> {
    // Validate the checkpoint
    this.validateCheckpointId(commitHash);

    // Validate that the commit exists
    await this.validateCommitExists(semanticIdentifier, commitHash);

    // Terminate any active processing (cancels agent if running)
    await this.ctx.runMutation(internal.project.setStateTerminated, {
      projectId,
    });

    // Save work in progress
    await this.saveWorkInProgress(projectId);

    // Set project to processing state
    await this.ctx.runMutation(internal.project.setStateProcessing, {
      projectId,
    });

    try {
      // Terminate any active processing (cancels agent if running)
      await this.ctx.runMutation(internal.project.setStateTerminated, {
        projectId,
      });

      // Find the thread for message deactivation
      const { threadId, messageFound } = await this.findThreadForCommit(
        projectId,
        commitHash,
      );

      if (!threadId) {
        console.warn(
          `No chat history found for checkpoint ${commitHash}. Proceeding with revert without message deactivation.`,
        );
      }

      // Deactivate messages after this commit
      if (threadId && messageFound) {
        await this.ctx.runMutation(
          internal.messages.deactivateMessagesAfterCommit,
          { threadId, commitHash },
        );
      }

      // Track external changes if from versions page
      if (threadId && source === "versions_page") {
        await this.ctx.runMutation(internal.thread.markExternalChange, {
          threadId,
        });
      }

      // Perform the actual revert
      const project = await this.ctx.runQuery(internal.project.getProject, {
        projectId,
      });

      if (!project) {
        throw new Error("Project not found during revert");
      }

      const revertResult = await this.ctx.runAction(
        internal.codesandbox.versionControl.revertToCommit,
        {
          semanticIdentifier: project.semantic_identifier,
          commitHash,
        },
      );

      if (!revertResult.success) {
        throw new Error(this.formatRevertError(revertResult.message));
      }

      console.log(`Checkpoint restored successfully: ${revertResult.message}`);

      // Sync to GitHub if needed
      if (revertResult.newCommitHash) {
        await this.ctx.runAction(
          internal.codesandbox.versionControl.syncCommitToGitHub,
          {
            projectId,
            commitHash: revertResult.newCommitHash,
          },
        );
      }
    } finally {
      // Always mark project as done
      await this.ctx.runMutation(internal.project.setStateDone, {
        projectId,
      });
    }
  }

  /**
   * Get all checkpoints for a project
   */
  async getCheckpoints(projectId: Id<"project">): Promise<any[]> {
    try {
      const project = await this.ctx.runQuery(internal.project.getProject, {
        projectId,
      });

      if (!project) {
        return [];
      }

      return await this.ctx.runAction(
        api.codesandbox.versionControl.getCommits,
        {
          semanticIdentifier: project.semantic_identifier,
        },
      );
    } catch (error) {
      console.error("Failed to list checkpoints:", error);
      return [];
    }
  }

  // ============= Private Helper Methods =============

  private validateCheckpointId(commitHash: string): void {
    if (
      !commitHash ||
      commitHash === "creating" ||
      commitHash === "failed" ||
      commitHash.trim() === ""
    ) {
      throw new Error(
        "Cannot revert: The checkpoint is not ready yet. Please wait a moment and try again.",
      );
    }
  }

  private async validateCommitExists(
    semanticIdentifier: string,
    commitHash: string,
  ): Promise<void> {
    try {
      const commits = await this.ctx.runAction(
        api.codesandbox.versionControl.getCommits,
        { semanticIdentifier },
      );

      const commitExists = commits.some((c: any) => c.hash === commitHash);
      if (!commitExists) {
        throw new Error(
          `Cannot revert: The checkpoint ${commitHash.substring(0, 7)} was not found. It may have been removed or corrupted.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot revert")) {
        throw error;
      }
      console.error("Failed to validate commit existence:", error);
      // Continue anyway - the git revert will fail if commit doesn't exist
    }
  }

  private async saveWorkInProgress(projectId: Id<"project">): Promise<void> {
    try {
      const wipCommitResult = await this.ctx.runAction(
        internal.codesandbox.versionControl.commit,
        {
          projectId,
          message: "Work in progress - saved before revert",
        },
      );

      if (
        wipCommitResult &&
        wipCommitResult.hash &&
        wipCommitResult.hash !== "no-changes"
      ) {
        console.log(
          `Committed WIP changes before revert: ${wipCommitResult.hash}`,
        );
      }
    } catch (error) {
      console.log("No WIP changes to commit before revert:", error);
      // Continue with revert even if no changes to commit
    }
  }

  private async findThreadForCommit(
    projectId: Id<"project">,
    commitHash: string,
  ): Promise<{ threadId: Id<"thread"> | null; messageFound: boolean }> {
    // Use getAllForProject to include deactivated messages in the search
    const messages = await this.ctx.runQuery(
      internal.messages.getAllForProject,
      {
        projectId,
      },
    );

    const messageWithCommitHash = messages.find(
      (m: any) => m.commit_hash === commitHash,
    );

    if (messageWithCommitHash?.thread_id) {
      return {
        threadId: messageWithCommitHash.thread_id as Id<"thread">,
        messageFound: true,
      };
    }

    // Fall back to active thread if no message found
    const projectData = await this.ctx.runQuery(internal.project.getProject, {
      projectId,
    });

    if (projectData?.active_thread) {
      console.log(
        `Using active thread ${projectData.active_thread} for commit ${commitHash} (no associated message)`,
      );
      return {
        threadId: projectData.active_thread as Id<"thread">,
        messageFound: false,
      };
    }

    return { threadId: null, messageFound: false };
  }

  private formatRevertError(errorMessage?: string): string {
    const message = errorMessage || "Unknown error";

    if (message.includes("conflicts")) {
      return "Cannot revert due to merge conflicts. Please resolve conflicts manually or try reverting to a different checkpoint.";
    }
    if (message.includes("not found") || message.includes("bad revision")) {
      return "The checkpoint could not be found. It may have been corrupted or removed.";
    }
    if (message.includes("permission") || message.includes("access")) {
      return "You don't have permission to revert this project. Please check your access rights.";
    }
    if (message.includes("timeout")) {
      return "The revert operation timed out. Please try again in a moment.";
    }
    if (message.includes("network") || message.includes("connection")) {
      return "Network error during revert. Please check your connection and try again.";
    }

    // Clean up technical jargon
    return (
      message
        .replace(/fatal:\s*/gi, "")
        .replace(/error:\s*/gi, "")
        .replace(/git\s+/gi, "")
        .trim() || "Failed to revert to checkpoint. Please try again."
    );
  }

  private isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("session") ||
      message.includes("connect")
    );
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
