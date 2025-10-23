import { mkdirSync } from 'fs'
import path from 'path'

import { findGitRoot } from './utils/git'

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

export function getCurrentChatDir() {
  const root = getProjectRoot() || process.cwd()
  const chatId = getCurrentChatId()
  const dir = path.join(root, 'debug', 'chats', chatId)
  ensureChatDirectory(dir)
  return dir
}
