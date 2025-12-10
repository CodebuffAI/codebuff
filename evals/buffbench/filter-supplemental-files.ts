import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import type { EvalDataV2 } from './types'

/**
 * Check if a file exists at a specific git commit
 */
function fileExistsAtCommit(
  repoPath: string,
  commitSha: string,
  filePath: string,
): boolean {
  try {
    execSync(`git show ${commitSha}:${JSON.stringify(filePath)}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

/**
 * Filter supplementalFiles to only include files that exist at parentSha
 */
export function filterSupplementalFiles(
  repoPath: string,
  parentSha: string,
  supplementalFiles: string[],
): { valid: string[]; removed: string[] } {
  const valid: string[] = []
  const removed: string[] = []

  for (const filePath of supplementalFiles) {
    if (fileExistsAtCommit(repoPath, parentSha, filePath)) {
      valid.push(filePath)
    } else {
      removed.push(filePath)
    }
  }

  return { valid, removed }
}

/**
 * Clone a repo and fetch all necessary commits for validation
 */
function setupRepoForValidation(
  repoUrl: string,
  parentShas: string[],
): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-filter-'))
  const repoDir = path.join(tempDir, 'repo')

  console.log(`Cloning ${repoUrl}...`)
  execSync(`git clone --bare ${repoUrl} ${repoDir}`, { stdio: 'ignore' })

  // Fetch all the parent commits we need to check
  const uniqueShas = [...new Set(parentShas)]
  console.log(`Fetching ${uniqueShas.length} commits...`)
  
  for (const sha of uniqueShas) {
    try {
      execSync(`git fetch origin ${sha}`, {
        cwd: repoDir,
        stdio: 'ignore',
      })
    } catch {
      // Commit might already exist from clone
    }
  }

  return repoDir
}

/**
 * Clean up a temporary repo directory
 */
function cleanupRepo(repoDir: string): void {
  const tempDir = path.dirname(repoDir)
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch (error) {
    console.warn(`Failed to clean up temporary directory: ${error}`)
  }
}

/**
 * Process an eval file and filter out invalid supplementalFiles
 */
function processEvalFile(
  evalFilePath: string,
  dryRun: boolean,
): { totalRemoved: number; commitUpdates: { id: string; removed: string[] }[] } {
  const evalData: EvalDataV2 = JSON.parse(fs.readFileSync(evalFilePath, 'utf-8'))
  const commitUpdates: { id: string; removed: string[] }[] = []
  let totalRemoved = 0

  // Get repoUrl from eval file
  const repoUrl = evalData.repoUrl
  if (!repoUrl) {
    console.log(`⚠️  No repoUrl found in eval file, skipping`)
    return { totalRemoved: 0, commitUpdates: [] }
  }

  // Collect all parentShas we need to validate against
  const parentShas = evalData.evalCommits.map((c) => c.parentSha)

  // Clone the repo for validation
  let repoPath: string
  try {
    repoPath = setupRepoForValidation(repoUrl, parentShas)
  } catch (error) {
    console.log(`⚠️  Failed to clone repo ${repoUrl}: ${error}`)
    return { totalRemoved: 0, commitUpdates: [] }
  }

  try {
    for (const commit of evalData.evalCommits) {
      const { valid, removed } = filterSupplementalFiles(
        repoPath,
        commit.parentSha,
        commit.supplementalFiles,
      )

      if (removed.length > 0) {
        commitUpdates.push({ id: commit.id, removed })
        totalRemoved += removed.length
        commit.supplementalFiles = valid
      }
    }

    if (!dryRun && totalRemoved > 0) {
      fs.writeFileSync(evalFilePath, JSON.stringify(evalData, null, 2))
    }
  } finally {
    cleanupRepo(repoPath)
  }

  return { totalRemoved, commitUpdates }
}

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const evalFiles = args.filter((arg) => !arg.startsWith('--'))

  if (evalFiles.length === 0) {
    console.log('Usage: bun run filter-supplemental-files.ts [--dry-run] <eval-file.json> ...')
    console.log('')
    console.log('Options:')
    console.log('  --dry-run  Show what would be removed without modifying files')
    console.log('')
    console.log('Examples:')
    console.log('  bun run filter-supplemental-files.ts eval-manifold2.json')
    console.log('  bun run filter-supplemental-files.ts --dry-run eval-*2.json')
    process.exit(1)
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Processing ${evalFiles.length} eval file(s)...\n`)

  let grandTotalRemoved = 0

  for (const evalFile of evalFiles) {
    const evalFilePath = path.resolve(evalFile)
    
    if (!fs.existsSync(evalFilePath)) {
      console.log(`⚠️  File not found: ${evalFile}`)
      continue
    }

    console.log(`\n=== ${path.basename(evalFile)} ===`)

    const { totalRemoved, commitUpdates } = processEvalFile(
      evalFilePath,
      dryRun,
    )

    if (commitUpdates.length === 0) {
      console.log('✅ No invalid supplementalFiles found')
    } else {
      for (const { id, removed } of commitUpdates) {
        console.log(`\n[${id}] Removed ${removed.length} file(s):`)
        for (const file of removed) {
          console.log(`  - ${file}`)
        }
      }
      console.log(`\n${dryRun ? 'Would remove' : 'Removed'} ${totalRemoved} total files from ${commitUpdates.length} commits`)
      grandTotalRemoved += totalRemoved
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`${dryRun ? '[DRY RUN] Would remove' : 'Removed'} ${grandTotalRemoved} total supplementalFiles across all files`)

  if (dryRun && grandTotalRemoved > 0) {
    console.log('\nRun without --dry-run to apply changes.')
  }
}

if (import.meta.main) {
  main()
}
