import { createHash } from 'crypto'
import { mkdirSync, readdirSync, realpathSync, statSync } from 'fs'
import path from 'path'

import { setProjectRootResolver } from '@codebuff/common/util/plan-artifacts'

import { getConfigDir } from './utils/auth'

let projectRoot: string | undefined
let currentChatId: string | undefined

function ensureChatDirectory(dir: string) {
  mkdirSync(dir, { recursive: true })
}

export function setProjectRoot(dir: string) {
  projectRoot = dir
  // Wire the durable plan-artifact module's project-root resolver once at the
  // CLI bootstrap so per-call helpers (listPlanSessions, readPlanSessionState,
  // getActivePlanSessionSlug, the runtime update_plan_status handler, etc.)
  // don't have to re-wire it ad hoc.
  setProjectRootResolver(() => projectRoot as string)
  return projectRoot
}

export function getProjectRoot() {
  if (!projectRoot) {
    throw new Error('Project root not set')
  }
  return projectRoot
}

export function getCurrentChatId() {
  if (!currentChatId) {
    currentChatId = new Date().toISOString().replace(/:/g, '-')
  }
  return currentChatId
}

export function setCurrentChatId(chatId: string) {
  currentChatId = chatId
  return currentChatId
}

export function startNewChat() {
  currentChatId = new Date().toISOString().replace(/:/g, '-')
  return currentChatId
}

export function getProjectStorageKey(root: string): string {
  let canonicalRoot = path.resolve(root)
  try {
    canonicalRoot = realpathSync.native(canonicalRoot)
  } catch {
    // The root may disappear between selection and persistence. The resolved
    // absolute path is still stable enough to keep it isolated from peers.
  }

  if (process.platform === 'win32') {
    canonicalRoot = canonicalRoot.toLowerCase()
  }

  const readableName =
    path.basename(canonicalRoot).replace(/[^a-zA-Z0-9._-]/g, '_') || 'project'
  const rootHash = createHash('sha256')
    .update(canonicalRoot)
    .digest('hex')
    .slice(0, 12)
  return `${readableName}-${rootHash}`
}

// Get the project-specific data directory
export function getProjectDataDir(): string {
  const root = getProjectRoot()
  if (!root) {
    throw new Error('Project root not set')
  }

  const baseDir = path.join(
    getConfigDir(),
    'projects',
    getProjectStorageKey(root),
  )

  return baseDir
}

/**
 * Find the most recent chat directory based on modification time
 * Returns null if no chat directories exist
 */
export function getMostRecentChatDir(): string | null {
  try {
    const chatsDir = path.join(getProjectDataDir(), 'chats')
    if (!statSync(chatsDir, { throwIfNoEntry: false })) {
      return null
    }

    const chatDirs = readdirSync(chatsDir)
      .map((name) => {
        const fullPath = path.join(chatsDir, name)
        try {
          const stat = statSync(fullPath)
          return { name, fullPath, mtime: stat.mtime }
        } catch {
          return null
        }
      })
      .filter(
        (item): item is { name: string; fullPath: string; mtime: Date } =>
          item !== null && statSync(item.fullPath).isDirectory(),
      )

    if (chatDirs.length === 0) {
      return null
    }

    // Sort by modification time, most recent first
    chatDirs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    return chatDirs[0].fullPath
  } catch {
    return null
  }
}

export function getCurrentChatDir(): string {
  const chatId = getCurrentChatId()
  const dir = path.join(getProjectDataDir(), 'chats', chatId)
  ensureChatDirectory(dir)
  return dir
}
