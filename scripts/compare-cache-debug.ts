#!/usr/bin/env bun

/**
 * Compare sequential cache debug snapshots to find what's causing prompt cache misses.
 *
 * Usage:
 *   bun scripts/compare-cache-debug.ts [directory] [--agent <type>]
 *
 * Options:
 *   --agent <type>  Only compare snapshots from this agent type (e.g. base2)
 *
 * Default directory: debug/cache-debug/
 *
 * The snapshots are written by the agent-runtime when CACHE_DEBUG_FULL_LOGGING
 * is set to true in packages/agent-runtime/src/constants.ts.
 */

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

interface Snapshot {
  index: number
  timestamp: string
  agentType: string
  systemPrompt: string
  toolDefinitions: Record<string, { description: string; inputSchema: unknown }>
  messages: Array<{
    role: string
    content: unknown
    tags?: string[]
    timeToLive?: string
    sentAt?: number
  }>
}

function findFirstDifference(
  a: string,
  b: string,
): { index: number; contextA: string; contextB: string } | null {
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) {
      const start = Math.max(0, i - 80)
      const end = Math.min(Math.max(a.length, b.length), i + 80)
      return {
        index: i,
        contextA: a.slice(start, end),
        contextB: b.slice(start, end),
      }
    }
  }
  if (a.length !== b.length) {
    const i = minLen
    const start = Math.max(0, i - 80)
    return {
      index: i,
      contextA: a.slice(start, i + 80),
      contextB: b.slice(start, i + 80),
    }
  }
  return null
}

function compareTools(
  a: Snapshot['toolDefinitions'],
  b: Snapshot['toolDefinitions'],
): { added: string[]; removed: string[]; changed: string[] } {
  const keysA = new Set(Object.keys(a))
  const keysB = new Set(Object.keys(b))

  const added = [...keysB].filter((k) => !keysA.has(k))
  const removed = [...keysA].filter((k) => !keysB.has(k))
  const changed: string[] = []

  for (const key of keysA) {
    if (keysB.has(key)) {
      const jsonA = JSON.stringify(a[key], null, 2)
      const jsonB = JSON.stringify(b[key], null, 2)
      if (jsonA !== jsonB) {
        changed.push(key)
      }
    }
  }

  return { added, removed, changed }
}

function compareMessages(
  a: Snapshot['messages'],
  b: Snapshot['messages'],
): { firstDiffIndex: number; description: string } | null {
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    const jsonA = JSON.stringify(a[i])
    const jsonB = JSON.stringify(b[i])
    if (jsonA !== jsonB) {
      return {
        firstDiffIndex: i,
        description: `Message ${i} differs (role: ${a[i].role} vs ${b[i].role}, tags: [${a[i].tags?.join(', ') ?? ''}] vs [${b[i].tags?.join(', ') ?? ''}])`,
      }
    }
  }
  if (a.length !== b.length) {
    return {
      firstDiffIndex: minLen,
      description: `Message count differs: ${a.length} vs ${b.length}`,
    }
  }
  return null
}

function printSectionHeader(title: string) {
  console.log(`\n${'─'.repeat(80)}`)
  console.log(`  ${title}`)
  console.log(`${'─'.repeat(80)}`)
}

function comparePair(prev: Snapshot, curr: Snapshot, prevFile: string, currFile: string) {
  printSectionHeader(
    `Comparing snapshot ${prev.index} → ${curr.index}  (${prev.agentType})`,
  )
  console.log(`  File A: ${prevFile}`)
  console.log(`  File B: ${currFile}`)
  console.log(`  Time:   ${prev.timestamp} → ${curr.timestamp}`)

  // Compare system prompt
  console.log('\n  📝 System Prompt:')
  if (prev.systemPrompt === curr.systemPrompt) {
    console.log(`     ✅ IDENTICAL (${prev.systemPrompt.length} chars)`)
  } else {
    console.log(
      `     ❌ DIFFERS (${prev.systemPrompt.length} chars → ${curr.systemPrompt.length} chars)`,
    )
    const diff = findFirstDifference(prev.systemPrompt, curr.systemPrompt)
    if (diff) {
      console.log(`     First difference at character ${diff.index}:`)
      console.log(`     A: ...${JSON.stringify(diff.contextA)}...`)
      console.log(`     B: ...${JSON.stringify(diff.contextB)}...`)
    }
  }

  // Compare tool definitions
  console.log('\n  🔧 Tool Definitions:')
  const toolDiff = compareTools(prev.toolDefinitions, curr.toolDefinitions)
  const prevToolJson = JSON.stringify(prev.toolDefinitions)
  const currToolJson = JSON.stringify(curr.toolDefinitions)
  if (prevToolJson === currToolJson) {
    console.log(
      `     ✅ IDENTICAL (${Object.keys(prev.toolDefinitions).length} tools)`,
    )
  } else {
    console.log(`     ❌ DIFFERS`)
    if (toolDiff.added.length > 0) {
      console.log(`     Added:   ${toolDiff.added.join(', ')}`)
    }
    if (toolDiff.removed.length > 0) {
      console.log(`     Removed: ${toolDiff.removed.join(', ')}`)
    }
    if (toolDiff.changed.length > 0) {
      console.log(`     Changed: ${toolDiff.changed.join(', ')}`)
      for (const toolName of toolDiff.changed) {
        const toolA = JSON.stringify(prev.toolDefinitions[toolName], null, 2)
        const toolB = JSON.stringify(curr.toolDefinitions[toolName], null, 2)
        const charDiff = findFirstDifference(toolA, toolB)
        if (charDiff) {
          console.log(`       ${toolName} - first diff at char ${charDiff.index}:`)
          console.log(`         A: ...${JSON.stringify(charDiff.contextA)}...`)
          console.log(`         B: ...${JSON.stringify(charDiff.contextB)}...`)
        }
      }
    }
  }

  // Compare messages
  console.log('\n  💬 Messages:')
  console.log(
    `     Count: ${prev.messages.length} → ${curr.messages.length}`,
  )
  const msgDiff = compareMessages(prev.messages, curr.messages)
  if (!msgDiff) {
    console.log(`     ✅ IDENTICAL`)
  } else {
    console.log(`     First difference: ${msgDiff.description}`)
    if (msgDiff.firstDiffIndex > 0) {
      console.log(
        `     ✅ First ${msgDiff.firstDiffIndex} messages are identical (shared prefix)`,
      )
    }
    // Show the differing message content
    const idx = msgDiff.firstDiffIndex
    if (idx < prev.messages.length && idx < curr.messages.length) {
      const msgA = JSON.stringify(prev.messages[idx], null, 2)
      const msgB = JSON.stringify(curr.messages[idx], null, 2)
      const charDiff = findFirstDifference(msgA, msgB)
      if (charDiff) {
        console.log(`     Diff in message ${idx} at char ${charDiff.index}:`)
        console.log(`       A: ...${JSON.stringify(charDiff.contextA)}...`)
        console.log(`       B: ...${JSON.stringify(charDiff.contextB)}...`)
      }
    }
  }

  // Overall cache verdict
  console.log('\n  🎯 Cache Verdict:')
  const systemIdentical = prev.systemPrompt === curr.systemPrompt
  const toolsIdentical = prevToolJson === currToolJson
  if (systemIdentical && toolsIdentical) {
    console.log(
      '     ✅ System prompt and tools are IDENTICAL — cache should hit if TTL hasn\'t expired',
    )
  } else {
    const causes: string[] = []
    if (!systemIdentical) causes.push('system prompt changed')
    if (!toolsIdentical) causes.push('tool definitions changed')
    console.log(`     ❌ CACHE MISS expected — ${causes.join(' and ')}`)
  }
}

function parseArgs(): { dir: string; agentFilter?: string } {
  const args = process.argv.slice(2)
  let dir = join(process.cwd(), 'debug', 'cache-debug')
  let agentFilter: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && i + 1 < args.length) {
      agentFilter = args[++i]
    } else if (!args[i].startsWith('--')) {
      dir = args[i]
    }
  }

  return { dir, agentFilter }
}

function main() {
  const { dir, agentFilter } = parseArgs()

  let files: string[]
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  } catch {
    console.error(`Error: Could not read directory: ${dir}`)
    console.error(
      '\nMake sure CACHE_DEBUG_FULL_LOGGING is enabled in packages/agent-runtime/src/constants.ts',
    )
    console.error('and you\'ve run at least two prompts to generate snapshots.')
    process.exit(1)
  }

  if (files.length === 0) {
    console.error(`No JSON snapshots found in ${dir}`)
    console.error(
      '\nEnable CACHE_DEBUG_FULL_LOGGING in packages/agent-runtime/src/constants.ts and send some prompts.',
    )
    process.exit(1)
  }

  let allSnapshots: Array<{ snapshot: Snapshot; filename: string }> = []
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8')
    allSnapshots.push({ snapshot: JSON.parse(content), filename: file })
  }

  if (agentFilter) {
    allSnapshots = allSnapshots.filter(
      (s) => s.snapshot.agentType === agentFilter,
    )
    console.log(
      `Filtered to ${allSnapshots.length} snapshot(s) for agent type: ${agentFilter}`,
    )
  } else {
    console.log(`Found ${allSnapshots.length} snapshot(s) in ${dir}`)
    const agentTypes = [...new Set(allSnapshots.map((s) => s.snapshot.agentType))]
    if (agentTypes.length > 1) {
      console.log(
        `\n⚠️  Multiple agent types found: ${agentTypes.join(', ')}`,
      )
      console.log(
        '   Use --agent <type> to filter (e.g. --agent base2)',
      )
    }
  }

  console.log(
    '\nFiles:',
    allSnapshots.map((s) => `  ${s.filename}`).join('\n'),
  )

  if (allSnapshots.length < 2) {
    console.error('\nNeed at least 2 snapshots to compare. Send another prompt.')
    process.exit(1)
  }

  for (let i = 1; i < allSnapshots.length; i++) {
    comparePair(
      allSnapshots[i - 1].snapshot,
      allSnapshots[i].snapshot,
      allSnapshots[i - 1].filename,
      allSnapshots[i].filename,
    )
  }

  console.log(`\n${'═'.repeat(80)}`)
  console.log(`  Summary: compared ${allSnapshots.length - 1} consecutive pair(s)`)
  console.log(`${'═'.repeat(80)}\n`)
}

main()
