#!/usr/bin/env bun

import fs from 'fs'
import path from 'path'

import { pickCommits } from '../git-evals/pick-commits'
import { generateEvalFileV2 } from './gen-evals'

export async function generateRepoEvalV2(repoUrl: string): Promise<void> {
  console.log(`\n=== Git Evals V2: Generating Eval for ${repoUrl} ===\n`)

  console.log(`STEP 1: Picking commits for ${repoUrl}`)
  const tmpDir = fs.mkdtempSync(
    path.join(require('os').tmpdir(), 'git-evals2-'),
  )
  const selectedCommitsOutputPath = path.join(tmpDir, 'selected-commits.json')
  const clientSessionId = `gen-repo-eval-v2-${repoUrl}-${Date.now()}`

  await pickCommits({
    repoUrl,
    outputPath: selectedCommitsOutputPath,
    clientSessionId,
  })

  const selectedCommitsData = JSON.parse(
    fs.readFileSync(selectedCommitsOutputPath, 'utf8'),
  )
  const { repoUrl: gitRepoUrl, selectedCommits, repoName } = selectedCommitsData

  const commitShas = selectedCommits.map((c: any) => c.sha)

  console.log(
    `\nSTEP 2: Generating V2 eval file for ${repoUrl} with ${commitShas.length} commits`,
  )

  const outputPath = path.join(__dirname, `eval-${repoName}-v2.json`)

  await generateEvalFileV2({
    repoUrl: gitRepoUrl,
    commitShas,
    outputPath,
  })

  console.log(`\n=== Eval Generation Complete ===`)
  console.log(`Selected commits: ${selectedCommitsOutputPath}`)
  console.log(`Final eval file: ${outputPath}`)

  fs.rmSync(tmpDir, { recursive: true, force: true })
}

if (require.main === module) {
  const repoUrl = process.argv[2]

  if (!repoUrl) {
    console.error('Usage: bun run gen-repo-eval.ts <repo-url>')
    console.error('')
    console.error('Example:')
    console.error('  bun run gen-repo-eval.ts https://github.com/user/repo')
    process.exit(1)
  }

  generateRepoEvalV2(repoUrl)
    .then(() => {
      console.log('\n✓ Repo eval generation completed successfully!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n✗ Error generating repo eval:', error)
      process.exit(1)
    })
}
