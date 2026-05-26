import { toast } from 'sonner'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

/**
 * Result type returned by the createProject mutation
 */
type ProjectCreationResult =
  | { success: true; semanticIdentifier: string }
  | {
      success: false
      error: {
        kind: string
        message?: string
        retryAfter?: number
      }
    }

/**
 * Format milliseconds into a human-readable time string
 */
function formatRetryTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`
  }
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`
}

/**
 * Reusable handler for project creation mutation results
 * Handles all error cases (DEPLOYMENTS_PAUSED, RateLimited, etc.) and navigation
 *
 * @param result - The result from the createProject mutation
 * @param router - Next.js router instance for navigation
 * @param onSuccess - Optional callback to run on successful project creation (e.g., clear form, show toast)
 * @param onProjectLimit - Optional callback to run when project limit is reached (e.g., show paywall)
 * @returns true if successful, false if there was an error
 */
export function handleProjectCreationResult(
  result: ProjectCreationResult,
  router: AppRouterInstance,
  onSuccess?: () => void,
  onProjectLimit?: () => void,
): boolean {
  // Handle error cases
  if (!result.success) {
    const { error } = result

    // Special handling for rate limit errors
    if (error.kind === 'RateLimited') {
      const timeString = formatRetryTime(error.retryAfter || 0)
      toast.error(
        `Rate limit exceeded. Please wait ${timeString} before creating a project.`,
        { duration: 5000 },
      )
      return false
    }

    // Special handling for paused deployments
    if (error.kind === 'DEPLOYMENTS_PAUSED') {
      toast.error(
        error.message ||
          'Your Convex deployments are paused. Please add more Convex credits to continue.',
        { duration: 6000 },
      )
      return false
    }

    // Special handling for project limit errors
    if (
      error.kind === 'PROJECT_LIMIT' ||
      error.message?.toLowerCase().includes('project limit') ||
      error.message?.toLowerCase().includes('max projects')
    ) {
      void onProjectLimit
      toast.error(error.message || 'Unable to create project right now.', {
        duration: 6000,
      })
      return false
    }

    // Generic error handling
    toast.error(error.message || 'Failed to create project. Please try again.')
    return false
  }

  // Success case - run optional callback and navigate
  onSuccess?.()
  router.push(`/web/project/${result.semanticIdentifier}`)
  return true
}
