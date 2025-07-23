import * as fs from 'fs'
import * as path from 'path'

import { endToolTag } from '@codebuff/common/constants/tools'

import { getProjectRoot } from './project-files'

interface SubagentMessage {
  timestamp: number
  chunk: string
  agentType: string
}

export interface SubagentData {
  agentId: string
  agentType: string
  prompt?: string
  messages: SubagentMessage[]
  isActive: boolean
  lastActivity: number
  startTime: number
}

// Global storage for all subagent data
const subagentStorage = new Map<string, SubagentData>()

// Global trace flag
let traceEnabled = false

// Track which agents have had their headers written
const agentHeadersWritten = new Set<string>()

/**
 * Enable or disable trace logging
 */
export function setTraceEnabled(enabled: boolean) {
  traceEnabled = enabled
  agentHeadersWritten.clear() // Clear headers in both cases

  if (enabled) {
    // Clear traces directory for a fresh start when enabling tracing
    try {
      const projectRoot = getProjectRoot()
      const tracesDir = path.join(projectRoot, '.agents', 'traces')
      if (fs.existsSync(tracesDir)) {
        fs.rmSync(tracesDir, { recursive: true, force: true })
      }
    } catch (error) {
      console.warn('Warning: Could not clear traces directory:', error)
    }
  }
}

/**
 * Write a message to the trace log file for a subagent
 */
function writeToTraceLog(agentId: string, agentType: string, chunk: string) {
  if (!traceEnabled) return

  try {
    const projectRoot = getProjectRoot()
    const tracesDir = path.join(projectRoot, '.agents', 'traces')

    // Ensure the traces directory exists
    if (!fs.existsSync(tracesDir)) {
      fs.mkdirSync(tracesDir, { recursive: true })
    }

    const logFile = path.join(tracesDir, `${agentType}-${agentId}.log`)

    // Write header only once per agent
    if (!agentHeadersWritten.has(agentId)) {
      const timestamp = new Date().toISOString()
      const header = `[${timestamp}] [${agentType}] Trace for ${agentId}\n\n`
      fs.appendFileSync(logFile, header, 'utf8')
      agentHeadersWritten.add(agentId)
    }

    // Append just the chunk content without timestamp/type prefix
    let chunkToWrite = chunk

    // Add two newlines after </codebuff_tool_call> to properly separate message endings
    if (chunk.endsWith(endToolTag)) {
      chunkToWrite += '\n\n'
    }

    fs.appendFileSync(logFile, chunkToWrite, 'utf8')
  } catch (error) {
    // Silently fail if we can't write to the log file
  }
}

/**
 * Store a chunk from a subagent
 */
export function storeSubagentChunk({
  agentId,
  agentType,
  chunk,
  prompt,
}: {
  agentId: string
  agentType: string
  chunk: string
  prompt?: string
}) {
  const now = Date.now()

  if (!subagentStorage.has(agentId)) {
    subagentStorage.set(agentId, {
      agentId,
      agentType,
      prompt,
      messages: [],
      isActive: true,
      lastActivity: now,
      startTime: now,
    })
  }

  const data = subagentStorage.get(agentId)!

  // Set prompt only if not already set (first chunk)
  if (prompt && !data.prompt) {
    data.prompt = prompt
  }

  data.messages.push({
    timestamp: now,
    chunk,
    agentType,
  })
  data.lastActivity = now
  data.isActive = true

  // Write to trace log if enabled
  writeToTraceLog(agentId, agentType, chunk)
}

/**
 * Get all messages for a specific subagent
 */
export function getSubagentMessages(agentId: string): SubagentMessage[] {
  const data = subagentStorage.get(agentId)
  return data ? data.messages : []
}

/**
 * Get subagent data including metadata
 */
export function getSubagentData(agentId: string): SubagentData | null {
  return subagentStorage.get(agentId) || null
}

/**
 * Get all subagent IDs
 */
export function getAllSubagentIds(): string[] {
  return Array.from(subagentStorage.keys())
}

/**
 * Mark a subagent as inactive
 */
export function markSubagentInactive(agentId: string) {
  const data = subagentStorage.get(agentId)
  if (data) {
    data.isActive = false
  }
}

/**
 * Clear all subagent data
 */
export function clearSubagentStorage() {
  subagentStorage.clear()
  agentHeadersWritten.clear()
}

/**
 * Get the full content for a subagent (all chunks joined)
 */
export function getSubagentFullContent(agentId: string): string {
  const messages = getSubagentMessages(agentId)
  const content = messages.map((msg) => msg.chunk).join('')
  return content
}

/**
 * Get formatted content for a subagent with trace-like formatting
 */
export function getSubagentFormattedContent(agentId: string): string {
  const data = getSubagentData(agentId)
  if (!data) return ''

  // Add metadata header like in trace logs
  const timestamp = new Date(data.startTime).toISOString()
  const header = `[${timestamp}] [${data.agentType}] Trace for ${agentId}\n\n`

  // Format content with proper spacing after tool calls
  const formattedChunks = data.messages.map((msg) => {
    let chunk = msg.chunk
    // Add two newlines after </codebuff_tool_call> to properly separate message endings
    if (chunk.endsWith(endToolTag)) {
      chunk += '\n\n'
    }
    return chunk
  })

  return header + formattedChunks.join('')
}

/**
 * Get recent subagents (sorted by last activity)
 */
export function getRecentSubagents(limit: number = 10): SubagentData[] {
  return Array.from(subagentStorage.values())
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, limit)
}

/**
 * Get subagents in chronological order (oldest first)
 */
export function getSubagentsChronological(limit: number = 50): SubagentData[] {
  return Array.from(subagentStorage.values())
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, limit)
}
