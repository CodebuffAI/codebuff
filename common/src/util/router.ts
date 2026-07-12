/**
 * Task-routed knowledge loader (P0.11, mex-borrowing).
 *
 * Reads `<projectRoot>/ROUTER.md` and resolves which knowledge files the
 * agent runtime should include in its system prompt for a given agent
 * identity. Mirrors the mex `ROUTER.md` pattern: a small markdown table that
 * maps `agent | knowledge_files` so each agent sees only the docs that are
 * relevant to it, instead of dumping every root knowledge file into every
 * prompt.
 *
 * The runtime currently has no task-type discriminator, so the routing key is
 * `agentTemplate.id` (the agent identity: e.g. `base2`, `base2-plan`,
 * `base2-execute-plan`). When `ROUTER.md` is absent, malformed, or has no
 * entry for the current agent, this module falls back to today's behavior
 * (all root knowledge files) so the change is strictly additive.
 */

import fs from 'fs'
import path from 'path'

import { KNOWLEDGE_FILE_NAMES_LOWERCASE } from '../constants/knowledge'
import { isMandatorySensitiveReadPath } from './sensitive-paths'

import type { Logger } from '../types/contracts/logger'

/** Map from agent identity to the list of knowledge files it should load. */
export type RouterTable = Record<string, string[]>
export type KnowledgeTaskType =
  | 'audit'
  | 'planning'
  | 'implementation'
  | 'debugging'
  | 'validation'
  | 'general'

const ROUTER_FILENAME = 'ROUTER.md'

/**
 * Parse a `ROUTER.md` markdown body into a `RouterTable`.
 *
 * The expected format is a markdown pipe-table whose first column is an
 * agent identifier and whose second column is a comma-separated list of
 * knowledge-file paths. Lines outside the first table are ignored; rows that
 * don't match the expected shape are skipped with a warning (logged once).
 *
 * Example:
 *
 *   | agent | knowledge_files |
 *   | --- | --- |
 *   | base2 | AGENTS.md, docs/architecture.md |
 *   | base2-plan | AGENTS.md, docs/development.md |
 */
export function parseRouterTable(markdown: string): RouterTable {
  const out: RouterTable = {}
  if (typeof markdown !== 'string' || !markdown.trim()) return out
  const lines = markdown.split(/\r?\n/)
  let inTable = false
  let headerSeen = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith('|')) {
      // End the table once we leave the pipe-row region.
      if (inTable && line === '') {
        inTable = false
      }
      continue
    }
    inTable = true
    // Count `|` separators so we don't drop legitimate cells from rows
    // with 3+ columns. Drop the empty leading + trailing cells produced by
    // the surrounding pipes, leaving only the real column values.
    const split = line.split('|')
    const cells = split.slice(1, -1).map((cell) => cell.trim())
    if (cells.length < 2) continue
    if (!headerSeen) {
      headerSeen = true
      // Skip the header row.
      continue
    }
    // Skip the separator row (`| --- | --- |`).
    if (/^[-:\s|]+$/.test(line)) continue
    const [agentRaw, filesRaw, ...rest] = cells
    if (rest.length > 0) {
      // Unexpected extra column; skip the row.
      continue
    }
    const agent = agentRaw.trim()
    if (!agent || agent.includes(' ')) {
      // Empty agent id or one containing whitespace is invalid.
      continue
    }
    const files = filesRaw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    out[agent] = files
  }
  return out
}

/**
 * Read `<projectRoot>/ROUTER.md` and return the parsed table.
 * Returns `{}` if the file does not exist or cannot be read.
 */
export function loadRouterTable(
  projectRoot: string,
  logger?: Logger,
): RouterTable {
  if (!projectRoot || typeof projectRoot !== 'string') return {}
  const routerPath = path.join(projectRoot, ROUTER_FILENAME)
  if (!fs.existsSync(routerPath)) return {}
  try {
    const raw = fs.readFileSync(routerPath, 'utf8')
    return parseRouterTable(raw)
  } catch (err) {
    logger?.warn(
      { err, routerPath },
      '[router] Failed to read ROUTER.md; falling back to all root knowledge files.',
    )
    return {}
  }
}

/**
 * Return the list of knowledge file paths to include for the given agent.
 *
 * - When `routerTable` has an entry for `agentId`, use that entry's files.
 * - When the router is empty or has no entry for `agentId`, return every
 *   root-level knowledge file (matched against `knowledgeFiles` keys using
 *   the same full-path filter as `KNOWLEDGE_FILES_CONTENTS`).
 * - In either case, files that aren't present in `knowledgeFiles` are
 *   dropped; when that drop is caused by a routed entry pointing at a
 *   missing path (vs. the fallback), a single warning is logged so the
 *   operator can fix `ROUTER.md` instead of silently degrading.
 */
export function resolveRoutedKnowledgeFiles(opts: {
  routerTable: RouterTable
  agentId: string | undefined
  taskType?: KnowledgeTaskType
  knowledgeFiles: Record<string, string>
  logger?: Logger
}): string[] {
  const { routerTable, agentId, taskType, knowledgeFiles, logger } = opts
  const available = new Set(Object.keys(knowledgeFiles))
  const routeKey = agentId
    ? [`${agentId}:${taskType ?? 'general'}`, agentId].find((key) =>
        Object.prototype.hasOwnProperty.call(routerTable, key),
      )
    : undefined
  if (routeKey) {
    const routed = routerTable[routeKey]
    const kept = routed.filter((p) => available.has(p))
    const dropped = routed.filter((p) => !available.has(p))
    if (dropped.length > 0) {
      logger?.warn(
        { agentId, taskType, routeKey, dropped },
        '[router] ROUTER.md entry for agent points at files that are not present in knowledgeFiles; check the route table for stale paths.',
      )
    }
    return kept
  }
  // Fallback: include every root-level knowledge file we know about,
  // using the same full-path filter as `KNOWLEDGE_FILES_CONTENTS`.
  return Object.keys(knowledgeFiles).filter((p) => {
    const lowerPath = p.toLowerCase()
    return KNOWLEDGE_FILE_NAMES_LOWERCASE.includes(lowerPath)
  })
}

export function inferKnowledgeTaskType(
  prompt: string | undefined,
): KnowledgeTaskType {
  const text = (prompt ?? '').toLowerCase()
  if (/\b(audit|review across|feature gaps|production readiness)\b/.test(text))
    return 'audit'
  if (/\b(plan|design|architecture|approach|spec)\b/.test(text))
    return 'planning'
  if (/\b(debug|diagnose|investigate|root cause|why does|failure)\b/.test(text))
    return 'debugging'
  if (/\b(test|typecheck|lint|build|validate|verification|ci)\b/.test(text))
    return 'validation'
  if (/\b(implement|fix|change|add|remove|refactor|update|edit)\b/.test(text))
    return 'implementation'
  return 'general'
}

export function getKnowledgeBudgetChars(taskType: KnowledgeTaskType): number {
  switch (taskType) {
    case 'audit':
      return 48_000
    case 'planning':
    case 'debugging':
      return 36_000
    case 'implementation':
      return 30_000
    case 'validation':
      return 20_000
    case 'general':
      return 16_000
  }
}

export function loadRoutedKnowledgeContents(opts: {
  projectRoot: string
  files: string[]
  knowledgeFiles: Record<string, string>
  logger?: Logger
}): Record<string, string> {
  const contents: Record<string, string> = {}
  for (const file of opts.files) {
    if (
      path.isAbsolute(file) ||
      file.split(/[\\/]+/).some((segment) => segment === '..') ||
      isMandatorySensitiveReadPath(file)
    ) {
      opts.logger?.warn(
        { file },
        '[router] Ignoring unsafe routed knowledge path.',
      )
      continue
    }
    if (Object.prototype.hasOwnProperty.call(opts.knowledgeFiles, file)) {
      contents[file] = opts.knowledgeFiles[file]
      continue
    }
    const absolutePath = path.resolve(opts.projectRoot, file)
    const root = path.resolve(opts.projectRoot)
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`))
      continue
    try {
      contents[file] = fs.readFileSync(absolutePath, 'utf8')
    } catch (err) {
      opts.logger?.warn(
        { err, file },
        '[router] Failed to load an explicitly routed knowledge file.',
      )
    }
  }
  return contents
}

/**
 * Render the matched knowledge files into the same `\`\`\`<path>\n<content>\n\`\`\``
 * block format used by `KNOWLEDGE_FILES_CONTENTS`. Returns an empty string
 * when there are no files to render.
 */
export function formatRoutedKnowledgeSection(opts: {
  files: string[]
  knowledgeFiles: Record<string, string>
  maxChars?: number
}): string {
  const { files, knowledgeFiles, maxChars = Number.POSITIVE_INFINITY } = opts
  if (files.length === 0) return ''
  const blocks: string[] = []
  let remaining = maxChars
  for (const p of files) {
    let content = (knowledgeFiles[p] ?? '').trim()
    if (!content || remaining <= 0) continue
    const overhead = p.length + 9
    const contentBudget = Math.max(0, remaining - overhead)
    if (content.length > contentBudget) {
      const notice = '\n\n[Knowledge file truncated to routing budget]'
      content =
        content.slice(0, Math.max(0, contentBudget - notice.length)) + notice
    }
    const block = `\`\`\`${p}\n${content}\n\`\`\``
    blocks.push(block)
    remaining -= block.length + 2
  }
  return blocks.join('\n\n')
}
