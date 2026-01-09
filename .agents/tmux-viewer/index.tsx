#!/usr/bin/env bun

/**
 * tmux-viewer - Interactive TUI for viewing tmux session data
 * 
 * Usage:
 *   bun .agents/tmux-viewer/index.tsx <session-name>
 *   bun .agents/tmux-viewer/index.tsx <session-name> --json
 *   bun .agents/tmux-viewer/index.tsx <session-name> --replay
 *   bun .agents/tmux-viewer/index.tsx --list
 * 
 * Both humans and AIs can use this tool:
 *   - Humans: Interactive TUI with keyboard navigation
 *   - AIs: Use --json flag to get structured output
 */

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { Command } from 'commander'
import { red, cyan, yellow, dim } from 'picocolors'
import React from 'react'

import { SessionViewer } from './components/session-viewer'
import { loadSession, listSessions, sessionToJSON } from './session-loader'

interface ParsedArgs {
  session: string | null
  json: boolean
  list: boolean
  replay: boolean
}

function parseArgs(): ParsedArgs {
  const program = new Command()

  program
    .name('tmux-viewer')
    .description('Interactive viewer for tmux session logs')
    .version('0.0.1')
    .option('--json', 'Output session data as JSON (for AI consumption)')
    .option('--list', 'List available sessions')
    .option('--replay', 'Start in replay mode (auto-playing through captures)')
    .argument('[session]', 'Session name to view')
    .parse(process.argv)

  const options = program.opts()
  const args = program.args

  return {
    session: args[0] ?? null,
    json: options.json ?? false,
    list: options.list ?? false,
    replay: options.replay ?? false,
  }
}

async function main(): Promise<void> {
  const { session, json, list, replay } = parseArgs()
  const projectRoot = process.cwd()

  // List sessions mode
  if (list) {
    const sessions = await listSessions(projectRoot)
    
    if (sessions.length === 0) {
      console.log(yellow('No sessions found in debug/tmux-sessions/'))
      console.log(dim('Start a session with: ./scripts/tmux/tmux-cli.sh start'))
      process.exit(0)
    }
    
    console.log(cyan('Available sessions:'))
    for (const s of sessions) {
      console.log(`  ${s}`)
    }
    process.exit(0)
  }

  // If no session specified, show help or list
  if (!session) {
    const sessions = await listSessions(projectRoot)
    
    if (sessions.length === 0) {
      console.log(red('No session specified and no sessions found.'))
      console.log('')
      console.log('Usage:')
      console.log('  bun .agents/tmux-viewer/index.tsx <session-name>')
      console.log('  bun .agents/tmux-viewer/index.tsx <session-name> --json')
      console.log('  bun .agents/tmux-viewer/index.tsx --list')
      console.log('')
      console.log(dim('Start a session with: ./scripts/tmux/tmux-cli.sh start'))
      process.exit(1)
    }
    
    // Use the most recent session
    const mostRecent = sessions[0]
    console.log(dim(`Using most recent session: ${mostRecent}`))
    return runViewer(mostRecent, json, replay, projectRoot)
  }

  return runViewer(session, json, replay, projectRoot)
}

async function runViewer(
  sessionName: string,
  jsonMode: boolean,
  replayMode: boolean,
  projectRoot: string
): Promise<void> {
  // Load session data
  let data
  try {
    data = await loadSession(sessionName, projectRoot)
  } catch (error) {
    console.log(red(`Error: ${(error as Error).message}`))
    console.log('')
    console.log('Available sessions:')
    const sessions = await listSessions(projectRoot)
    for (const s of sessions) {
      console.log(`  ${s}`)
    }
    process.exit(1)
  }

  // JSON mode - output and exit
  if (jsonMode) {
    const jsonOutput = sessionToJSON(data)
    console.log(JSON.stringify(jsonOutput, null, 2))
    process.exit(0)
  }

  // Interactive TUI mode
  let renderer: Awaited<ReturnType<typeof createCliRenderer>> | null = null
  
  const handleExit = () => {
    renderer?.destroy()
    process.exit(0)
  }

  const handleJsonOutput = () => {
    // Temporarily exit TUI, output JSON, then exit
    renderer?.destroy()
    const jsonOutput = sessionToJSON(data)
    console.log(JSON.stringify(jsonOutput, null, 2))
    process.exit(0)
  }

  renderer = await createCliRenderer({
    backgroundColor: 'transparent',
    exitOnCtrlC: false,
  })

  createRoot(renderer).render(
    <SessionViewer
      data={data}
      onExit={handleExit}
      onJsonOutput={handleJsonOutput}
      startInReplayMode={replayMode}
    />
  )
}

void main()
