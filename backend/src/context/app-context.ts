import { AsyncLocalStorage } from 'async_hooks'

export interface LoggerContext {
  userId?: string
  userEmail?: string
  clientSessionId?: string
  fingerprintId?: string
  clientRequestId?: string
  messageId?: string
  discordId?: string
  costMode?: string
  [key: string]: any // Allow for future extensions
}

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

export interface AppContext {
  logger: LoggerContext
  request: RequestContextData
}

export const appContextStore = new AsyncLocalStorage<AppContext>()

/**
 * Helper function to run a callback with a new app context.
 * This establishes both logger and request contexts in a single call.
 */
export function withAppContext<T>(
  loggerData: Partial<LoggerContext>,
  requestData: RequestContextData,
  callback: () => T
): T {
  const existingContext = appContextStore.getStore()
  return appContextStore.run({
    logger: { ...existingContext?.logger, ...loggerData },
    request: { ...existingContext?.request, ...requestData }
  }, callback)
}

/**
 * Helper function to update the current app context.
 */
export function updateAppContext(updates: {
  logger?: Partial<LoggerContext>
  request?: Partial<RequestContextData>
}): void {
  const store = appContextStore.getStore()
  if (store) {
    if (updates.logger) {
      Object.assign(store.logger, updates.logger)
    }
    if (updates.request) {
      Object.assign(store.request, updates.request)
    }
  }
}

/**
 * Helper function to get the current app context.
 */
export function getAppContext(): AppContext | undefined {
  return appContextStore.getStore()
}

/**
 * Helper function to get just the logger context.
 */
export function getLoggerContext(): LoggerContext | undefined {
  return appContextStore.getStore()?.logger
}

/**
 * Helper function to get just the request context.
 */
export function getRequestContext(): RequestContextData | undefined {
  return appContextStore.getStore()?.request
}

/**
 * Helper function to update just the request context.
 */
export function updateRequestContext(updates: Partial<RequestContextData>): void {
  updateAppContext({ request: updates })
}
