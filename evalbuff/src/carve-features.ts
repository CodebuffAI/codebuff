/**
 * Feature Carver for evalbuff v2.
 *
 * Instead of using git commits as evals, this:
 * 1. Analyzes a codebase to identify discrete, self-contained features
 * 2. Plans how to cleanly delete each feature
 * 3. Produces diffs that remove the feature (code, docs, references)
 *
 * The output can then be used as eval tasks: give agents a simple prompt
 * to rebuild the deleted feature, judge against the original code.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import OpenAI from 'openai'

// --- Types ---

export interface CarveCandidate {
  id: string
  name: string
  prompt: string // Short, natural prompt to rebuild this feature
  description: string // What this feature does
  files: string[] // Files involved (to delete or modify)
  complexity: 'small' | 'medium' | 'large'
}

export interface CarvePlan {
  candidates: CarveCandidate[]
  reasoning: string
}

export interface FileOperation {
  path: string
  action: 'delete' | 'modify'
  /** For 'modify': the new file content with the feature removed */
  newContent?: string
}

export interface CarvedFeature {
  id: string
  prompt: string
  description: string
  complexity: 'small' | 'medium' | 'large'
  /** Files as they exist before carving (the "ground truth" to rebuild) */
  originalFiles: Record<string, string>
  /** Operations to perform to carve the feature out */
  operations: FileOperation[]
  /** Unified diff of the carving (deletions) */
  diff: string
}

export interface CarveResult {
  repoPath: string
  generationDate: string
  features: CarvedFeature[]
}

// --- OpenAI client ---

function getClient(): OpenAI {
  return new OpenAI() // Uses OPENAI_API_KEY from env
}

const PLANNING_MODEL = 'gpt-5.4'
const CARVING_MODEL = 'gpt-5.4'

// --- Repo analysis helpers ---

function getFileTree(repoPath: string, maxDepth: number = 4): string {
  try {
    // Use git ls-files to only get tracked files
    const files = execSync('git ls-files', {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })
      .trim()
      .split('\n')
      .filter(Boolean)

    // Filter out noise
    const filtered = files.filter((f) => {
      const parts = f.split('/')
      if (parts.length > maxDepth) return false
      if (f.endsWith('.lock') || f.endsWith('.lockb')) return false
      if (f.includes('node_modules/')) return false
      if (f.endsWith('.json') && f.includes('package-lock')) return false
      return true
    })

    return filtered.join('\n')
  } catch {
    return ''
  }
}

function readFile(repoPath: string, filePath: string): string | null {
  try {
    const fullPath = path.join(repoPath, filePath)
    return fs.readFileSync(fullPath, 'utf-8')
  } catch {
    return null
  }
}

function getRepoStats(repoPath: string): string {
  const fileTree = getFileTree(repoPath)
  const files = fileTree.split('\n').filter(Boolean)

  const byExtension: Record<string, number> = {}
  for (const f of files) {
    const ext = path.extname(f) || '(no ext)'
    byExtension[ext] = (byExtension[ext] || 0) + 1
  }

  const sorted = Object.entries(byExtension)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([ext, count]) => `  ${ext}: ${count}`)
    .join('\n')

  return `Total tracked files: ${files.length}\nBy extension:\n${sorted}`
}

// --- Phase 1: Plan features to carve ---

const PLANNING_SYSTEM = `You are an expert software architect analyzing a codebase to identify discrete, self-contained features that can be cleanly "carved out" (deleted) and used as coding evaluation tasks.

## Your Goal

Identify 15-25 features in this codebase that could be cleanly removed and then rebuilt by a coding agent. Each feature should:

1. **Be self-contained** — removing it leaves the rest of the codebase functional (maybe some missing imports/references, but structurally intact)
2. **Be describable in 1-2 sentences** — a developer could ask for it naturally
3. **Be non-trivial but bounded** — not a one-liner, but not "rewrite the whole app"
4. **Cover different aspects** — mix of UI components, API endpoints, utilities, config, tests, etc.
5. **Not overlap** — deleting feature A shouldn't also delete most of feature B

## What makes a good carve candidate

- A React component + its usage sites
- An API endpoint (route + handler + types)
- A CLI subcommand or flag
- A utility module used in a few places
- A feature behind a config/flag
- A test suite for a specific module
- A middleware or plugin
- An integration with an external service

## What makes a BAD candidate

- Core infrastructure that everything depends on (routing, auth framework, database connection)
- A single function that's called in 50 places
- Trivially small changes (rename, config tweak)
- Auto-generated or boilerplate code

## Output Format

Respond with valid JSON matching this schema:
{
  "reasoning": "Your analysis of the codebase and approach to selecting features",
  "candidates": [
    {
      "id": "short-kebab-id",
      "name": "Human readable name",
      "prompt": "Natural prompt a developer would use to ask for this feature, 1-2 sentences",
      "description": "What this feature does and why it exists",
      "files": ["path/to/file1.ts", "path/to/file2.tsx"],
      "complexity": "small|medium|large"
    }
  ]
}

Be thorough in listing ALL files involved in each feature — missing a file means the carve won't be clean.`

export async function planFeatures(repoPath: string): Promise<CarvePlan> {
  const client = getClient()

  const fileTree = getFileTree(repoPath)
  const stats = getRepoStats(repoPath)

  // Read key files for context
  const keyFiles = [
    'package.json',
    'README.md',
    'CLAUDE.md',
    'tsconfig.json',
    'src/index.ts',
    'src/index.tsx',
    'src/app.ts',
    'src/app.tsx',
    'src/main.ts',
    'src/main.tsx',
  ]

  let keyFileContents = ''
  for (const kf of keyFiles) {
    const content = readFile(repoPath, kf)
    if (content) {
      keyFileContents += `\n### ${kf}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\`\n`
    }
  }

  const userPrompt = `## Repository Stats
${stats}

## File Tree
\`\`\`
${fileTree}
\`\`\`

## Key Files
${keyFileContents || '(none found)'}

Please analyze this codebase and identify 15-25 features that can be cleanly carved out for evaluation.`

  console.log('Planning features to carve...')
  const response = await client.chat.completions.create({
    model: PLANNING_MODEL,
    messages: [
      { role: 'system', content: PLANNING_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from planning model')

  const parsed = JSON.parse(text) as CarvePlan
  console.log(`Identified ${parsed.candidates.length} carve candidates`)
  return parsed
}

// --- Phase 2: Execute carving for each feature ---

const CARVING_SYSTEM = `You are a precise code surgeon. Your job is to cleanly remove a specific feature from a codebase.

## Rules

1. **Delete completely** — remove ALL code related to the feature: components, handlers, types, tests, docs, imports, route registrations, etc.
2. **Don't break the rest** — the remaining code should still be structurally valid. Fix imports, remove dead references, etc.
3. **Minimal collateral** — only remove what's necessary. Don't "improve" or refactor surrounding code.
4. **Be thorough** — check for references in other files. If file A imports something from the feature, update file A's imports.

## Output Format

Respond with valid JSON matching this schema:
{
  "operations": [
    {
      "path": "path/to/file.ts",
      "action": "delete"
    },
    {
      "path": "path/to/other-file.ts",
      "action": "modify",
      "newContent": "...full file content with feature removed..."
    }
  ]
}

For "modify" operations, provide the COMPLETE new file content (not a diff). This must be the entire file with only the feature-related code removed.
For "delete" operations, the entire file will be removed.

Only include files that actually need to change. Don't include files that are unaffected.`

export async function carveFeature(
  repoPath: string,
  candidate: CarveCandidate,
): Promise<CarvedFeature | null> {
  const client = getClient()

  // Read all files involved
  const fileContents: Record<string, string> = {}
  for (const filePath of candidate.files) {
    const content = readFile(repoPath, filePath)
    if (content) {
      fileContents[filePath] = content
    }
  }

  if (Object.keys(fileContents).length === 0) {
    console.warn(`  No readable files for feature ${candidate.id}, skipping`)
    return null
  }

  // Also read files that might reference the feature's files (importers)
  const referenceFiles = findReferencingFiles(repoPath, candidate.files)
  for (const refFile of referenceFiles) {
    if (!fileContents[refFile]) {
      const content = readFile(repoPath, refFile)
      if (content) {
        fileContents[refFile] = content
      }
    }
  }

  let filesSection = ''
  for (const [filePath, content] of Object.entries(fileContents)) {
    const isFeatureFile = candidate.files.includes(filePath)
    const label = isFeatureFile ? '(FEATURE FILE)' : '(REFERENCING FILE)'
    filesSection += `\n### ${filePath} ${label}\n\`\`\`\n${content}\n\`\`\`\n`
  }

  const userPrompt = `## Feature to Remove
**Name:** ${candidate.name}
**Description:** ${candidate.description}
**Feature files:** ${candidate.files.join(', ')}

## Current File Contents
${filesSection}

Remove this feature completely. For files that are entirely part of the feature, use "delete". For files that contain the feature mixed with other code, use "modify" and provide the full updated content.`

  console.log(`  Carving feature: ${candidate.id}...`)
  const response = await client.chat.completions.create({
    model: CARVING_MODEL,
    messages: [
      { role: 'system', content: CARVING_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  })

  const text = response.choices[0]?.message?.content
  if (!text) {
    console.warn(`  No response for feature ${candidate.id}`)
    return null
  }

  const parsed = JSON.parse(text) as { operations: FileOperation[] }

  // Compute diff
  const diff = computeDiff(repoPath, parsed.operations)

  // Save original files (only the feature files, for judging)
  const originalFiles: Record<string, string> = {}
  for (const filePath of candidate.files) {
    if (fileContents[filePath]) {
      originalFiles[filePath] = fileContents[filePath]
    }
  }

  return {
    id: candidate.id,
    prompt: candidate.prompt,
    description: candidate.description,
    complexity: candidate.complexity,
    originalFiles,
    operations: parsed.operations,
    diff,
  }
}

// --- Helpers ---

/**
 * Find files that import/reference any of the given files.
 * Uses git grep to find import statements.
 */
function findReferencingFiles(
  repoPath: string,
  featureFiles: string[],
): string[] {
  const referencingFiles = new Set<string>()

  for (const featureFile of featureFiles) {
    // Extract the module name (without extension) for import matching
    const basename = path.basename(featureFile).replace(/\.[^.]+$/, '')
    const dirname = path.dirname(featureFile)

    // Search for imports of this file
    try {
      const results = execSync(
        `git grep -l "${basename}" -- '*.ts' '*.tsx' '*.js' '*.jsx'`,
        {
          cwd: repoPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        },
      )
        .trim()
        .split('\n')
        .filter(Boolean)

      for (const result of results) {
        // Don't include the feature's own files
        if (!featureFiles.includes(result)) {
          referencingFiles.add(result)
        }
      }
    } catch {
      // git grep returns exit code 1 when no matches
    }
  }

  // Limit to reasonable number
  const sorted = [...referencingFiles].slice(0, 20)
  return sorted
}

/**
 * Compute a unified diff from file operations.
 * Creates a temp worktree, applies operations, and diffs.
 */
function computeDiff(
  repoPath: string,
  operations: FileOperation[],
): string {
  const diffs: string[] = []

  for (const op of operations) {
    const fullPath = path.join(repoPath, op.path)
    const originalContent = fs.existsSync(fullPath)
      ? fs.readFileSync(fullPath, 'utf-8')
      : ''

    if (op.action === 'delete') {
      // Show the full file as deleted
      const lines = originalContent.split('\n')
      const header = `--- a/${op.path}\n+++ /dev/null`
      const hunk = `@@ -1,${lines.length} +0,0 @@\n` +
        lines.map((l) => `-${l}`).join('\n')
      diffs.push(`${header}\n${hunk}`)
    } else if (op.action === 'modify' && op.newContent !== undefined) {
      // Compute line-level diff
      const oldLines = originalContent.split('\n')
      const newLines = op.newContent.split('\n')
      // Use a simple diff representation — the full before/after
      const header = `--- a/${op.path}\n+++ b/${op.path}`
      // For now, show full replacement (not optimal but correct)
      const hunk = `@@ -1,${oldLines.length} +1,${newLines.length} @@\n` +
        oldLines.map((l) => `-${l}`).join('\n') + '\n' +
        newLines.map((l) => `+${l}`).join('\n')
      diffs.push(`${header}\n${hunk}`)
    }
  }

  return diffs.join('\n\n')
}

// --- Main orchestrator ---

export async function carveFeatures(
  repoPath: string,
  options: {
    count?: number // Number of features to carve (default: 10)
    outputPath?: string
  } = {},
): Promise<CarveResult> {
  const { count = 10, outputPath } = options

  console.log(`\nCarving features from: ${repoPath}`)
  console.log(`Target: ${count} features\n`)

  // Phase 1: Plan
  const plan = await planFeatures(repoPath)

  console.log(`\nPlanning complete. Reasoning:\n${plan.reasoning}\n`)
  console.log('Candidates:')
  for (const c of plan.candidates) {
    console.log(`  ${c.id} (${c.complexity}): ${c.name}`)
    console.log(`    Prompt: ${c.prompt}`)
    console.log(`    Files: ${c.files.join(', ')}`)
  }

  // Select top N candidates (prefer medium complexity)
  const ranked = [...plan.candidates].sort((a, b) => {
    const complexityOrder = { medium: 0, small: 1, large: 2 }
    return complexityOrder[a.complexity] - complexityOrder[b.complexity]
  })
  const selected = ranked.slice(0, count)

  console.log(`\nSelected ${selected.length} features for carving:\n`)

  // Phase 2: Carve each feature
  const features: CarvedFeature[] = []
  for (const candidate of selected) {
    try {
      const carved = await carveFeature(repoPath, candidate)
      if (carved) {
        features.push(carved)
        console.log(`  ✓ ${carved.id} — ${carved.operations.length} file operations`)
      }
    } catch (error) {
      console.error(`  ✗ ${candidate.id} failed:`, error)
    }
  }

  const result: CarveResult = {
    repoPath,
    generationDate: new Date().toISOString(),
    features,
  }

  // Save output
  const outPath =
    outputPath ||
    path.join(repoPath, `carve-${new Date().toISOString().slice(0, 10)}.json`)
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`\nSaved ${features.length} carved features to: ${outPath}`)

  return result
}

// --- CLI ---

if (import.meta.main) {
  const args = process.argv.slice(2)

  const getArg = (name: string, defaultValue?: string): string => {
    const idx = args.indexOf(`--${name}`)
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Missing required argument: --${name}`)
  }

  const repoPath = getArg('repo')
  const count = parseInt(getArg('count', '10'))
  const outputPath = args.indexOf('--output') >= 0 ? getArg('output') : undefined

  carveFeatures(repoPath, { count, outputPath })
    .then((result) => {
      console.log(`\nDone! Carved ${result.features.length} features.`)
    })
    .catch((error) => {
      console.error('Carving failed:', error)
      process.exit(1)
    })
}
