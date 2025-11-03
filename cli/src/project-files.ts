import { mkdirSync } from 'fs'
import path from 'path'

import { findGitRoot } from './utils/git'
import { getConfigDir } from './utils/auth'

let projectRoot: string | undefined
let currentChatId: string | undefined

function ensureChatDirectory(dir: string) {
  mkdirSync(dir, { recursive: true })
}

export function setProjectRoot(dir: string) {
  projectRoot = dir
  return projectRoot
}

export function getProjectRoot() {
  if (!projectRoot) {
    projectRoot = findGitRoot()
  }
  return projectRoot
}

export function getCurrentChatId() {
  if (!currentChatId) {
    currentChatId = new Date().toISOString().replace(/:/g, '-')
  }
  return currentChatId
}

export function startNewChat() {
  currentChatId = new Date().toISOString().replace(/:/g, '-')
  return currentChatId
}

// Get the project-specific data directory
export function getProjectDataDir(): string {
  const root = getProjectRoot()
  if (!root) {
    throw new Error('Project root not set')
  }

  const baseName = path.basename(root)
  const baseDir = path.join(getConfigDir(), 'projects', baseName)

  return baseDir
}

export function getCurrentChatDir() {
  const chatId = getCurrentChatId()
  const dir = path.join(getProjectDataDir(), 'chats', chatId)
  ensureChatDirectory(dir)
  return dir
}
