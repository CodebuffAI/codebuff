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
  id: string
  index: number
  filename: string
  filePath: string
  timestamp: string
  agentType: string
  runId?: string
  userInputId?: string
  agentStepId?: string
  model?: string
  systemHash?: string
  toolsHash?: string
  preConversion: {
    systemPrompt: string
    toolDefinitions: Record<string, unknown>
    messages: Array<{
      role: string
      content: unknown
      tags?: string[]
      timeToLive?: string
      sentAt?: number
      providerOptions?: unknown
      toolCallId?: string
      toolName?: string
    }>
  }
  providerRequest?: {
    provider: string
    rawBody: unknown
    normalized: unknown
  }
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
  a: Record<string, unknown>,
  b: Record<string, unknown>,
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
  a: Snapshot['preConversion']['messages'],
  b: Snapshot['preConversion']['messages'],
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

function compareProviderRequests(
  prev: Snapshot['providerRequest'],
  curr: Snapshot['providerRequest'],
) {
  console.log('\n  🌐 Provider Request (post-conversion):')

  if (!prev && !curr) {
    console.log('     ⚠️  No provider request data in either snapshot')
    return
  }
  if (!prev) {
    console.log('     ⚠️  No provider request data in previous snapshot')
    return
  }
  if (!curr) {
    console.log('     ⚠️  No provider request data in current snapshot')
    return
  }

  console.log(`     Provider: ${prev.provider} → ${curr.provider}`)

  const prevNorm = JSON.stringify(prev.normalized, null, 2)
  const currNorm = JSON.stringify(curr.normalized, null, 2)

  if (prevNorm === currNorm) {
    console.log(`     ✅ Normalized request bodies are IDENTICAL`)
  } else {
    console.log(`     ❌ Normalized request bodies DIFFER`)
    const diff = findFirstDifference(prevNorm, currNorm)
    if (diff) {
      console.log(`     First difference at character ${diff.index}:`)
      console.log(`     A: ...${JSON.stringify(diff.contextA)}...`)
      console.log(`     B: ...${JSON.stringify(diff.contextB)}...`)
    }

    if (
      prev.normalized &&
      typeof prev.normalized === 'object' &&
      !Array.isArray(prev.normalized) &&
      curr.normalized &&
      typeof curr.normalized === 'object' &&
      !Array.isArray(curr.normalized)
    ) {
      const prevObj = prev.normalized as Record<string, unknown>
      const currObj = curr.normalized as Record<string, unknown>

      for (const key of ['model', 'tools', 'tool_choice', 'response_format']) {
        if (key in prevObj || key in currObj) {
          const prevVal = JSON.stringify(prevObj[key])
          const currVal = JSON.stringify(currObj[key])
          const status = prevVal === currVal ? '✅' : '❌'
          console.log(`       ${status} ${key}: ${prevVal === currVal ? 'identical' : 'differs'}`)
        }
      }

      if ('messages' in prevObj && 'messages' in currObj) {
        const prevMsgs = prevObj.messages as unknown[]
        const currMsgs = currObj.messages as unknown[]
        if (Array.isArray(prevMsgs) && Array.isArray(currMsgs)) {
          const prevMsgsJson = JSON.stringify(prevMsgs)
          const currMsgsJson = JSON.stringify(currMsgs)
          if (prevMsgsJson === currMsgsJson) {
            console.log(`       ✅ messages: identical (${prevMsgs.length} messages)`)
          } else {
            console.log(`       ❌ messages: differ (${prevMsgs.length} → ${currMsgs.length})`)
            const minLen = Math.min(prevMsgs.length, currMsgs.length)
            for (let i = 0; i < minLen; i++) {
              if (JSON.stringify(prevMsgs[i]) !== JSON.stringify(currMsgs[i])) {
                console.log(`          First diff at message index ${i}`)
                break
              }
            }
            if (prevMsgs.length !== currMsgs.length) {
              console.log(`          Message count: ${prevMsgs.length} → ${currMsgs.length}`)
            }
          }
        }
      }
    }
  }
}

function comparePair(prev: Snapshot, curr: Snapshot, prevFile: string, currFile: string) {
  printSectionHeader(
    `Comparing snapshot ${prev.index} → ${curr.index}  (${prev.agentType})`,
  )
  console.log(`  File A: ${prevFile}`)
  console.log(`  File B: ${currFile}`)
  console.log(`  Time:   ${prev.timestamp} → ${curr.timestamp}`)
  if (prev.model || curr.model) {
    console.log(`  Model:  ${prev.model ?? 'unknown'} → ${curr.model ?? 'unknown'}`)
  }
  if (prev.systemHash || curr.systemHash) {
    console.log(`  Hashes: system=${prev.systemHash ?? '?'}→${curr.systemHash ?? '?'}  tools=${prev.toolsHash ?? '?'}→${curr.toolsHash ?? '?'}`)
  }
  if (prev.runId || curr.runId) {
    console.log(`  RunId:  ${prev.runId ?? '?'} → ${curr.runId ?? '?'}`)
  }

  const prevSystem = prev.preConversion.systemPrompt
  const currSystem = curr.preConversion.systemPrompt
  const prevTools = prev.preConversion.toolDefinitions
  const currTools = curr.preConversion.toolDefinitions
  const prevMessages = prev.preConversion.messages
  const currMessages = curr.preConversion.messages

  // Compare system prompt
  console.log('\n  📝 System Prompt (pre-conversion):')
  if (prevSystem === currSystem) {
    console.log(`     ✅ IDENTICAL (${prevSystem.length} chars)`)
  } else {
    console.log(
      `     ❌ DIFFERS (${prevSystem.length} chars → ${currSystem.length} chars)`,
    )
    const diff = findFirstDifference(prevSystem, currSystem)
    if (diff) {
      console.log(`     First difference at character ${diff.index}:`)
      console.log(`     A: ...${JSON.stringify(diff.contextA)}...`)
      console.log(`     B: ...${JSON.stringify(diff.contextB)}...`)
    }
  }

  // Compare tool definitions
  console.log('\n  🔧 Tool Definitions (pre-conversion):')
  const toolDiff = compareTools(prevTools, currTools)
  const prevToolJson = JSON.stringify(prevTools)
  const currToolJson = JSON.stringify(currTools)
  if (prevToolJson === currToolJson) {
    console.log(
      `     ✅ IDENTICAL (${Object.keys(prevTools).length} tools)`,
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
        const toolA = JSON.stringify(prevTools[toolName], null, 2)
        const toolB = JSON.stringify(currTools[toolName], null, 2)
        const charDiff = findFirstDifference(toolA, toolB)
        if (charDiff) {
          console.log(`       ${toolName} - first diff at char ${charDiff.index}:`)
          console.log(`         A: ...${JSON.stringify(charDiff.contextA)}...`)
          console.log(`         B: ...${JSON.stringify(charDiff.contextB)}...`)
        }
      }
    }
  }

  // Compare messages (pre-conversion)
  console.log('\n  💬 Messages (pre-conversion):')
  console.log(
    `     Count: ${prevMessages.length} → ${currMessages.length}`,
  )
  const msgDiff = compareMessages(prevMessages, currMessages)
  if (!msgDiff) {
    console.log(`     ✅ IDENTICAL`)
  } else {
    console.log(`     First difference: ${msgDiff.description}`)
    if (msgDiff.firstDiffIndex > 0) {
      console.log(
        `     ✅ First ${msgDiff.firstDiffIndex} messages are identical (shared prefix)`,
      )
    }
    const idx = msgDiff.firstDiffIndex
    if (idx < prevMessages.length && idx < currMessages.length) {
      const msgA = JSON.stringify(prevMessages[idx], null, 2)
      const msgB = JSON.stringify(currMessages[idx], null, 2)
      const charDiff = findFirstDifference(msgA, msgB)
      if (charDiff) {
        console.log(`     Diff in message ${idx} at char ${charDiff.index}:`)
        console.log(`       A: ...${JSON.stringify(charDiff.contextA)}...`)
        console.log(`       B: ...${JSON.stringify(charDiff.contextB)}...`)
      }
    }
  }

  // Compare provider requests (post-conversion)
  compareProviderRequests(prev.providerRequest, curr.providerRequest)

  // Overall cache verdict
  console.log('\n  🎯 Cache Verdict:')
  const systemIdentical = prevSystem === currSystem
  const toolsIdentical = prevToolJson === currToolJson
  const providerNormIdentical =
    prev.providerRequest && curr.providerRequest
      ? JSON.stringify(prev.providerRequest.normalized) ===
        JSON.stringify(curr.providerRequest.normalized)
      : undefined

  if (systemIdentical && toolsIdentical) {
    console.log(
      '     ✅ Pre-conversion system prompt and tools are IDENTICAL — cache should hit if TTL hasn\'t expired',
    )
  } else {
    const causes: string[] = []
    if (!systemIdentical) causes.push('system prompt changed')
    if (!toolsIdentical) causes.push('tool definitions changed')
    console.log(`     ❌ PRE-CONVERSION CACHE MISS expected — ${causes.join(' and ')}`)
  }

  if (providerNormIdentical === true) {
    console.log(
      '     ✅ Post-conversion (provider) request bodies are IDENTICAL',
    )
  } else if (providerNormIdentical === false) {
    console.log(
      '     ❌ Post-conversion (provider) request bodies DIFFER — conversion layer may be introducing instability',
    )
    if (systemIdentical && toolsIdentical) {
      console.log(
        '     ⚠️  Pre-conversion was identical but post-conversion differs — bug is in the conversion layer!',
      )
    }
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
    const snapshot = JSON.parse(content) as Snapshot
    allSnapshots.push({ snapshot, filename: file })
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

  const withProviderRequest = allSnapshots.filter((s) => s.snapshot.providerRequest !== undefined).length
  console.log(`  Provider request data: ${withProviderRequest}/${allSnapshots.length} snapshots`)

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
