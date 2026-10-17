/** Stable product messages, also used when Desktop imports Cloud history. */
export const CLOUD_RESOURCE_MESSAGE =
  'Your cloud environment has reached its resource limit. Open this chat in the Desktop app to continue locally.'
export const CLOUD_RESOURCE_PENDING =
  'Your cloud environment has reached its resource limit. Your files are being saved for recovery. Open this chat in the Desktop app to continue locally.'
export const CLOUD_RESOURCE_MOVE_REASON =
  'The cloud environment is running low on resources. Continue the same task locally, preserving completed work and checking any interrupted command before retrying it.'
export const CLOUD_RESOURCE_EVENT = 'resource_limit'
export type CloudResourceKind =
  | 'disk'
  | 'memory'
  | 'cpu'
  | 'processes'
  | 'files'
  | 'time'
export const isCloudResourceMessage = (message: string | null | undefined) =>
  message === CLOUD_RESOURCE_MESSAGE || message === CLOUD_RESOURCE_PENDING
