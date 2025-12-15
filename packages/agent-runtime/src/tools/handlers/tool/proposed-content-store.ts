/**
 * Store for proposed file content by runId.
 * This allows propose_str_replace and propose_write_file tools to
 * track proposed changes within an agent run, isolated by runId.
 */

/** Map of runId -> path -> Promise<content | null> */
const proposedContentByRunId = new Map<
  string,
  Record<string, Promise<string | null>>
>()

/**
 * Get the proposed content map for a specific runId.
 * Creates an empty record if none exists.
 */
export function getProposedContentForRun(
  runId: string,
): Record<string, Promise<string | null>> {
  let contentByPath = proposedContentByRunId.get(runId)
  if (!contentByPath) {
    contentByPath = {}
    proposedContentByRunId.set(runId, contentByPath)
  }
  return contentByPath
}

/**
 * Get proposed content for a specific file in a run.
 */
export function getProposedContent(
  runId: string,
  path: string,
): Promise<string | null> | undefined {
  const contentByPath = proposedContentByRunId.get(runId)
  return contentByPath?.[path]
}

/**
 * Set proposed content for a specific file in a run.
 */
export function setProposedContent(
  runId: string,
  path: string,
  content: Promise<string | null>,
): void {
  const contentByPath = getProposedContentForRun(runId)
  contentByPath[path] = content
}

/**
 * Clear all proposed content for a specific runId.
 * Should be called when an agent run completes.
 */
export function clearProposedContentForRun(runId: string): void {
  proposedContentByRunId.delete(runId)
}

/**
 * Clear all proposed content (for testing purposes).
 */
export function clearAllProposedContent(): void {
  proposedContentByRunId.clear()
}
