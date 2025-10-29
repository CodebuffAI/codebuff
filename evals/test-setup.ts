import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  setProjectRoot,
  setWorkingDirectory,
} from '@codebuff/npm-app/project-files'
import { recreateShell } from '@codebuff/npm-app/terminal/run-command'

import {
  createFileReadingMock,
  getProjectFileContext,
  resetRepoToCommit,
} from './scaffolding'

export const TEST_REPOS_DIR = path.join(__dirname, 'test-repos')
const TEST_PROJECTS_CONFIG = path.join(__dirname, 'test-repos.json')
export const SWE_BENCH_REPO_PATH = path.join(TEST_REPOS_DIR, 'swe-bench-docker')
const SWE_BENCH_VENV_PATH = path.join(SWE_BENCH_REPO_PATH, 'swebench_venv')
const SWE_BENCH_PIP_PATH = path.join(SWE_BENCH_VENV_PATH, 'bin', 'pip')
export const SWE_BENCH_PYTHON_PATH = path.join(
  SWE_BENCH_VENV_PATH,
  'bin',
  'python',
)

// Mock required environment variables for tests
export function setupTestEnvironmentVariables() {
  // Set up mock environment variables needed for tests
  process.env.GOOGLE_CLOUD_PROJECT_ID = 'mock-project-id'
  // Add other required environment variables as needed
}

// Patch the run_docker.py script to add git config command
function patchRunDockerScript() {
  const runDockerPath = path.join(
    SWE_BENCH_REPO_PATH,
    'swebench_docker',
    'run_docker.py',
  )
  let content = fs.readFileSync(runDockerPath, 'utf-8')

  // Find the docker_command assignments and modify them to include git config
  content = content.replace(
    /docker_command = \[([\s\S]*?)\s+docker_image\n\s+\]/g,
    (match, commandParts) => {
      return `docker_command = [${commandParts}
            docker_image,
            '--entrypoint', '',
            '/bin/bash', '-c', 'git config --global --add safe.directory \\'*\\' && exec /entrypoint.sh'
        ]`
    },
  )

  fs.writeFileSync(runDockerPath, content)
}

// Ensures test repositories are cloned and at the right commit
export async function ensureTestRepos() {
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
      if (commit !== 'HEAD') {
        execSync(
          `git clone --depth 1 --branch main ${repo} ${projectDir} && cd ${projectDir} && git fetch --depth 1 origin ${commit} && git checkout ${commit}`,
          {
            timeout: 60_000, // 1 minute timeout for git operations
          },
        )
      } else {
        try {
          execSync(
            `git clone --branch main ${repo} ${projectDir} && cd ${projectDir}`,
            {
              timeout: 60_000, // 1 minute timeout for git operations
            },
          )
        } catch (error) {
          // Maybe main doesn't exist? try master
          execSync(
            `git clone --branch master ${repo} ${projectDir} && cd ${projectDir}`,
            {
              timeout: 60_000, // 1 minute timeout for git operations
            },
          )
        }
      }

      // After cloning OR updating swe-bench-docker, patch the run_docker.py script
      if (projectName === 'swe-bench-docker') {
        patchRunDockerScript()
      }
    } else {
      // For existing repos, fetch and checkout the commit
      // console.log(`Checking out ${commit} for ${projectName}...`)
      if (commit !== 'HEAD') {
        execSync(
          `cd ${projectDir} && git fetch --depth 1 origin ${commit} && git checkout ${commit}`,
          {
            timeout: 60_000, // 1 minute timeout for git operations
          },
        )
      }
    }
  }
}

// Gets the config from test-repos.json
export function getTestReposConfig() {
  return JSON.parse(fs.readFileSync(TEST_PROJECTS_CONFIG, 'utf-8')) as {
    [projectName: string]: {
      repo: string
      commit: string
    }
  }
}

async function setupSweBenchEnvironment() {
  execSync(`python3 -m venv ${SWE_BENCH_VENV_PATH}`)
  execSync(`${SWE_BENCH_PIP_PATH} install swebench==1.1.5`)
}

// Sets up the test environment for a specific project
export async function setupTestEnvironment(projectName: string) {
  // Set up mock environment variables
  setupTestEnvironmentVariables()

  const config = getTestReposConfig()
  const project = config[projectName]

  if (!project) {
    throw new Error(`Project "${projectName}" not found in test-repos.json`)
  }

  await ensureTestRepos()

  if (project.commit === 'HEAD') {
    await setupSweBenchEnvironment()
  }

  const repoPath = path.join(TEST_REPOS_DIR, projectName)
  setProjectRoot(repoPath)
  await createFileReadingMock(repoPath)
  recreateShell(repoPath)
  setWorkingDirectory(repoPath)

  // Return project info for use in tests
  return {
    repoPath,
    commit: project.commit,
    resetRepo: (commit: string) => resetRepoToCommit(repoPath, commit),
  }
}

// Creates an initial agent state for testing
export async function createInitialSessionState(repoPath: string) {
  const fileContext = await getProjectFileContext(repoPath)
  return getInitialSessionState(fileContext)
}
