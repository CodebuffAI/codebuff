/**
 * The browser workspace's side of the agentic offer route: the `web` client.
 *
 * Freebuff Web has no local client to inspect a folder, so the Cloud worker
 * asks instead, server to server, after a turn in a project chat whose
 * worktree is ready. It runs one read-only shell command in that chat's
 * worktree (its own Linux user, inside the Freestyle VM) and builds the
 * capability here from what the command printed. The route trusts these
 * facts only because the caller proves it is our server: the bearer is the
 * user's `fb-ws-` workspace token, which is minted and held server-side and
 * never reaches a browser (`workspace-api-token.ts`).
 *
 * Pure and zod-free: the worker and its tests build the request with it, and
 * the offer route reads the same constants.
 */

import { createHash } from 'node:crypto'

import { SPONSORED_CLOUD_EXECUTION_SURFACE } from './sponsored-execution-surface'

import type {
  CapabilityInspection,
  CloudWorktreeCapability,
  SponsoredCapability,
  SponsoredRunCapability,
  SponsoredRuntime,
} from './sponsored-capability'

/**
 * The Cloud worker's product UA on the offer route. `Freebuff-Cloud/<version>`;
 * a request bearing it is admitted as `web` only with a workspace token.
 */
export const WEB_AGENTIC_PRODUCT_UA_PREFIX = 'Freebuff-Cloud/'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The offer's workspace key for a browser-workspace PROJECT: the proposal
 * row's `workspace_id`, as Desktop keys an in-place offer to its folder's id.
 * Cloud project ids are free-form (`idSchema`), while the wire and the row
 * want a UUID, so a non-UUID id maps to a stable name-based one (the v5
 * layout over SHA-256). The chat itself is the row's `conversation_id`.
 */
export function cloudProjectWorkspaceId(projectId: string): string {
  if (UUID.test(projectId)) return projectId.toLowerCase()
  const bytes = createHash('sha256')
    .update(`freebuff-cloud-project:${projectId}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const SECTION = '@@freebuff-capability:'
const MAX_FILES = 20_000
const MAX_MANIFEST_BYTES = 200_000
const GIT_STEP_TIMEOUT_S = 3
/** Room for every section at its cap: the worker passes it as the exec output limit. */
export const WEB_CAPABILITY_OUTPUT_LIMIT = 4_000_000

/**
 * The one command the worker runs in the chat's worktree. Read-only: it
 * prints whether this is a work tree, the committed HEAD, the tracked files
 * (capped), `package.json` (capped) and which runtimes are on PATH, each
 * after a marker line. Every step tolerates failure, so the output is always
 * parseable.
 */
export const WEB_CAPABILITY_COMMAND = [
  // Each git step is bounded in the VM, so a slow repository ends the
  // command itself rather than leaving it holding the workspace's I/O fence.
  `T=; command -v timeout >/dev/null 2>&1 && T='timeout -k 1 ${GIT_STEP_TIMEOUT_S}'`,
  `printf '%s\\n' '${SECTION}inside'`,
  '$T git rev-parse --is-inside-work-tree 2>/dev/null',
  `printf '%s\\n' '${SECTION}head'`,
  "$T git rev-parse --verify --quiet 'HEAD^{commit}' 2>/dev/null",
  `printf '%s\\n' '${SECTION}runtimes'`,
  'for c in node npx bun python3 python; do command -v "$c" >/dev/null 2>&1 && printf "%s\\n" "$c"; done',
  `printf '%s\\n' '${SECTION}manifest'`,
  `head -c ${MAX_MANIFEST_BYTES} package.json 2>/dev/null`,
  // Last: an output cap cuts only the file list, never the compact sections.
  `printf '\\n%s\\n' '${SECTION}files'`,
  `$T git ls-files 2>/dev/null | head -n ${MAX_FILES}`,
  'true',
].join('; ')

export type WebWorktreeFacts = {
  insideWorkTree: boolean
  head: string | null
  files: string[]
  runtimes: SponsoredRuntime[]
  /** `package.json`'s text, or null when the worktree has none. */
  manifest: string | null
}

/** Parse {@link WEB_CAPABILITY_COMMAND}'s output. */
export function parseWebWorktreeFacts(output: string): WebWorktreeFacts {
  const sections = new Map<string, string[]>()
  let current: string | null = null
  for (const line of output.split('\n')) {
    if (line.startsWith(SECTION)) {
      current = line.slice(SECTION.length).trim()
      sections.set(current, [])
    } else if (current) sections.get(current)!.push(line)
  }
  const lines = (name: string) =>
    (sections.get(name) ?? []).map((line) => line.trim()).filter(Boolean)
  const runtimes = new Set<SponsoredRuntime>()
  for (const name of lines('runtimes')) {
    if (name === 'node' || name === 'npx' || name === 'bun') runtimes.add(name)
    if (name === 'python3' || name === 'python') runtimes.add('python')
  }
  const manifest = sections.get('manifest')?.join('\n').trim() ?? ''
  return {
    insideWorkTree: lines('inside')[0] === 'true',
    head: lines('head')[0] ?? null,
    files: lines('files'),
    runtimes: [...runtimes],
    manifest: manifest ? manifest : null,
  }
}

type PackageJson = {
  packageManager?: unknown
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
}

const DATABASE_BOUNDARY =
  /(^|\/)(?:supabase\/migrations|prisma(?:\/migrations|\/schema\.prisma)|migrations)(?:\/|$)|(^|\/)drizzle\.config\.[^/]+$/i

const has = (packages: Record<string, unknown>, name: string) =>
  Object.prototype.hasOwnProperty.call(packages, name)

// `packageManager` and `framework` mirror the CLI's detector
// (`cli/src/utils/sponsored-cli-capability.ts`) rule for rule, so a repository
// reads the same in the browser workspace as in a terminal.
function packageManager(
  pkg: PackageJson,
  files: ReadonlySet<string>,
): SponsoredCapability['packageManager'] {
  const declared =
    typeof pkg.packageManager === 'string'
      ? pkg.packageManager.split('@', 1)[0]
      : ''
  if (
    declared === 'bun' ||
    declared === 'npm' ||
    declared === 'pnpm' ||
    declared === 'yarn'
  )
    return declared
  if (files.has('bun.lock') || files.has('bun.lockb')) return 'bun'
  if (files.has('pnpm-lock.yaml')) return 'pnpm'
  if (files.has('yarn.lock')) return 'yarn'
  return files.has('package-lock.json') || files.has('npm-shrinkwrap.json')
    ? 'npm'
    : 'unknown'
}

function framework(
  packages: Record<string, unknown>,
  manifest: boolean,
  files: ReadonlySet<string>,
): SponsoredCapability['framework'] {
  if (has(packages, 'next')) return 'nextjs'
  const knownUnsupported = ['vue', 'svelte', '@angular/core', 'solid-js'].some(
    (name) => has(packages, name),
  )
  const react = has(packages, 'react') || has(packages, '@vitejs/plugin-react')
  if (
    !knownUnsupported &&
    react &&
    (has(packages, 'vite') ||
      [...files].some((file) => /^vite\.config\.[cm]?[jt]sx?$/.test(file)))
  )
    return 'react-vite'
  if (knownUnsupported) return 'unsupported'
  if (
    ['express', 'fastify', 'koa', 'hono'].some((name) => has(packages, name)) ||
    ['server.ts', 'server.js', 'index.ts', 'index.js'].some((file) =>
      files.has(file),
    )
  )
    return 'nodejs'
  return manifest ? 'unsupported' : 'unknown'
}

/** The v1 `localCapability` the offer route's eligibility reads. */
export type WebLocalCapability = {
  schemaVersion: 1
  repoFullName: string
  framework: 'nextjs' | 'unsupported' | 'unknown'
  packageManager: SponsoredCapability['packageManager']
  hasSupabaseBoundary: boolean
  hasCommittedDatabaseBoundary: boolean
  hasGitRepository: boolean
  workspaceId: string
}

export type WebCapability =
  | {
      cloudCapability: CloudWorktreeCapability
      localCapability: WebLocalCapability
      capabilityInspection: CapabilityInspection
    }
  | {
      cloudCapability: null
      localCapability: null
      capabilityInspection: CapabilityInspection
    }

/**
 * The capability of one chat's worktree, keyed to its project
 * ({@link cloudProjectWorkspaceId}). It carries no execution: the surface is
 * server-assigned (see {@link cloudSponsoredCapability}). Refuses exactly as
 * the CLI does on a missing work tree, missing HEAD or an unreadable manifest.
 */
export function webWorktreeCapability(
  facts: WebWorktreeFacts,
  workspaceId: string,
): WebCapability {
  const unavailable = (
    reason: Extract<CapabilityInspection, { status: 'unavailable' }>['reason'],
  ): WebCapability => ({
    cloudCapability: null,
    localCapability: null,
    capabilityInspection: { status: 'unavailable', reason },
  })
  if (!facts.insideWorkTree) return unavailable('no_git_repository')
  if (!facts.head) return unavailable('no_committed_head')
  const files = new Set(facts.files)
  let pkg: PackageJson = {}
  if (facts.manifest !== null) {
    try {
      const parsed: unknown = JSON.parse(facts.manifest)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return unavailable('unreadable_package_manifest')
      pkg = parsed as PackageJson
    } catch {
      return unavailable('unreadable_package_manifest')
    }
  }
  const packages = { ...pkg.dependencies, ...pkg.devDependencies }
  const cloudCapability: CloudWorktreeCapability = {
    schemaVersion: 2,
    target: { kind: 'workspace', workspaceId },
    framework: framework(packages, facts.manifest !== null, files),
    packageManager: packageManager(pkg, files),
    hasSupabaseBoundary:
      Object.keys(packages).some(
        (name) => name === 'supabase' || name.startsWith('@supabase/'),
      ) || [...files].some((file) => file.startsWith('supabase/')),
    hasCommittedDatabaseBoundary: [...files].some((file) =>
      DATABASE_BOUNDARY.test(file),
    ),
    hasGitRepository: true,
    hasCommittedHead: true,
    availableRuntimes: facts.runtimes,
  }
  return {
    cloudCapability,
    localCapability: {
      schemaVersion: 1,
      // In place: keyed by the workspace id, never `owner/repo`.
      repoFullName: '',
      framework:
        cloudCapability.framework === 'nextjs'
          ? 'nextjs'
          : cloudCapability.framework === 'unknown'
            ? 'unknown'
            : 'unsupported',
      packageManager: cloudCapability.packageManager,
      hasSupabaseBoundary: cloudCapability.hasSupabaseBoundary,
      hasCommittedDatabaseBoundary:
        cloudCapability.hasCommittedDatabaseBoundary,
      hasGitRepository: true,
      workspaceId,
    },
    capabilityInspection: { status: 'available' },
  }
}

/**
 * The capability the offer route reads for a `web` request: the worktree
 * facts with the server-assigned execution. `cloud_linux`, `available`, with
 * outbound network (the VM's egress is open): the run happens in this same
 * worktree. Called only by the route, after it proved the caller is the
 * workspace server; never from anything a client sent as `execution`.
 */
export function cloudSponsoredCapability(
  facts: CloudWorktreeCapability,
): SponsoredRunCapability {
  return {
    ...facts,
    execution: {
      surface: SPONSORED_CLOUD_EXECUTION_SURFACE,
      status: 'available',
      outboundNetwork: true,
    },
  }
}
