import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export type WordingViolation = {
  path: string
  line: number
  text: string
}

const FORBIDDEN_PATTERNS = [
  /Openbuff credits/,
  /Codebuff credits/,
  /out of credits/,
  /buy credits/,
  /credit balance/,
  /Openbuff subscription/,
  /Codebuff subscription/,
  /hosted fallback/,
  /hosted backend/,
  /hosted dashboard/,
  /product OAuth/,
  /OAuth login/,
  /freebuff/,
  /Freebuff/,
  /Stripe/,
]

const SKIP_DIRECTORIES = new Set([
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
  'evals/test-repos/',
  'packages/billing/',
  'packages/bigquery/',
]

const ALLOWED_FILES = new Set([
  '.github/knowledge.md',
  'common/knowledge.md',
  'CONTRIBUTING.md',
  'docs/agents-and-tools.md',
  'docs/architecture.md',
  'docs/authentication.md',
  'docs/codebuff-to-openbuff-migration.md',
  'docs/development.md',
  'docs/local-mode.md',
  'docs/request-flow.md',
  'packages/internal/src/db/schema.knowledge.md',
  'README.md',
  'WINDOWS.md',
])

const ALLOWED_CONTEXT_MARKERS = [
  'no backend fallback',
  'no hosted backend',
  'does not require',
  'not require',
  'removed from active',
  'removed from the active',
  'not part of Openbuff',
  'legacy',
  'Legacy',
  'upstream',
  'Provider-owned',
  'provider-owned',
  'BYOK',
  'No Openbuff credits',
  'no Openbuff-hosted',
  'No Codebuff cloud authentication',
  'Do not use this file to introduce',
  'does not use hosted payment-provider',
]

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
      if (
        SKIP_DIRECTORIES.has(entry.name) ||
        shouldSkipPath(projectPath + '/')
      ) {
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

function isAllowed(projectPath: string, line: string): boolean {
  return (
    ALLOWED_FILES.has(projectPath) &&
    ALLOWED_CONTEXT_MARKERS.some((marker) => line.includes(marker))
  )
}

export function findByokWordingViolations(
  root = projectRoot(),
): WordingViolation[] {
  const violations: WordingViolation[] = []

  for (const path of markdownFiles(root)) {
    const projectPath = toProjectPath(root, path)
    const lines = readFileSync(path, 'utf8').split('\n')

    lines.forEach((line, index) => {
      const hasForbiddenPattern = FORBIDDEN_PATTERNS.some((pattern) =>
        pattern.test(line),
      )

      if (hasForbiddenPattern && !isAllowed(projectPath, line)) {
        violations.push({
          path: projectPath,
          line: index + 1,
          text: line.trim(),
        })
      }
    })
  }

  return violations
}

export function formatByokWordingViolations(
  violations: WordingViolation[],
): string {
  if (violations.length === 0) {
    return 'Focused BYOK wording guard passed: no unallowlisted hosted-product wording found.'
  }

  return [
    'Potential forbidden hosted-product wording:',
    ...violations.map(
      (violation) => `${violation.path}:${violation.line}: ${violation.text}`,
    ),
  ].join('\n')
}

if (import.meta.main) {
  const violations = findByokWordingViolations()

  if (violations.length > 0) {
    console.error(formatByokWordingViolations(violations))
    process.exit(1)
  }

  console.log(formatByokWordingViolations(violations))
}
