import {
  readdirSync,
  readFileSync,
  statSync,
  existsSync,
  type Dirent,
} from 'node:fs'
import { dirname, relative, resolve, sep, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Finding = {
  path: string
  line: number
  message: string
}

export type CheckerResult = {
  name: string
  findings: Finding[]
}

export type MemoryDriftGuardResult = {
  score: number
  checkers: CheckerResult[]
}

const SKIP_DIRECTORIES = new Set([
  '.bun-install',
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'web',
])

const SKIP_PATH_PREFIXES = [
  '.agents/sessions/',
  'packages/billing/',
  'packages/bigquery/',
]

const PATH_QUOTED_REGEX =
  /`((?:src|packages|cli|common|sdk|agents|scripts|docs)\/[A-Za-z0-9._\/-]+\.[A-Za-z]+)`/g

const COMMAND_REGEX = /bun\s+(?:--cwd[=\s]+[^\s]+\s+)?run\s+(?:--cwd[=\s]+[^\s]+\s+)?([a-zA-Z0-9:_-]+)/g

const DEPENDENCY_REGEX = /from ['"](@codebuff\/[a-z0-9-]+|@openbuff\/[a-z0-9-]+)['"]/g

const CROSS_FILE_LINK_REGEX = /\[[^\]]+\]\((\.[^)]+\.md)\)/g

const BROKEN_LINK_REGEX = /\[[^\]]+\]\(([^)#][^)]*?)(?:#[^)]*)?\)/g

const SCRIPT_COVERAGE_IGNORE = new Set([
  'byok-wording-guard.ts',
  'memory-drift-guard.ts',
  'index.ts',
])

function projectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

function toProjectPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

function shouldSkipPath(projectPath: string): boolean {
  return SKIP_PATH_PREFIXES.some((prefix) => projectPath.startsWith(prefix))
}

function* markdownFiles(root: string, directory = root): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name)
    const projectPath = toProjectPath(root, absolutePath)

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name) || shouldSkipPath(projectPath + '/')) {
        continue
      }
      yield* markdownFiles(root, absolutePath)
      continue
    }

    if (!entry.isFile() || shouldSkipPath(projectPath)) {
      continue
    }

    if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      yield absolutePath
    }
  }
}

function readLines(filePath: string): string[] {
  return readFileSync(filePath, 'utf8').split('\n')
}

function loadPackageJson(root: string, subdir: string): any {
  const pkgPath = join(root, subdir, 'package.json')
  if (!existsSync(pkgPath)) {
    return undefined
  }
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch (err) {
    console.debug(
      `[memory-drift-guard] loadPackageJson failed for ${pkgPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return undefined
  }
}

function nearestPackageJsonSubdir(root: string, filePath: string): string {
  let dir = dirname(filePath)
  while (dir.startsWith(root)) {
    if (existsSync(join(dir, 'package.json'))) {
      const rel = relative(root, dir)
      return rel === '' ? '.' : rel.split(sep).join('/')
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return '.'
}

function scriptMissingInPkg(
  pkg: any | undefined,
  scriptName: string,
): boolean {
  if (!pkg || typeof pkg !== 'object') {
    return true
  }
  const scripts = pkg.scripts
  return !scripts || typeof scripts !== 'object' || !(scriptName in scripts)
}

function dependencyExists(root: string, pkgName: string): boolean {
  const rootPkg = loadPackageJson(root, '.')
  if (rootPkg) {
    const deps = {
      ...(rootPkg.dependencies || {}),
      ...(rootPkg.devDependencies || {}),
      ...(rootPkg.peerDependencies || {}),
    }
    if (pkgName in deps) {
      return true
    }
    const workspaces: string[] = rootPkg.workspaces
      ? Array.isArray(rootPkg.workspaces)
        ? rootPkg.workspaces
        : rootPkg.workspaces.packages || []
      : []
    for (const ws of workspaces) {
      const cleaned = ws.replace(/\/\*$/, '')
      const wsPath = join(root, cleaned, 'package.json')
      if (existsSync(wsPath)) {
        try {
          const wsPkg = JSON.parse(readFileSync(wsPath, 'utf8'))
          if (wsPkg.name === pkgName) {
            return true
          }
        } catch (err) {
          console.debug(
            `[memory-drift-guard] workspace pkg parse failed for ${wsPath}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }
    }
  }

  if (pkgName.startsWith('@codebuff/') || pkgName.startsWith('@openbuff/')) {
    const localName = pkgName.split('/')[1]
    const pkgDir = join(root, 'packages', localName)
    if (existsSync(join(pkgDir, 'package.json'))) {
      return true
    }
  }
  return false
}

export function checkPath(root: string): Finding[] {
  const findings: Finding[] = []
  for (const filePath of markdownFiles(root)) {
    const projectPath = toProjectPath(root, filePath)
    const lines = readLines(filePath)
    lines.forEach((line, index) => {
      PATH_QUOTED_REGEX.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = PATH_QUOTED_REGEX.exec(line)) !== null) {
        const quoted = match[1]
        if (!existsSync(join(root, quoted))) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `referenced path \`${quoted}\` does not exist`,
          })
        }
      }
    })
  }
  return findings
}

export function checkEdges(root: string): Finding[] {
  const findings: Finding[] = []
  for (const filePath of markdownFiles(root)) {
    const base = filePath.split(sep).pop() || ''
    if (base !== 'knowledge.md' && !base.endsWith('.knowledge.md')) {
      continue
    }
    const projectPath = toProjectPath(root, filePath)
    const lines = readLines(filePath)
    let inSection = false
    lines.forEach((line, index) => {
      if (line.startsWith('## ')) {
        const heading = line.slice(3).toLowerCase()
        inSection =
          heading.includes('architecture') ||
          heading.includes('key areas') ||
          heading.includes('key directories')
        return
      }
      if (!inSection) {
        return
      }
      const bulletDirRegex = /- `([A-Za-z0-9._\/-]+)`/g
      let m: RegExpExecArray | null
      while ((m = bulletDirRegex.exec(line)) !== null) {
        const dirName = m[1]
        if (dirName.includes('.')) {
          continue
        }
        if (!existsSync(join(root, dirName))) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `architectural directory \`${dirName}\` does not exist`,
          })
        }
      }
    })
  }
  return findings
}

export function checkIndexSync(root: string): Finding[] {
  const findings: Finding[] = []
  const indexFiles = ['AGENTS.md', 'ROUTER.md', 'agents/patterns/INDEX.md']
  for (const indexFile of indexFiles) {
    const abs = join(root, indexFile)
    if (!existsSync(abs)) {
      continue
    }
    const projectPath = indexFile
    const lines = readLines(abs)
    const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g
    const quotedRegex = /`((?:src|packages|cli|common|sdk|agents|scripts|docs)\/[A-Za-z0-9._\/-]+(?:\.[A-Za-z]+)?)`/g
    lines.forEach((line, index) => {
      linkRegex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = linkRegex.exec(line)) !== null) {
        const target = m[1]
        if (
          target.startsWith('http://') ||
          target.startsWith('https://') ||
          target.startsWith('#')
        ) {
          continue
        }
        if (!existsSync(join(root, target))) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `index references missing file ${target}`,
          })
        }
      }
      quotedRegex.lastIndex = 0
      while ((m = quotedRegex.exec(line)) !== null) {
        const target = m[1]
        if (!existsSync(join(root, target))) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `index references missing path ${target}`,
          })
        }
      }
    })
  }
  return findings
}

export function checkStaleness(root: string): Finding[] {
  const findings: Finding[] = []
  for (const filePath of markdownFiles(root)) {
    const base = filePath.split(sep).pop() || ''
    if (base !== 'knowledge.md' && !base.endsWith('.knowledge.md')) {
      continue
    }
    const dir = dirname(filePath)
    const siblingSrc = join(dir, 'src')
    if (!existsSync(siblingSrc)) {
      continue
    }
    const projectPath = toProjectPath(root, filePath)
    try {
      const mdMtime = statSync(filePath).mtimeMs
      const srcMtime = statSync(siblingSrc).mtimeMs
      if (srcMtime > mdMtime) {
        findings.push({
          path: projectPath,
          line: 1,
          message: `knowledge.md is older than sibling src/ (stale)`,
        })
      }
    } catch (err) {
      // ignore stat failures
      console.debug(
        `[memory-drift-guard] checkStaleness stat failed for ${filePath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }
  return findings
}

export function checkCommand(root: string): Finding[] {
  const findings: Finding[] = []
  for (const filePath of markdownFiles(root)) {
    const projectPath = toProjectPath(root, filePath)
    const lines = readLines(filePath)
    lines.forEach((line, index) => {
      COMMAND_REGEX.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = COMMAND_REGEX.exec(line)) !== null) {
        const fullMatch = match[0]
        const scriptName = match[1]
        // Skip flag fragments (e.g. `--cwd` captured when a placeholder like
        // `<workspace>` follows the flag instead of a real cwd value).
        if (scriptName.startsWith('--')) {
          continue
        }
        // Skip file-path fragments. The regex char class excludes `/`, so a
        // command like `bun run evals/foo.ts` captures only `evals`. Detect
        // this by checking if the next char in the line is `/`.
        const captureEnd = match.index + fullMatch.length
        if (captureEnd < line.length && line[captureEnd] === '/') {
          continue
        }
        // Skip degenerate single-char captures.
        if (scriptName.length <= 1) {
          continue
        }
        const cwdMatch = fullMatch.match(/--cwd[=\s]+([^\s]+)/)
        let subdir = cwdMatch ? cwdMatch[1] : ''
        // If --cwd points outside the project root (absolute path not under
        // root), ignore it and fall back to cwd inference.
        if (subdir && subdir.startsWith('/') && !subdir.startsWith(root + sep)) {
          subdir = ''
        }
        if (!subdir) {
          // Infer cwd from a `cd <dir> &&` prefix earlier on the same line.
          const cdMatch = line.match(/cd\s+([^\s&]+)\s*&&/)
          if (cdMatch) {
            const candidate = cdMatch[1]
            // Reject out-of-repo absolute paths (e.g. transcript lines that
            // reference a sibling checkout like /home/user/Code/CLI/codebuff).
            if (
              !candidate.startsWith('/') ||
              candidate.startsWith(root + sep)
            ) {
              subdir = candidate
            }
          }
        }
        if (!subdir) {
          // Multi-line cd prefix: look back at preceding lines within the
          // same code block for a standalone `cd <dir>` line (common in
          // bash snippets like `cd cli\nbun run test:tmux-poc`). Stop at a
          // blank line, a closing code fence, or a ~10-line window.
          for (let prev = index - 1; prev >= 0 && prev >= index - 10; prev--) {
            const prevLine = lines[prev].trim()
            if (prevLine === '' || prevLine.startsWith('```')) {
              break
            }
            const prevCd = prevLine.match(/^cd\s+([^\s&]+)\s*$/)
            if (prevCd) {
              const candidate = prevCd[1]
              if (
                !candidate.startsWith('/') ||
                candidate.startsWith(root + sep)
              ) {
                subdir = candidate
              }
              break
            }
            // If the previous line itself runs a command (e.g. `bun run ...`),
            // don't cross it — the cd likely isn't on this block's path.
            if (/(bun|npm|yarn|pnpm)\s+run\s/.test(prevLine)) {
              break
            }
          }
        }
        if (!subdir) {
          // Fall back to the nearest package.json ancestor of the markdown
          // file. A README in `cli/` should resolve against `cli/package.json`,
          // not the root.
          subdir = nearestPackageJsonSubdir(root, filePath)
        }
        const pkg = loadPackageJson(root, subdir)
        if (scriptMissingInPkg(pkg, scriptName)) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `command references missing script \`${scriptName}\` in ${subdir === '.' ? 'root' : subdir}/package.json`,
          })
        }
      }
    })
  }
  return findings
}

export function checkDependency(root: string): Finding[] {
  const findings: Finding[] = []
  for (const filePath of markdownFiles(root)) {
    const projectPath = toProjectPath(root, filePath)
    const lines = readLines(filePath)
    lines.forEach((line, index) => {
      DEPENDENCY_REGEX.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = DEPENDENCY_REGEX.exec(line)) !== null) {
        const pkgName = match[1]
        if (!dependencyExists(root, pkgName)) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `references dependency \`${pkgName}\` not present in repo`,
          })
        }
      }
    })
  }
  return findings
}

export function checkCrossFile(root: string): Finding[] {
  const findings: Finding[] = []
  for (const filePath of markdownFiles(root)) {
    const projectPath = toProjectPath(root, filePath)
    const dir = dirname(filePath)
    const lines = readLines(filePath)
    lines.forEach((line, index) => {
      CROSS_FILE_LINK_REGEX.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = CROSS_FILE_LINK_REGEX.exec(line)) !== null) {
        const target = match[1]
        const resolved = resolve(dir, target)
        if (!existsSync(resolved)) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `cross-file link ${target} does not exist`,
          })
        }
      }
    })
  }
  return findings
}

function listTopLevelScripts(root: string): string[] {
  const scriptsDir = join(root, 'scripts')
  if (!existsSync(scriptsDir)) {
    return []
  }
  let entries: Dirent[] = []
  try {
    entries = readdirSync(scriptsDir, { withFileTypes: true })
  } catch (err) {
    console.debug(
      `[memory-drift-guard] listTopLevelScripts readdir failed for ${scriptsDir}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return []
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => e.name)
}

export function checkScriptCoverage(root: string): Finding[] {
  const findings: Finding[] = []
  const scripts = listTopLevelScripts(root)
  const scriptsPkg = loadPackageJson(root, 'scripts')
  const rootPkg = loadPackageJson(root, '.')
  const scriptValues: string[] = []
  for (const pkg of [scriptsPkg, rootPkg]) {
    if (pkg?.scripts && typeof pkg.scripts === 'object') {
      for (const v of Object.values(pkg.scripts)) {
        if (typeof v === 'string') {
          scriptValues.push(v)
        }
      }
    }
  }

  // Allowlist file: scripts/.coverage-allow — one basename per line. Used for
  // standalone utility scripts that are run directly via `bun scripts/foo.ts`
  // and are intentionally not referenced in package.json or markdown.
  const allowlistPath = join(root, 'scripts', '.coverage-allow')
  const allowlist = new Set<string>()
  if (existsSync(allowlistPath)) {
    for (const line of readLines(allowlistPath)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        allowlist.add(trimmed)
      }
    }
  }

  const allMdContent: string[] = []
  for (const filePath of markdownFiles(root)) {
    try {
      allMdContent.push(readFileSync(filePath, 'utf8'))
    } catch (err) {
      console.debug(
        `[memory-drift-guard] checkScriptCoverage read failed for ${filePath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  for (const scriptName of scripts) {
    if (SCRIPT_COVERAGE_IGNORE.has(scriptName)) {
      continue
    }
    if (allowlist.has(scriptName)) {
      continue
    }
    const inMarkdown = allMdContent.some((c) => c.includes(scriptName))
    const inScriptsPkg = scriptValues.some((v) => v.includes(scriptName))
    if (!inMarkdown && !inScriptsPkg) {
      findings.push({
        path: `scripts/${scriptName}`,
        line: 1,
        message: `script not mentioned in any markdown file or scripts/package.json`,
      })
    }
  }
  return findings
}

export function checkToolConfigSync(root: string): Finding[] {
  const findings: Finding[] = []
  const routerPath = join(root, 'ROUTER.md')
  if (!existsSync(routerPath)) {
    return findings
  }
  const projectPath = 'ROUTER.md'
  const lines = readLines(routerPath)
  const quotedFileRegex = /`([A-Za-z0-9._\/-]+\.[A-Za-z]+)`/g
  lines.forEach((line, index) => {
    if (!line.startsWith('|')) {
      return
    }
    quotedFileRegex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = quotedFileRegex.exec(line)) !== null) {
      const target = match[1]
      if (!existsSync(join(root, target))) {
        findings.push({
          path: projectPath,
          line: index + 1,
          message: `ROUTER table references missing file ${target}`,
        })
      }
    }
  })
  return findings
}

export function checkTodoFixme(root: string): Finding[] {
  const findings: Finding[] = []
  // Match TODO/FIXME/XXX only when followed by `:` or `(` (i.e. an actual
  // unresolved marker), not when used as a feature/section name like
  // "TODO List Positioning" or "FIXME notes".
  const markerRegex = /\b(TODO|FIXME|XXX)\b[:(]/
  for (const filePath of markdownFiles(root)) {
    const projectPath = toProjectPath(root, filePath)
    const lines = readLines(filePath)
    lines.forEach((line, index) => {
      if (line.includes('<!-- allow-todo -->')) {
        return
      }
      if (markerRegex.test(line)) {
        findings.push({
          path: projectPath,
          line: index + 1,
          message: `unresolved TODO/FIXME marker in knowledge file`,
        })
      }
    })
  }
  return findings
}

export function checkBrokenLink(root: string): Finding[] {
  const findings: Finding[] = []
  for (const filePath of markdownFiles(root)) {
    const projectPath = toProjectPath(root, filePath)
    const dir = dirname(filePath)
    const lines = readLines(filePath)
    lines.forEach((line, index) => {
      BROKEN_LINK_REGEX.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = BROKEN_LINK_REGEX.exec(line)) !== null) {
        const target = match[1]
        if (
          target.startsWith('http://') ||
          target.startsWith('https://') ||
          target.startsWith('#')
        ) {
          continue
        }
        const resolved = resolve(dir, target)
        if (!existsSync(resolved)) {
          findings.push({
            path: projectPath,
            line: index + 1,
            message: `broken link ${target}`,
          })
        }
      }
    })
  }
  return findings
}

export const CHECKERS: Array<{ name: string; run: (root: string) => Finding[] }> = [
  { name: 'path', run: checkPath },
  { name: 'edges', run: checkEdges },
  { name: 'index-sync', run: checkIndexSync },
  { name: 'staleness', run: checkStaleness },
  { name: 'command', run: checkCommand },
  { name: 'dependency', run: checkDependency },
  { name: 'cross-file', run: checkCrossFile },
  { name: 'script-coverage', run: checkScriptCoverage },
  { name: 'tool-config-sync', run: checkToolConfigSync },
  { name: 'todo-fixme', run: checkTodoFixme },
  { name: 'broken-link', run: checkBrokenLink },
]

export function runMemoryDriftGuard(root = projectRoot()): MemoryDriftGuardResult {
  const checkers: CheckerResult[] = CHECKERS.map(({ name, run }) => ({
    name,
    findings: run(root),
  }))
  const score = checkers.reduce((sum, c) => sum + c.findings.length, 0)
  return { score, checkers }
}

export function formatMemoryDriftReport(result: MemoryDriftGuardResult): string {
  if (result.score === 0) {
    return `Memory drift guard passed: 0 findings across ${result.checkers.length} checkers.`
  }
  const header = `Memory drift guard: ${result.score} finding(s) across ${result.checkers.length} checker(s)`
  const blocks: string[] = []
  for (const checker of result.checkers) {
    if (checker.findings.length === 0) {
      continue
    }
    blocks.push(`## ${checker.name} (${checker.findings.length})`)
    for (const finding of checker.findings) {
      blocks.push(`${finding.path}:${finding.line}: ${finding.message}`)
    }
  }
  return [header, ...blocks].join('\n')
}

if (import.meta.main) {
  const result = runMemoryDriftGuard()
  const report = formatMemoryDriftReport(result)
  if (result.score > 0) {
    console.error(report)
    process.exit(1)
  }
  console.log(report)
}