import { AsyncLocalStorage } from 'async_hooks'

export interface RequestContextData {
  // The user ID for whom this context is established
  currentUserId?: string

  // The specific organization ID under which the repoUrl was approved for the currentUserId
  approvedOrgIdForRepo?: string

  // The repository URL that was processed for approval
  processedRepoUrl?: string

  // The owner of the repository, parsed from processedRepoUrl
  processedRepoOwner?: string

  // The base name of the repository, parsed from processedRepoUrl
  processedRepoName?: string

  // The full repository identifier in "owner/repo" format
  processedRepoId?: string

  // Flag indicating if the processedRepoUrl is approved for the currentUserId within the approvedOrgIdForRepo
  isRepoApprovedForUserInOrg?: boolean
}

export const requestDataStore = new AsyncLocalStorage<RequestContextData>()

/**
 * Helper function to run a callback with a new request context.
 * This is useful at the beginning of processing a new request/action.
 */
export function withRequestContext<T>(
  initialData: RequestContextData,
  callback: () => T
): T {
  return requestDataStore.run(initialData, callback)
}

/**
 * Helper function to update the current request context.
 * This can be used by middlewares to add or modify data.
 */
export function updateRequestContext(
  updates: Partial<RequestContextData>
): void {
  const store = requestDataStore.getStore()
  if (store) {
    requestDataStore.enterWith({ ...store, ...updates })
  }
}

/**
 * Helper function to get the current request context.
 */
export function getRequestContext(): RequestContextData | undefined {
  return requestDataStore.getStore()
}
