#!/usr/bin/env node

const WORKFLOW_API_URL =
  'https://api.github.com/repos/AnzoBenjamin/openbuff/actions/workflows/cli-release-prod.yml'
const WORKFLOW_WEB_URL =
  'https://github.com/AnzoBenjamin/openbuff/actions/workflows/cli-release-prod.yml'
const RELEASE_ACTIONS_URL =
  'https://github.com/AnzoBenjamin/openbuff/actions'
const VERSION_TYPES = new Set(['patch', 'minor', 'major'])

type FetchLike = typeof fetch

function log(message: string) {
  console.log(message)
}

function fail(message: string): never {
  throw new Error(message)
}

function formatTimestamp() {
  const now = new Date()
  const options = {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  } as const
  return now.toLocaleDateString('en-US', options)
}

export function validateVersionType(value: string): 'patch' | 'minor' | 'major' {
  if (!VERSION_TYPES.has(value)) {
    fail(
      `Invalid release version type '${value}'. Expected one of: patch, minor, major.`,
    )
  }
  return value as 'patch' | 'minor' | 'major'
}

export function getGitHubToken(env: NodeJS.ProcessEnv): string {
  const token = env.OPENBUFF_GITHUB_TOKEN ?? env.CODEBUFF_GITHUB_TOKEN
  if (!token) {
    fail(
      'OPENBUFF_GITHUB_TOKEN or CODEBUFF_GITHUB_TOKEN environment variable is required but not set.',
    )
  }
  return token
}

async function readGitHubError(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return response.statusText || 'empty response'
  try {
    const parsed = JSON.parse(text) as { message?: unknown }
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // Use the bounded plain-text response below.
  }
  return text.slice(0, 500)
}

async function requireGitHubSuccess(response: Response, action: string) {
  if (response.ok) return
  const detail = await readGitHubError(response)
  fail(`${action} failed with HTTP ${response.status}: ${detail}`)
}

export async function triggerWorkflow(
  versionType: string,
  options: {
    token: string
    fetchImpl?: FetchLike
    sleep?: (milliseconds: number) => Promise<void>
    now?: () => number
    verificationAttempts?: number
  },
): Promise<{ runId: number; htmlUrl: string }> {
  const validatedVersionType = validateVersionType(versionType)
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds))
  const now = options.now ?? Date.now
  const dispatchedAt = now()
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${options.token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const dispatchResponse = await fetchImpl(`${WORKFLOW_API_URL}/dispatches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: 'main',
      inputs: { version_type: validatedVersionType },
    }),
  })
  await requireGitHubSuccess(dispatchResponse, 'Workflow dispatch')

  const attempts = options.verificationAttempts ?? 5
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(2_000)
    const runsResponse = await fetchImpl(
      `${WORKFLOW_API_URL}/runs?event=workflow_dispatch&branch=main&per_page=10`,
      { headers },
    )
    await requireGitHubSuccess(runsResponse, 'Workflow verification')
    const payload = (await runsResponse.json()) as {
      workflow_runs?: Array<{
        id?: unknown
        html_url?: unknown
        created_at?: unknown
        event?: unknown
        head_branch?: unknown
      }>
    }
    const run = payload.workflow_runs?.find((candidate) => {
      const createdAt =
        typeof candidate.created_at === 'string'
          ? Date.parse(candidate.created_at)
          : Number.NaN
      return (
        typeof candidate.id === 'number' &&
        typeof candidate.html_url === 'string' &&
        candidate.event === 'workflow_dispatch' &&
        candidate.head_branch === 'main' &&
        Number.isFinite(createdAt) &&
        createdAt >= dispatchedAt - 5_000
      )
    })
    if (run && typeof run.id === 'number' && typeof run.html_url === 'string') {
      return { runId: run.id, htmlUrl: run.html_url }
    }
  }

  fail(
    `GitHub accepted the dispatch but no matching workflow run appeared after ${attempts} verification attempts. Check ${WORKFLOW_WEB_URL}.`,
  )
}

async function main() {
  const versionType = validateVersionType(process.argv[2] ?? 'patch')
  const token = getGitHubToken(process.env)

  log('🚀 Initiating release...')
  log(`Date: ${formatTimestamp()}`)
  log('✅ Using configured GitHub token')
  log(`Version bump type: ${versionType}`)

  const run = await triggerWorkflow(versionType, { token })
  log(`🎉 Release workflow verified: run ${run.runId}`)
  log(`Monitor progress at: ${run.htmlUrl || RELEASE_ACTIONS_URL}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ Release failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
