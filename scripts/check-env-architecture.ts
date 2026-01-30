import fs from 'fs'
import path from 'path'

import * as ts from 'typescript'

/**
 * Package configuration - intentionally minimal.
 * Env helper files are auto-detected, not hardcoded.
 */
type PackageConfig = {
  name: string
  rootDir: string
  enforceRestrictedImports: boolean
  // Edge cases that legitimately need process.env but aren't env helpers
  // (e.g., passing env to subprocesses). These should be minimized over time.
  additionalProcessEnvAllowlist?: string[]
}

const cwd = process.cwd()

const normalizePath = (filePath: string): string => filePath.replace(/\\/g, '/')

const isTestFile = (relativePath: string): boolean => {
  if (relativePath.includes('/__tests__/')) return true
  if (relativePath.includes('/__test__/')) return true
  if (relativePath.endsWith('.test.ts')) return true
  if (relativePath.endsWith('.test.tsx')) return true
  if (relativePath.endsWith('.spec.ts')) return true
  if (relativePath.endsWith('.spec.tsx')) return true
  if (relativePath.endsWith('.integration.test.ts')) return true
  if (relativePath.endsWith('.integration.test.tsx')) return true
  if (relativePath.includes('/e2e/')) return true
  return false
}

const isUseClientModule = (sourceFile: ts.SourceFile): boolean => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt)) return false
    const expr = stmt.expression
    if (!ts.isStringLiteral(expr)) return false
    if (expr.text === 'use client') return true
  }
  return false
}

const isInternalImport = (moduleSpecifier: string): boolean =>
  moduleSpecifier === '@codebuff/internal' ||
  moduleSpecifier.startsWith('@codebuff/internal/')

const collectSourceFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.next'
      ) {
        continue
      }
      files.push(...collectSourceFiles(fullPath))
      continue
    }

    if (!entry.isFile()) continue
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) continue
    files.push(fullPath)
  }

  return files
}

// Packages to check - this list is intentional configuration
const packageConfigs: PackageConfig[] = [
  {
    name: 'cli',
    rootDir: path.join(cwd, 'cli', 'src'),
    enforceRestrictedImports: true,
    additionalProcessEnvAllowlist: [
      'cli/src/init/init-direnv.ts', // Loads direnv vars into process.env at startup
    ],
  },
  {
    name: 'sdk',
    rootDir: path.join(cwd, 'sdk', 'src'),
    enforceRestrictedImports: true,
  },
]

type Violation = {
  file: string
  message: string
}

const violations: Violation[] = []

const ENV_PROCESS_MODULE = '@codebuff/common/env-process'
const ENV_TYPES_MODULE = '@codebuff/common/types/contracts/env'
const INTERNAL_ENV_MODULE = '@codebuff/internal/env'

const getLine = (sourceFile: ts.SourceFile, pos: number): number =>
  ts.getLineAndCharacterOfPosition(sourceFile, pos).line + 1

const isProcessIdentifierExpr = (expr: ts.Expression): boolean => {
  if (ts.isIdentifier(expr)) return expr.text === 'process'
  if (!ts.isPropertyAccessExpression(expr)) return false
  if (expr.name.text !== 'process') return false
  return (
    ts.isIdentifier(expr.expression) &&
    (expr.expression.text === 'globalThis' || expr.expression.text === 'global')
  )
}

const isProcessEnvAccess = (
  node: ts.Node,
): node is ts.PropertyAccessExpression | ts.ElementAccessExpression => {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === 'env' && isProcessIdentifierExpr(node.expression)
  }
  if (ts.isElementAccessExpression(node)) {
    const arg = node.argumentExpression
    return (
      isProcessIdentifierExpr(node.expression) &&
      !!arg &&
      ts.isStringLiteral(arg) &&
      arg.text === 'env'
    )
  }
  return false
}

type ImportInfo = {
  moduleSpecifier: string
  kind: 'named' | 'namespace' | 'default' | 'sideEffect'
  named: Array<{ imported: string; local: string; line: number }>
  namespaceLocalName?: string
  line: number
}

const getImportInfo = (
  sourceFile: ts.SourceFile,
  node: ts.ImportDeclaration,
): ImportInfo | null => {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return null
  const moduleSpecifier = node.moduleSpecifier.text
  const line = getLine(sourceFile, node.getStart(sourceFile))

  const importClause = node.importClause
  if (!importClause) {
    return { moduleSpecifier, kind: 'sideEffect', named: [], line }
  }

  if (importClause.namedBindings) {
    if (ts.isNamedImports(importClause.namedBindings)) {
      const named = importClause.namedBindings.elements.map((el) => {
        const imported = (el.propertyName ?? el.name).text
        const local = el.name.text
        return {
          imported,
          local,
          line: getLine(sourceFile, el.getStart(sourceFile)),
        }
      })
      return { moduleSpecifier, kind: 'named', named, line }
    }

    if (ts.isNamespaceImport(importClause.namedBindings)) {
      return {
        moduleSpecifier,
        kind: 'namespace',
        named: [],
        namespaceLocalName: importClause.namedBindings.name.text,
        line,
      }
    }
  }

  if (importClause.name) {
    return { moduleSpecifier, kind: 'default', named: [], line }
  }

  return { moduleSpecifier, kind: 'sideEffect', named: [], line }
}

const getModuleSpecifierText = (
  moduleSpecifier: ts.Expression | ts.ModuleReference | undefined,
): string | null => {
  if (!moduleSpecifier) return null
  if (ts.isStringLiteral(moduleSpecifier as any)) {
    return (moduleSpecifier as ts.StringLiteral).text
  }
  return null
}

const isDynamicImportCall = (
  node: ts.Node,
): node is ts.CallExpression & {
  arguments: readonly [ts.Expression, ...ts.Expression[]]
} => {
  if (!ts.isCallExpression(node)) return false
  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return false
  if (node.arguments.length < 1) return false
  return true
}

/**
 * Detect if a file is an "env helper" by checking if it imports getBaseEnv
 * from @codebuff/common/env-process. These files are the designated entry points for env access.
 */
const isEnvHelperFile = (sourceFile: ts.SourceFile): boolean => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const info = getImportInfo(sourceFile, stmt)
    if (!info || info.moduleSpecifier !== ENV_PROCESS_MODULE) continue

    if (info.kind === 'named') {
      for (const spec of info.named) {
        if (spec.imported === 'getBaseEnv') {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Find the exported get*Env function name in an env helper file.
 * Used for error messages to suggest the correct helper to use.
 */
const findExportedEnvHelperName = (
  sourceFile: ts.SourceFile,
): string | null => {
  for (const stmt of sourceFile.statements) {
    // Handle: export const getXxxEnv = ...
    if (
      ts.isVariableStatement(stmt) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text
          if (name.startsWith('get') && name.endsWith('Env')) {
            return name
          }
        }
      }
    }

    // Handle: export function getXxxEnv() { ... }
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      stmt.name
    ) {
      const name = stmt.name.text
      if (name.startsWith('get') && name.endsWith('Env')) {
        return name
      }
    }
  }
  return null
}

/**
 * Discover env helper files and their exported helper names for a package.
 */
type EnvHelperInfo = {
  filePath: string
  helperName: string | null
}

const discoverEnvHelpers = (rootDir: string): EnvHelperInfo[] => {
  const helpers: EnvHelperInfo[] = []
  const files = collectSourceFiles(rootDir)

  for (const absolutePath of files) {
    const relativePath = normalizePath(path.relative(cwd, absolutePath))
    if (isTestFile(relativePath)) continue

    const content = fs.readFileSync(absolutePath, 'utf8')
    if (!content.includes(ENV_PROCESS_MODULE)) continue

    const sourceFile = ts.createSourceFile(
      relativePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    if (isEnvHelperFile(sourceFile)) {
      helpers.push({
        filePath: relativePath,
        helperName: findExportedEnvHelperName(sourceFile),
      })
    }
  }

  return helpers
}

// Process each package
for (const config of packageConfigs) {
  // Auto-discover env helper files for this package
  const envHelpers = discoverEnvHelpers(config.rootDir)
  const envHelperPaths = new Set(envHelpers.map((h) => h.filePath))

  // Build combined allowlist: auto-detected + additional exceptions
  const allowProcessEnvIn = new Set([
    ...envHelperPaths,
    ...(config.additionalProcessEnvAllowlist ?? []),
  ])
  const allowEnvProcessImportsIn = envHelperPaths

  // Get the helper name for error messages (use first one found, or fallback)
  const foundHelper = envHelpers.find((h) => h.helperName)?.helperName
  const suggestedHelper = foundHelper
    ? `${foundHelper}()`
    : `get${config.name.charAt(0).toUpperCase() + config.name.slice(1)}Env()`

  const files = collectSourceFiles(config.rootDir)

  for (const absolutePath of files) {
    const relativePath = normalizePath(path.relative(cwd, absolutePath))
    if (isTestFile(relativePath)) continue

    const content = fs.readFileSync(absolutePath, 'utf8')
    const maybeNeedsAst =
      content.includes('process') ||
      content.includes(ENV_PROCESS_MODULE) ||
      content.includes(ENV_TYPES_MODULE)

    if (!maybeNeedsAst) continue

    const sourceFile = ts.createSourceFile(
      relativePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    const processEnvLines = new Set<number>()
    const envProcessImportLines: number[] = []
    const envProcessRestrictedImportLines: number[] = []
    const processEnvTypeImportLines: number[] = []

    const visit = (node: ts.Node) => {
      if (isProcessEnvAccess(node)) {
        processEnvLines.add(getLine(sourceFile, node.getStart(sourceFile)))
      }

      if (config.enforceRestrictedImports && ts.isImportDeclaration(node)) {
        const info = getImportInfo(sourceFile, node)
        if (info) {
          if (info.moduleSpecifier === ENV_PROCESS_MODULE) {
            if (!allowEnvProcessImportsIn.has(relativePath)) {
              envProcessImportLines.push(info.line)
            }

            if (info.kind !== 'named') {
              envProcessRestrictedImportLines.push(info.line)
            } else {
              for (const spec of info.named) {
                if (
                  spec.imported === 'getProcessEnv' ||
                  spec.imported === 'processEnv'
                ) {
                  envProcessRestrictedImportLines.push(spec.line)
                }
              }
            }
          }

          if (info.moduleSpecifier === ENV_TYPES_MODULE) {
            if (info.kind !== 'named') {
              processEnvTypeImportLines.push(info.line)
            } else {
              for (const spec of info.named) {
                if (spec.imported === 'ProcessEnv') {
                  processEnvTypeImportLines.push(spec.line)
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    if (processEnvLines.size > 0 && !allowProcessEnvIn.has(relativePath)) {
      const lines = Array.from(processEnvLines).sort((a, b) => a - b)
      const lineInfo = lines.length ? ` (lines ${lines.join(', ')})` : ''
      violations.push({
        file: relativePath,
        message: `Disallowed process.env usage${lineInfo}`,
      })
    }

    if (!config.enforceRestrictedImports) continue

    if (envProcessImportLines.length > 0) {
      const lines = Array.from(new Set(envProcessImportLines)).sort(
        (a, b) => a - b,
      )
      const lineInfo = lines.length ? ` (lines ${lines.join(', ')})` : ''
      violations.push({
        file: relativePath,
        message: `Disallowed import from ${ENV_PROCESS_MODULE}${lineInfo}; use ${suggestedHelper} from the package env helper`,
      })
    }

    if (envProcessRestrictedImportLines.length > 0) {
      const lines = Array.from(new Set(envProcessRestrictedImportLines)).sort(
        (a, b) => a - b,
      )
      const lineInfo = lines.length ? ` (lines ${lines.join(', ')})` : ''
      violations.push({
        file: relativePath,
        message: `Do not import getProcessEnv/processEnv or namespace-import ${ENV_PROCESS_MODULE}${lineInfo}; use ${suggestedHelper} instead`,
      })
    }

    if (processEnvTypeImportLines.length > 0) {
      const lines = Array.from(new Set(processEnvTypeImportLines)).sort(
        (a, b) => a - b,
      )
      const lineInfo = lines.length ? ` (lines ${lines.join(', ')})` : ''
      violations.push({
        file: relativePath,
        message: `Do not import ProcessEnv from ${ENV_TYPES_MODULE}${lineInfo}; use package-specific env types instead`,
      })
    }
  }
}

// common: do not allow importing from @codebuff/internal (layering + secret safety)
{
  const rootDir = path.join(cwd, 'common', 'src')
  const files = collectSourceFiles(rootDir)

  for (const absolutePath of files) {
    const relativePath = normalizePath(path.relative(cwd, absolutePath))
    const content = fs.readFileSync(absolutePath, 'utf8')
    if (!content.includes('@codebuff/internal')) continue

    const sourceFile = ts.createSourceFile(
      relativePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    const internalImportLines: number[] = []

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const info = getImportInfo(sourceFile, node)
        if (info && isInternalImport(info.moduleSpecifier)) {
          internalImportLines.push(info.line)
        }
      }

      if (ts.isExportDeclaration(node)) {
        const spec = getModuleSpecifierText(node.moduleSpecifier as any)
        if (spec && isInternalImport(spec)) {
          internalImportLines.push(
            getLine(sourceFile, node.getStart(sourceFile)),
          )
        }
      }

      if (isDynamicImportCall(node)) {
        const first = node.arguments[0]
        if (ts.isStringLiteral(first) && isInternalImport(first.text)) {
          internalImportLines.push(
            getLine(sourceFile, node.getStart(sourceFile)),
          )
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    if (internalImportLines.length > 0) {
      const lines = Array.from(new Set(internalImportLines)).sort(
        (a, b) => a - b,
      )
      const lineInfo = lines.length ? ` (lines ${lines.join(', ')})` : ''
      violations.push({
        file: relativePath,
        message: `Disallowed import from @codebuff/internal${lineInfo}; common must not depend on internal (inject server env/deps instead)`,
      })
    }
  }
}

// web: prevent Client Components from importing @codebuff/internal/env
{
  const rootDir = path.join(cwd, 'web', 'src')
  const files = collectSourceFiles(rootDir)

  for (const absolutePath of files) {
    const relativePath = normalizePath(path.relative(cwd, absolutePath))
    const content = fs.readFileSync(absolutePath, 'utf8')
    if (
      !content.includes('use client') ||
      !content.includes('@codebuff/internal')
    ) {
      continue
    }

    const sourceFile = ts.createSourceFile(
      relativePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    if (!isUseClientModule(sourceFile)) continue

    const internalEnvImportLines: number[] = []

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const info = getImportInfo(sourceFile, node)
        if (info && info.moduleSpecifier === INTERNAL_ENV_MODULE) {
          internalEnvImportLines.push(info.line)
        }
      }

      if (ts.isExportDeclaration(node)) {
        const spec = getModuleSpecifierText(node.moduleSpecifier as any)
        if (spec && spec === INTERNAL_ENV_MODULE) {
          internalEnvImportLines.push(
            getLine(sourceFile, node.getStart(sourceFile)),
          )
        }
      }

      if (isDynamicImportCall(node)) {
        const first = node.arguments[0]
        if (ts.isStringLiteral(first) && first.text === INTERNAL_ENV_MODULE) {
          internalEnvImportLines.push(
            getLine(sourceFile, node.getStart(sourceFile)),
          )
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    if (internalEnvImportLines.length > 0) {
      const lines = Array.from(new Set(internalEnvImportLines)).sort(
        (a, b) => a - b,
      )
      const lineInfo = lines.length ? ` (lines ${lines.join(', ')})` : ''
      violations.push({
        file: relativePath,
        message: `Disallowed import from ${INTERNAL_ENV_MODULE}${lineInfo}; Client Components must not access server secrets`,
      })
    }
  }
}

if (violations.length > 0) {
  const grouped = new Map<string, string[]>()
  for (const v of violations) {
    const list = grouped.get(v.file) ?? []
    list.push(v.message)
    grouped.set(v.file, list)
  }

  const lines: string[] = []
  lines.push('Env architecture check failed:')
  for (const [file, messages] of grouped.entries()) {
    for (const msg of messages) {
      lines.push(`- ${file}: ${msg}`)
    }
  }

  console.error(lines.join('\n'))
  process.exit(1)
}

// Success is silent - Unix philosophy: no news is good news
