/**
 * Session Loader - Parses tmux session data from YAML files
 */

import { promises as fs } from 'fs'
import path from 'path'

import yaml from 'js-yaml'

import type {
  SessionInfo,
  Command,
  Capture,
  CaptureFrontMatter,
  SessionData,
  TimelineEntry,
  SessionJSON,
} from './types'

const DEFAULT_SESSION_DIR = 'debug/tmux-sessions'

/**
 * Find available sessions in the debug directory
 */
export async function listSessions(projectRoot: string): Promise<string[]> {
  const sessionsDir = path.join(projectRoot, DEFAULT_SESSION_DIR)
  
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse() // Most recent first (timestamp-based names)
  } catch {
    return []
  }
}

/**
 * Load session info from session-info.yaml
 */
async function loadSessionInfo(sessionDir: string): Promise<SessionInfo> {
  const infoPath = path.join(sessionDir, 'session-info.yaml')
  const content = await fs.readFile(infoPath, 'utf-8')
  return yaml.load(content) as SessionInfo
}

/**
 * Load commands from commands.yaml
 */
async function loadCommands(sessionDir: string): Promise<Command[]> {
  const commandsPath = path.join(sessionDir, 'commands.yaml')
  
  try {
    const content = await fs.readFile(commandsPath, 'utf-8')
    const commands = yaml.load(content) as Command[]
    return commands || []
  } catch {
    return []
  }
}

/**
 * Parse YAML front-matter from a capture file
 */
function parseFrontMatter(content: string): { frontMatter: CaptureFrontMatter; body: string } {
  const frontMatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = content.match(frontMatterRegex)
  
  if (!match) {
    // No front-matter, return defaults
    return {
      frontMatter: {
        sequence: 0,
        label: null,
        timestamp: new Date().toISOString(),
        after_command: null,
        dimensions: { width: 'unknown', height: 'unknown' },
      },
      body: content,
    }
  }
  
  const frontMatter = yaml.load(match[1]) as CaptureFrontMatter
  return { frontMatter, body: match[2] }
}

/**
 * Check if a filename matches capture file patterns:
 * - New format: 001-label.txt (sequence number prefix)
 * - Old format: capture-*.txt
 */
function isCaptureFile(filename: string): boolean {
  // New format: 3-digit sequence prefix (e.g., 001-initial-state.txt)
  const newPattern = /^\d{3}-.*\.txt$/
  // Old format: capture- prefix (e.g., capture-20260108-160030-initial-state.txt)
  const oldPattern = /^capture-.*\.txt$/
  
  return newPattern.test(filename) || oldPattern.test(filename)
}

/**
 * Load all captures from a session directory
 * Checks captures/ subdirectory first, falls back to session directory
 */
async function loadCaptures(sessionDir: string): Promise<Capture[]> {
  // Try captures/ subdirectory first, then fall back to session directory
  const capturesSubdir = path.join(sessionDir, 'captures')
  let capturesDir = sessionDir
  
  try {
    const stats = await fs.stat(capturesSubdir)
    if (stats.isDirectory()) {
      capturesDir = capturesSubdir
    }
  } catch {
    // captures/ subdirectory doesn't exist, use session directory
  }
  
  const files = await fs.readdir(capturesDir)
  const captureFiles = files
    .filter(isCaptureFile)
    .sort()
  
  const captures: Capture[] = []
  
  for (const filename of captureFiles) {
    const filePath = path.join(capturesDir, filename)
    const content = await fs.readFile(filePath, 'utf-8')
    const { frontMatter, body } = parseFrontMatter(content)
    
    captures.push({
      path: filePath,
      filename,
      frontMatter,
      content: body,
    })
  }
  
  return captures
}

/**
 * Build a unified timeline from commands and captures
 */
export function buildTimeline(
  commands: Command[],
  captures: Capture[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  
  // Add commands to timeline
  commands.forEach((cmd, idx) => {
    entries.push({
      timestamp: cmd.timestamp,
      type: 'command',
      command: cmd,
      index: idx,
    })
  })
  
  // Add captures to timeline
  captures.forEach((cap, idx) => {
    entries.push({
      timestamp: cap.frontMatter.timestamp,
      type: 'capture',
      capture: cap,
      index: idx,
    })
  })
  
  // Sort by timestamp
  entries.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
  
  return entries
}

/**
 * Load complete session data
 */
export async function loadSession(
  sessionName: string,
  projectRoot: string
): Promise<SessionData> {
  const sessionDir = path.join(projectRoot, DEFAULT_SESSION_DIR, sessionName)
  
  // Check if session exists
  try {
    await fs.access(sessionDir)
  } catch {
    throw new Error(`Session not found: ${sessionName}`)
  }
  
  const [sessionInfo, commands, captures] = await Promise.all([
    loadSessionInfo(sessionDir),
    loadCommands(sessionDir),
    loadCaptures(sessionDir),
  ])
  
  return {
    sessionInfo,
    commands,
    captures,
    sessionDir,
  }
}

/**
 * Convert session data to JSON format for AI consumption
 */
export function sessionToJSON(data: SessionData): SessionJSON {
  const timeline = buildTimeline(data.commands, data.captures)
  
  return {
    session: data.sessionInfo,
    commands: data.commands,
    captures: data.captures.map((cap) => ({
      sequence: cap.frontMatter.sequence,
      label: cap.frontMatter.label,
      timestamp: cap.frontMatter.timestamp,
      after_command: cap.frontMatter.after_command,
      dimensions: cap.frontMatter.dimensions,
      path: cap.path,
      content: cap.content,
    })),
    timeline: timeline.map((entry) => ({
      timestamp: entry.timestamp,
      type: entry.type,
      data: entry.type === 'command' ? entry.command! : entry.capture!,
    })),
  }
}
