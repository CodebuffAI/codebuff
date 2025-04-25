import { z } from 'zod'
import { ProjectFileContextSchema } from './util/file'

// ... existing code ...

export const CLIENT_ACTIONS = {
  // ... existing actions ...
  checkNpmVersion: z.object({
    type: z.literal('check-npm-version'),
    version: z.string(),
  }),
} as const

export const CLIENT_ACTION_SCHEMA = z.union([
  // ... existing actions ...
  CLIENT_ACTIONS.checkNpmVersion,
])

// ... exisiting code ...

export const SERVER_ACTIONS = {
  // ... existing actions ...
  npmVersionStatus: z.object({
    type: z.literal('npm-version-status'),
    isUpToDate: z.boolean(),
    latestVersion: z.string(),
  }),
}

export const SERVER_ACTION_SCHEMA = z.union([
  // ... existing actions ...
  SERVER_ACTIONS.npmVersionStatus,
])

// ... rest of the existing code ...
