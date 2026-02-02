import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { logger } from './logger'

import type { RunState } from '@codebuff/sdk'
import type { AgentMode } from './constants'

// Path to hippo binary - can be overridden via HIPPO_PATH env var
const HIPPO_BINARY = process.env.HIPPO_PATH ?? path.join(os.homedir(), 'Programming/hippo/build/hippo')

// Constants for hippo search
const HIPPO_SEARCH_TIMEOUT_MS = 5000 // 5 second timeout for search
const HIPPO_QUERY_MAX_LENGTH = 500

/**
 * Generate a session ID for hippo based on current timestamp and mode
 * Format: codebuff-{mode}-{YYYY-MM-DD-HHmm}
 */
export const generateHippoSessionId = (agentMode: AgentMode): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  
  return `codebuff-${agentMode.toLowerCase()}-${year}-${month}-${day}-${hours}${minutes}`
}

/**
 * Extract concepts from run output for hippo tagging
 */
const extractConcepts = (runState: RunState): string[] => {
  const concepts: string[] = ['codebuff']
  
  if (runState.output?.type === 'error') {
    concepts.push('error')
  } else {
    // Non-error types (structuredOutput, lastMessage, allMessages) indicate success
    concepts.push('success')
  }
  
  return concepts
}

/**
 * Build a summary of the run for hippo's --input field
 */
const buildInputSummary = (prompt: string, agentMode: AgentMode): string => {
  const truncatedPrompt = prompt.length > 100 
    ? prompt.substring(0, 100) + '...' 
    : prompt
  return `[${agentMode}] ${truncatedPrompt}`
}

/**
 * Build a detailed output description for hippo's --output field
 */
const buildOutputDescription = (runState: RunState, elapsedMs: number): string => {
  const parts: string[] = []
  
  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  parts.push(`Completed in ${elapsedSeconds}s.`)
  
  if (runState.output?.type === 'error') {
    parts.push(`Error: ${runState.output.message ?? 'Unknown error'}`)
  }
  // Note: structuredOutput, lastMessage, allMessages don't have a simple message field
  
  // Add session state info if available
  const messageCount = runState.sessionState?.mainAgentState?.messageHistory?.length ?? 0
  if (messageCount > 0) {
    parts.push(`${messageCount} messages in history.`)
  }
  
  return parts.join(' ')
}

/**
 * Determine outcome type for hippo based on run result
 */
const getOutcome = (runState: RunState): 'success' | 'failure' => {
  if (runState.output?.type === 'error') {
    return 'failure'
  }
  // structuredOutput, lastMessage, allMessages all indicate success
  return 'success'
}

/**
 * Search hippo for prior context related to the query.
 * Runs synchronously and returns the context string.
 * Returns empty string if hippo is disabled, not installed, or search fails.
 */
export const searchHippoContext = (query: string, maxTokens: number = 4000): string => {

  // Check if hippo binary exists
  // eslint-disable-next-line no-console
  console.log('[hippo:search] Checking binary at:', HIPPO_BINARY)
  if (!fs.existsSync(HIPPO_BINARY)) {
    // eslint-disable-next-line no-console
    console.log('[hippo:search] SKIPPED - binary not found at:', HIPPO_BINARY)
    logger.debug(
      { path: HIPPO_BINARY },
      'Hippo binary not found, skipping context search'
    )
    return ''
  }
  // eslint-disable-next-line no-console
  console.log('[hippo:search] Binary exists ✓')
  
  // Return early if query is empty
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return ''
  }
  
  // Truncate query if too long for command line
  const truncatedQuery = trimmedQuery.length > HIPPO_QUERY_MAX_LENGTH 
    ? trimmedQuery.substring(0, HIPPO_QUERY_MAX_LENGTH) 
    : trimmedQuery
  
  const args = [
    'context',
    truncatedQuery,
    '--max-tokens', String(maxTokens),
  ]
  
  logger.debug(
    { query: truncatedQuery },
    'Searching hippo for prior context'
  )
  
  try {
    const result = spawnSync(HIPPO_BINARY, args, {
      encoding: 'utf-8',
      timeout: HIPPO_SEARCH_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    
    // Check if process was killed by timeout
    if (result.signal) {
      logger.debug(
        { signal: result.signal },
        'Hippo context search timed out'
      )
      return ''
    }
    
    if (result.error) {
      logger.debug(
        { error: result.error.message },
        'Hippo context search failed'
      )
      return ''
    }
    
    if (result.status !== 0) {
      logger.debug(
        { status: result.status, stderr: result.stderr },
        'Hippo context search returned non-zero exit code'
      )
      return ''
    }
    
    const context = result.stdout?.trim() ?? ''
    
    // Filter out empty results
    if (!context || context.includes('Found 0 results')) {
      // eslint-disable-next-line no-console
      console.log('[hippo:search] No results found')
      return ''
    }
    
    // eslint-disable-next-line no-console
    console.log('[hippo:search] SUCCESS - Got context, length:', context.length)
    logger.debug(
      { contextLength: context.length },
      'Retrieved context from hippo'
    )
    
    return context
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[hippo:search] ERROR:', error instanceof Error ? error.message : String(error))
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to search hippo context'
    )
    return ''
  }
}

export type StoreRunToHippoParams = {
  runState: RunState
  prompt: string
  agentMode: AgentMode
  elapsedMs: number
}

/**
 * Store a completed run to hippo memory.
 * Runs in a detached background process so it doesn't block the CLI.
 */
export const storeRunToHippo = (params: StoreRunToHippoParams): void => {
  const { runState, prompt, agentMode, elapsedMs } = params
  
  const sessionId = generateHippoSessionId(agentMode)
  const inputSummary = buildInputSummary(prompt, agentMode)
  const outputDescription = buildOutputDescription(runState, elapsedMs)
  const concepts = extractConcepts(runState)
  const outcome = getOutcome(runState)
  
  // eslint-disable-next-line no-console
  console.log('[hippo:store] sessionId:', sessionId)
  // eslint-disable-next-line no-console
  console.log('[hippo:store] inputSummary:', inputSummary)
  // eslint-disable-next-line no-console
  console.log('[hippo:store] outputDescription:', outputDescription)
  // eslint-disable-next-line no-console
  console.log('[hippo:store] concepts:', concepts)
  // eslint-disable-next-line no-console
  console.log('[hippo:store] outcome:', outcome)
  
  const args = [
    'store',
    '--agent', 'codebuff',
    '--session', sessionId,
    '--input', inputSummary,
    '--output', outputDescription,
    '--concepts', concepts.join(','),
    '--outcome', outcome,
  ]
  
  // Check if hippo binary exists before attempting to spawn
  // eslint-disable-next-line no-console
  console.log('[hippo:store] Binary path:', HIPPO_BINARY)
  if (!fs.existsSync(HIPPO_BINARY)) {
    // eslint-disable-next-line no-console
    console.log('[hippo:store] SKIPPED - binary not found!')
    console.log('[hippo:store] ═══════════════════════════════════════════\n')
    logger.debug(
      { path: HIPPO_BINARY },
      'Hippo binary not found, skipping storage'
    )
    return
  }
  // eslint-disable-next-line no-console
  console.log('[hippo:store] Binary exists ✓')
  
  // eslint-disable-next-line no-console
  console.log('[hippo:store] Spawning command:', HIPPO_BINARY, args.join(' '))
  
  logger.debug(
    { hippoArgs: args },
    'Storing run to hippo memory'
  )
  
  try {
    // Spawn detached process so it doesn't block CLI
    const child = spawn(HIPPO_BINARY, args, {
      detached: true,
      stdio: 'ignore',
    })
    
    // eslint-disable-next-line no-console
    console.log('[hippo:store] Spawned process PID:', child.pid)
    
    // Unref to allow parent process to exit independently
    child.unref()
    
    // eslint-disable-next-line no-console
    console.log('[hippo:store] SUCCESS - Process spawned and detached')
    console.log('[hippo:store] ═══════════════════════════════════════════\n')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[hippo:store] ERROR spawning:', error instanceof Error ? error.message : String(error))
    console.log('[hippo:store] ═══════════════════════════════════════════\n')
    // Log but don't throw - hippo storage is best-effort
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to spawn hippo store process'
    )
  }
}
