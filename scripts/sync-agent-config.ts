import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type SyncFinding = {
  file: string
  line: number
  message: string
}

const CANONICAL_FILES = [
  'AGENTS.md',
  'common/knowledge.md',
  'cli/knowledge.md',
  '.github/knowledge.md',
] as const

const REPO_MAP_SECTION_REGEX = /^##\s+Repo Map\s*$/im
const DOCS_SECTION_REGEX = /^##\s+Docs\s*$/im

// Backtick-quoted paths that look like repo-relative file/dir references.
// Matches `cli/`, `packages/agent-runtime/`, `docs/architecture.md`, etc.
// Requires a `/` after the top-level dir name to avoid matching bare filenames
// like `cli-args.test.ts`.
const BACKTICK_PATH_REGEX =
  /`((?:src|packages|cli|common|sdk|agents|scripts|docs|\.github|\.agents)\/[A-Za-z0-9._\/-]*?)`/g

function projectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

function readLines(filePath: string): string[] {
  return readFileSync(filePath, 'utf8').split('\n')
}

function sectionBounds(
  lines: string[],
  sectionRegex: RegExp,
): { start: number; end: number } | undefined {
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (sectionRegex.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1) return undefined
  // End is the next ## heading after start (or EOF).
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i
      break
    }
  }
  return { start, end }
}

/**
 * Collect all backtick-quoted repo-relative paths from a line range.
 * Returns objects with the path and the 1-indexed line number.
 */
function collectBacktickPaths(
  lines: string[],
  start: number,
  end: number,
): { path: string; line: number }[] {
  const out: { path: string; line: number }[] = []
  for (let i = start; i < end; i++) {
    const line = lines[i]
    let match: RegExpExecArray | null
    BACKTICK_PATH_REGEX.lastIndex = 0
    while ((match = BACKTICK_PATH_REGEX.exec(line)) !== null) {
      out.push({ path: match[1], line: i + 1 })
    }
  }
  return out
}

/**
 * Check that every backtick-quoted directory path in the "Repo Map" section
 * of AGENTS.md exists on disk.
 */
function checkAgentsRepoMap(root: string): SyncFinding[] {
  const findings: SyncFinding[] = []
  const agentsPath = join(root, 'AGENTS.md')
  const lines = readLines(agentsPath)
  const bounds = sectionBounds(lines, REPO_MAP_SECTION_REGEX)
  if (!bounds) return findings
  const refs = collectBacktickPaths(lines, bounds.start, bounds.end)
  for (const ref of refs) {
    const abs = join(root, ref.path)
    if (!existsSync(abs)) {
      findings.push({
        file: 'AGENTS.md',
        line: ref.line,
        message: `Repo Map references \`${ref.path}\` but it does not exist on disk.`,
      })
    }
  }
  return findings
}

/**
 * Check that every `docs/...md` reference in the "Docs" section of AGENTS.md
 * exists on disk.
 */
function checkAgentsDocs(root: string): SyncFinding[] {
  const findings: SyncFinding[] = []
  const agentsPath = join(root, 'AGENTS.md')
  const lines = readLines(agentsPath)
  const bounds = sectionBounds(lines, DOCS_SECTION_REGEX)
  if (!bounds) return findings
  const refs = collectBacktickPaths(lines, bounds.start, bounds.end)
  for (const ref of refs) {
    if (!ref.path.endsWith('.md')) continue
    const abs = join(root, ref.path)
    if (!existsSync(abs)) {
      findings.push({
        file: 'AGENTS.md',
        line: ref.line,
        message: `Docs section references \`${ref.path}\` but the file does not exist.`,
      })
    }
  }
  return findings
}

/**
 * Check backtick-quoted relative file references in cli/knowledge.md.
 * Only checks paths that look like files (have an extension) and are
 * repo-relative (start with one of the known top-level dirs).
 */
function checkCliKnowledgeReferences(root: string): SyncFinding[] {
  const findings: SyncFinding[] = []
  const cliKnowledgePath = join(root, 'cli', 'knowledge.md')
  if (!existsSync(cliKnowledgePath)) return findings
  const lines = readLines(cliKnowledgePath)
  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null
    BACKTICK_PATH_REGEX.lastIndex = 0
    while ((match = BACKTICK_PATH_REGEX.exec(lines[i])) !== null) {
      const refPath = match[1]
      // Only check file-like references (skip bare directory references).
      if (!refPath.includes('.')) continue
      const abs = join(root, refPath)
      if (!existsSync(abs)) {
        findings.push({
          file: 'cli/knowledge.md',
          line: i + 1,
          message: `cli/knowledge.md references \`${refPath}\` but the file does not exist.`,
        })
      }
    }
  }
  return findings
}

/**
 * Check that all 4 canonical config files exist.
 */
function checkCanonicalFilesExist(root: string): SyncFinding[] {
  const findings: SyncFinding[] = []
  for (const file of CANONICAL_FILES) {
    const abs = join(root, file)
    if (!existsSync(abs)) {
      findings.push({
        file,
        line: 0,
        message: `Canonical config file \`${file}\` is missing.`,
      })
    }
  }
  return findings
}

export function findAgentConfigSyncFindings(
  root = projectRoot(),
): SyncFinding[] {
  const findings: SyncFinding[] = []
  findings.push(...checkCanonicalFilesExist(root))
  // Only run the structural checks if AGENTS.md exists.
  if (existsSync(join(root, 'AGENTS.md'))) {
    findings.push(...checkAgentsRepoMap(root))
    findings.push(...checkAgentsDocs(root))
  }
  if (existsSync(join(root, 'cli', 'knowledge.md'))) {
    findings.push(...checkCliKnowledgeReferences(root))
  }
  return findings
}

export function formatAgentConfigSyncReport(findings: SyncFinding[]): string {
  if (findings.length === 0) {
    return 'Agent config sync guard passed: all 4 canonical config files are consistent with repo structure.'
  }
  const lines = [
    'Agent config sync findings — the 4 canonical config files disagree with each other or with repo structure:',
    '',
  ]
  for (const finding of findings) {
    const loc =
      finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file
    lines.push(`  ${loc} — ${finding.message}`)
  }
  lines.push('')
  lines.push(
    'Fix: update the referenced config file(s) to match repo structure, or create the missing files/directories.',
  )
  return lines.join('\n')
}

if (import.meta.main) {
  const findings = findAgentConfigSyncFindings()
  if (findings.length > 0) {
    console.error(formatAgentConfigSyncReport(findings))
    process.exit(1)
  }
  console.log(formatAgentConfigSyncReport(findings))
}
