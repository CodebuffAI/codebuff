import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { describe, beforeEach } from 'bun:test'
import { createFileReadingMock, resetRepoToCommit } from './scaffolding'
import { recreateShell } from 'npm-app/utils/terminal'

const TEST_REPOS_DIR = path.join(__dirname, 'test-repos')
const TEST_PROJECTS_CONFIG = path.join(__dirname, 'test-repos.json')

async function ensureTestRepos() {
  // Create test-repos directory if it doesn't exist
  if (!fs.existsSync(TEST_REPOS_DIR)) {
    fs.mkdirSync(TEST_REPOS_DIR, { recursive: true })
  }

  // Read test projects config
  const config = JSON.parse(fs.readFileSync(TEST_PROJECTS_CONFIG, 'utf-8'))

  // Clone/update each test repo
  for (const [projectName, project] of Object.entries(config)) {
    const projectDir = path.join(TEST_REPOS_DIR, projectName)
    const { repo, commit } = project as { repo: string; commit: string }

    if (!fs.existsSync(projectDir)) {
      // Do a shallow clone of just the specific commit
      console.log(`Cloning ${projectName} from ${repo} at commit ${commit}...`)
      execSync(
        `git clone --depth 1 --branch main ${repo} ${projectDir} && cd ${projectDir} && git fetch --depth 1 origin ${commit} && git checkout ${commit}`,
        {
          timeout: 60_000, // 1 minute timeout for git operations
        }
      )
    } else {
      // For existing repos, fetch and checkout the commit
      // console.log(`Checking out ${commit} for ${projectName}...`)
      execSync(
        `cd ${projectDir} && git fetch --depth 1 origin ${commit} && git checkout ${commit}`,
        {
          timeout: 60_000, // 1 minute timeout for git operations
        }
      )
    }
  }
}

describe('evals', async () => {
  await ensureTestRepos()

  const config: {
    [projectName: string]: {
      repo: string
      commit: string
    }
  } = JSON.parse(fs.readFileSync(TEST_PROJECTS_CONFIG, 'utf-8'))

  // Get the filter pattern from environment variable
  const filterPattern = process.env.TEST_FILTER

  if (filterPattern) {
    console.log(`Running tests only for projects matching: ${filterPattern}`)
  }

  for (const [projectName, project] of Object.entries(config)) {
    // Skip projects that don't match the filter pattern if one is provided
    if (filterPattern && !projectName.includes(filterPattern)) {
      console.log(`Skipping ${projectName} as it doesn't match filter pattern: ${filterPattern}`)
      continue
    }

    const evalFile = path.join(__dirname, `${projectName}.evals.ts`)
    if (!fs.existsSync(evalFile)) {
      console.log(`No eval file found for ${projectName}, skipping...`)
      continue
    }

    describe(projectName, async () => {
      const { runEvals } = await import(evalFile)
      const repoPath = path.join(TEST_REPOS_DIR, projectName)
      const { commit } = project

      createFileReadingMock(repoPath)
      recreateShell()

      beforeEach(() => {
        resetRepoToCommit(repoPath, commit)
      })

      await runEvals(repoPath)
    })
  }
})
