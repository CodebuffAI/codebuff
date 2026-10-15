/**
 * THE structured `fit` block of a sponsored skill (`format: 2`): which
 * projects a skill fits, as data instead of hand-written manifest globs and
 * regex alternations (Owen, 2026-10-14: "a structured thing would be much
 * better").
 *
 * - {@link SPONSORED_FIT_ECOSYSTEMS} is the one table that maps each closed
 *   framework name to the manifests it lives in and the dependency names that
 *   mark it.
 * - {@link compileSponsoredSkillFit} turns a `fit` block into the ordinary
 *   preflight checks the step driver runs, so the run is checked by the same
 *   evaluator as every other check.
 * - The fit oracle (`./sponsored-skill-fit.ts`) evaluates the block directly
 *   against a repository's facts, so serving can refuse a misfit before it is
 *   offered.
 *
 * Dependency-free (type imports only), like `./sponsored-skill.ts`, which
 * imports this module to validate the block. Doc:
 * `docs/ads/agentic/sponsored-skills.md`, "Fit".
 */

import type {
  SponsoredSkillCheck,
  SponsoredSkillOs,
  SponsoredSkillParseError,
} from './sponsored-skill'

/** The ecosystems a fit route can name. Add one (go, php …) when a skill needs it. */
export const SPONSORED_FIT_ROUTE_ECOSYSTEMS = ['node', 'python'] as const
export type SponsoredFitRouteEcosystem =
  (typeof SPONSORED_FIT_ROUTE_ECOSYSTEMS)[number]

export const SPONSORED_NODE_FRAMEWORKS = [
  'next',
  'express',
  'fastify',
  'hono',
  'koa',
  'nestjs',
  'vite-react',
  'remix',
  'sveltekit',
  'astro',
  'expo',
  'nuxt',
] as const
export type SponsoredNodeFramework = (typeof SPONSORED_NODE_FRAMEWORKS)[number]

export const SPONSORED_PYTHON_FRAMEWORKS = [
  'fastapi',
  'flask',
  'django',
  'starlette',
  'litestar',
  'sanic',
  'aiohttp',
  'quart',
  'streamlit',
  'gradio',
] as const
export type SponsoredPythonFramework =
  (typeof SPONSORED_PYTHON_FRAMEWORKS)[number]

type EcosystemTable<F extends string> = {
  /** Basename globs of this ecosystem's dependency manifests. */
  manifests: readonly string[]
  /** Each framework, as the dependency names that mark it (any one is enough). */
  frameworks: Readonly<Record<F, readonly string[]>>
}

/**
 * THE fit vocabulary: per ecosystem, the manifest files and, per closed
 * framework name, the dependency names that mark it. `anyDependency` on a
 * route adds SDK families (openai, anthropic, langchain …) beside these.
 */
export const SPONSORED_FIT_ECOSYSTEMS: {
  readonly node: EcosystemTable<SponsoredNodeFramework>
  readonly python: EcosystemTable<SponsoredPythonFramework>
} = {
  node: {
    manifests: ['package.json'],
    frameworks: {
      next: ['next'],
      express: ['express'],
      fastify: ['fastify'],
      hono: ['hono'],
      koa: ['koa'],
      nestjs: ['@nestjs/core'],
      'vite-react': ['@vitejs/plugin-react', '@vitejs/plugin-react-swc'],
      remix: ['@remix-run/react', '@remix-run/node', '@remix-run/dev'],
      sveltekit: ['@sveltejs/kit'],
      astro: ['astro'],
      expo: ['expo'],
      nuxt: ['nuxt'],
    },
  },
  python: {
    manifests: [
      'pyproject.toml',
      'requirements*.txt',
      'setup.py',
      'setup.cfg',
      'Pipfile',
    ],
    frameworks: {
      fastapi: ['fastapi'],
      flask: ['flask'],
      django: ['django'],
      starlette: ['starlette'],
      litestar: ['litestar'],
      sanic: ['sanic'],
      aiohttp: ['aiohttp'],
      quart: ['quart'],
      streamlit: ['streamlit'],
      gradio: ['gradio'],
    },
  },
}

/**
 * The CLOSED set of basenames (globs over one path segment) the fit oracle
 * knows a repository's listing for: every manifest above, the lockfiles, the
 * other ecosystems' manifests (reported, never routed yet) and the marker
 * files a skill may require to be absent. A check whose path can only match
 * these names is decidable from a repository's facts; any other is not.
 * Repository facts (`sponsoredRepoFacts`) list exactly the paths whose
 * basename matches one of these.
 */
export const SPONSORED_FIT_FILE_NAMES = [
  ...SPONSORED_FIT_ECOSYSTEMS.node.manifests,
  ...SPONSORED_FIT_ECOSYSTEMS.python.manifests,
  // Lockfiles: which package manager, never content.
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'uv.lock',
  'poetry.lock',
  'Pipfile.lock',
  // Other ecosystems: counted in the repo mix, no route reads them yet.
  'deno.json',
  'deno.jsonc',
  'go.mod',
  'Cargo.toml',
  'composer.json',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  // Markers a skill may require to be absent.
  '.coderabbit.yaml',
  '.coderabbit.yml',
] as const

/** The fit files whose content the facts carry as dependency names. */
export const SPONSORED_FIT_MANIFEST_NAMES = [
  ...SPONSORED_FIT_ECOSYSTEMS.node.manifests,
  ...SPONSORED_FIT_ECOSYSTEMS.python.manifests,
] as const

/** The marker files whose facts say whether they are empty. */
export const SPONSORED_FIT_MARKER_NAMES = [
  '.coderabbit.yaml',
  '.coderabbit.yml',
] as const

export type SponsoredFitRoute<F extends string> = {
  /** Any listed framework fits; absent or empty means any project of the ecosystem. */
  frameworks?: F[]
  /** Any listed dependency fits (SDK families: openai, anthropic …). */
  anyDependency?: string[]
}

/**
 * Format 2's fit block. Routes are ORed: any route that fits makes the skill
 * fit. Within a route, `frameworks` and `anyDependency` are ORed too; a route
 * with neither fits any project with that ecosystem's manifest.
 */
export type SponsoredSkillFit = {
  /** The OSes the skill runs on; absent is all three. Must equal `requirements.os`. */
  os?: SponsoredSkillOs[]
  routes: {
    node?: SponsoredFitRoute<SponsoredNodeFramework>
    python?: SponsoredFitRoute<SponsoredPythonFramework>
  }
  /** Fit files that must not exist (e.g. `.coderabbit.yaml`). Paths are repo-relative globs. */
  mustNotExist?: string[]
}

export const MAX_FIT_ROUTE_DEPENDENCIES = 40
export const MAX_FIT_MUST_NOT_EXIST = 8

/** The ids of the preflight checks {@link compileSponsoredSkillFit} emits. */
export const SPONSORED_FIT_CHECK_IDS = {
  manifest: 'fit-manifest',
  route: 'fit-route',
  mustNotExist: 'fit-must-not-exist',
} as const

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const PYPI_NAME = /^(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._-]{0,98}[A-Za-z0-9])$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Expands `{a,b}` alternation (nested too) into every literal alternative. */
export function expandSponsoredGlobBraces(glob: string): string[] {
  const open = glob.indexOf('{')
  if (open < 0) return [glob]
  let depth = 0
  let close = -1
  const commas: number[] = []
  for (let i = open; i < glob.length; i++) {
    const char = glob[i]
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    } else if (char === ',' && depth === 1) commas.push(i)
  }
  if (close < 0) return [glob]
  const head = glob.slice(0, open)
  const tail = glob.slice(close + 1)
  const bounds = [open, ...commas, close]
  const parts: string[] = []
  for (let i = 0; i + 1 < bounds.length; i++)
    parts.push(glob.slice(bounds[i]! + 1, bounds[i + 1]))
  return parts.flatMap((part) => expandSponsoredGlobBraces(head + part + tail))
}

/** A one-segment basename glob (`*`, `?`) as a regex. */
function basenameRegex(glob: string): RegExp {
  let source = ''
  for (const char of glob) {
    if (char === '*') source += '[^/]*'
    else if (char === '?') source += '[^/]'
    else source += char.replace(/[.+^$()|[\]\\{}]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

const FIT_NAME_REGEXES = SPONSORED_FIT_FILE_NAMES.map(basenameRegex)

/** Whether a concrete basename is a fit file (listed in repository facts). */
export function isSponsoredFitFileName(basename: string): boolean {
  return FIT_NAME_REGEXES.some((re) => re.test(basename))
}

/**
 * Whether every path `glob` can match has a fit-file basename, so a
 * repository's facts (which list every fit file) decide it. The last segment
 * of each brace alternative must be one of {@link SPONSORED_FIT_FILE_NAMES}
 * exactly, or a literal that is a fit file name.
 */
export function sponsoredFitGlobDecidable(glob: string): boolean {
  return expandSponsoredGlobBraces(glob).every((alternative) => {
    const basename = alternative.split('/').at(-1) ?? ''
    if (!basename || basename.includes('**')) return false
    if ((SPONSORED_FIT_FILE_NAMES as readonly string[]).includes(basename))
      return true
    return !/[*?]/.test(basename) && isSponsoredFitFileName(basename)
  })
}

function validRouteGlob(glob: unknown): glob is string {
  return (
    typeof glob === 'string' &&
    glob.length > 0 &&
    glob.length <= 200 &&
    !glob.startsWith('/') &&
    !glob.split('/').includes('..') &&
    sponsoredFitGlobDecidable(glob)
  )
}

/**
 * Validates a `fit` block, pushing every problem. `os` is the skill's
 * `requirements.os`, which the block's `os` must equal.
 */
export function parseSponsoredSkillFit(
  errors: SponsoredSkillParseError[],
  value: unknown,
  requirementsOs: readonly string[] | null,
): void {
  const all = ['darwin', 'linux', 'win32']
  if (!isRecord(value)) {
    errors.push({ path: 'fit', message: 'format 2 needs a fit object' })
    return
  }
  for (const key of Object.keys(value)) {
    if (!['os', 'routes', 'mustNotExist'].includes(key))
      errors.push({ path: `fit.${key}`, message: 'is not a fit field' })
  }
  if (value.os !== undefined) {
    if (
      !Array.isArray(value.os) ||
      value.os.length === 0 ||
      !value.os.every((os) => all.includes(os as string)) ||
      new Set(value.os).size !== value.os.length
    )
      errors.push({
        path: 'fit.os',
        message: 'must be a non-empty list of darwin, linux, win32',
      })
  }
  if (requirementsOs) {
    const want = [...((value.os as string[] | undefined) ?? all)].sort()
    const got = [...requirementsOs].sort()
    if (want.join(',') !== got.join(','))
      errors.push({
        path: 'requirements.os',
        message: `must equal fit.os (${want.join(', ')})`,
      })
  }
  const routes = value.routes
  if (!isRecord(routes) || Object.keys(routes).length === 0) {
    errors.push({
      path: 'fit.routes',
      message: `must declare at least one of ${SPONSORED_FIT_ROUTE_ECOSYSTEMS.join(', ')}`,
    })
  } else {
    for (const [ecosystem, route] of Object.entries(routes)) {
      const at = `fit.routes.${ecosystem}`
      if (
        !(SPONSORED_FIT_ROUTE_ECOSYSTEMS as readonly string[]).includes(
          ecosystem,
        )
      ) {
        errors.push({
          path: at,
          message: `unknown ecosystem; one of ${SPONSORED_FIT_ROUTE_ECOSYSTEMS.join(', ')}`,
        })
        continue
      }
      if (!isRecord(route)) {
        errors.push({ path: at, message: 'must be an object' })
        continue
      }
      for (const key of Object.keys(route)) {
        if (!['frameworks', 'anyDependency'].includes(key))
          errors.push({ path: `${at}.${key}`, message: 'is not a route field' })
      }
      const table = SPONSORED_FIT_ECOSYSTEMS[ecosystem as SponsoredFitRouteEcosystem]
      if (route.frameworks !== undefined) {
        const known = Object.keys(table.frameworks)
        if (
          !Array.isArray(route.frameworks) ||
          !route.frameworks.every((name) => known.includes(name as string)) ||
          new Set(route.frameworks).size !== route.frameworks.length
        )
          errors.push({
            path: `${at}.frameworks`,
            message: `must be distinct names from ${known.join(', ')}`,
          })
      }
      if (route.anyDependency !== undefined) {
        const name = ecosystem === 'node' ? NPM_NAME : PYPI_NAME
        if (
          !Array.isArray(route.anyDependency) ||
          route.anyDependency.length > MAX_FIT_ROUTE_DEPENDENCIES ||
          !route.anyDependency.every(
            (dep) => typeof dep === 'string' && name.test(dep),
          ) ||
          new Set(route.anyDependency).size !== route.anyDependency.length
        )
          errors.push({
            path: `${at}.anyDependency`,
            message: `must be at most ${MAX_FIT_ROUTE_DEPENDENCIES} distinct ${ecosystem === 'node' ? 'npm' : 'PyPI'} package names`,
          })
      }
    }
  }
  if (value.mustNotExist !== undefined) {
    if (
      !Array.isArray(value.mustNotExist) ||
      value.mustNotExist.length === 0 ||
      value.mustNotExist.length > MAX_FIT_MUST_NOT_EXIST ||
      !value.mustNotExist.every(validRouteGlob)
    )
      errors.push({
        path: 'fit.mustNotExist',
        message: `must be 1-${MAX_FIT_MUST_NOT_EXIST} repo-relative globs over fit file names (${SPONSORED_FIT_MARKER_NAMES.join(', ')} …)`,
      })
  }
}

/**
 * The fit vocabulary as one line per ecosystem, for an authoring prompt:
 * `node: next (next), express (express), …`.
 */
export function sponsoredFitVocabularyText(): string {
  return SPONSORED_FIT_ROUTE_ECOSYSTEMS.map((ecosystem) => {
    const table = SPONSORED_FIT_ECOSYSTEMS[ecosystem]
    const frameworks = Object.entries(
      table.frameworks as Record<string, readonly string[]>,
    )
      .map(([name, deps]) =>
        deps.length === 1 && deps[0] === name ? name : `${name} (${deps.join(' or ')})`,
      )
      .join(', ')
    return `${ecosystem} (manifests ${table.manifests.join(', ')}): ${frameworks}`
  }).join('\n')
}

/**
 * The `requirements` a fit block implies, filled into a draft: `os` equals
 * the block's (all three when absent), each route's runtime is declared, and
 * a skill with no node route lists no JS framework. Never removes a runtime
 * or a framework the draft declared for a node route.
 */
export function requirementsForFit(
  fit: SponsoredSkillFit,
  requirements: {
    os?: unknown
    runtimes?: unknown
    frameworks?: unknown
    packageManagers?: unknown
  },
  nodeFrameworks: readonly string[],
): Record<string, unknown> {
  const runtimes = Array.isArray(requirements.runtimes)
    ? [...(requirements.runtimes as Array<Record<string, unknown>>)]
    : []
  const named = new Set(runtimes.map((runtime) => runtime?.name))
  if (fit.routes.node && !named.has('node')) runtimes.push({ name: 'node' })
  if (fit.routes.python && !named.has('python')) runtimes.push({ name: 'python' })
  return {
    ...requirements,
    os: [...(fit.os ?? ['darwin', 'linux', 'win32'])],
    runtimes,
    frameworks: fit.routes.node ? [...nodeFrameworks] : [],
  }
}

/** The routes a fit block declares, in a fixed order. */
export function sponsoredFitRoutes(
  fit: SponsoredSkillFit,
): Array<{ ecosystem: SponsoredFitRouteEcosystem; dependencies: string[] | null }> {
  const out: Array<{
    ecosystem: SponsoredFitRouteEcosystem
    dependencies: string[] | null
  }> = []
  for (const ecosystem of SPONSORED_FIT_ROUTE_ECOSYSTEMS) {
    const route = fit.routes[ecosystem] as
      | SponsoredFitRoute<string>
      | undefined
    if (!route) continue
    const table = SPONSORED_FIT_ECOSYSTEMS[ecosystem].frameworks as Record<
      string,
      readonly string[]
    >
    const deps = [
      ...(route.frameworks ?? []).flatMap((name) => table[name] ?? []),
      ...(route.anyDependency ?? []),
    ]
    out.push({
      ecosystem,
      dependencies: deps.length ? [...new Set(deps)] : null,
    })
  }
  return out
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/** A PyPI name as a regex: case-insensitive by flag, `-`, `_` and `.` interchangeable (PEP 503). */
function pypiNameRegex(name: string): string {
  return name
    .split(/[-_.]+/)
    .map(escapeRegex)
    .join('[-_.]')
}

/** Start of the file, whatever the `m` flag says. */
const FILE_START = '(?<![\\s\\S])'
/** At a line start, in a file that is not a JSON object (so never package.json). */
const PYTHON_LINE = `^(?<=${FILE_START}(?!\\s*\\{)[\\s\\S]*)[ \\t]*["']?`
/** After a Python requirement's name: a version, extra, marker, comment, separator or the end of the line. */
const PYTHON_NAME_END = `["']?(?=[ \\t]*(?:[<>=!~;\\[\\],#@]|$))`

/**
 * The regex alternative a route compiles to, matched per manifest file:
 * - node: the dependency is a JSON key (`"next":`).
 * - python: a line of a non-JSON manifest starts with the requirement
 *   (`fastapi>=0.1`, `"fastapi[all]",`, `fastapi = "^0.110"`).
 * - a route with no dependency list: any manifest of the ecosystem
 *   (package.json is a JSON object; a Python manifest is not).
 */
function routePattern(route: {
  ecosystem: SponsoredFitRouteEcosystem
  dependencies: string[] | null
}): string {
  if (route.ecosystem === 'node') {
    return route.dependencies
      ? `"(?:${route.dependencies.map(escapeRegex).join('|')})"\\s*:`
      : `${FILE_START}\\s*\\{`
  }
  return route.dependencies
    ? `${PYTHON_LINE}(?:${route.dependencies.map(pypiNameRegex).join('|')})${PYTHON_NAME_END}`
    : `${FILE_START}(?!\\s*\\{)`
}

/** Each declared route's manifest basenames, one brace glob for every depth. */
export function sponsoredFitManifestGlob(fit: SponsoredSkillFit): string {
  const names = sponsoredFitRoutes(fit).flatMap(
    (route) => SPONSORED_FIT_ECOSYSTEMS[route.ecosystem].manifests,
  )
  return `**/{${names.join(',')}}`
}

/**
 * THE fit block as preflight checks, run ahead of the skill's own
 * `preflight` by the step driver (`sponsoredSkillPreflightChecks`):
 * 1. `fit-manifest`: a manifest of a declared route exists;
 * 2. `fit-route`: one such manifest declares a route's dependency (dropped
 *    when every route is unconstrained);
 * 3. `fit-must-not-exist`: none of `mustNotExist` exists (even empty).
 * The OS rides `requirements.os`, which the step driver already checks.
 * Generated, never hand-edited, so the regex cap on authored checks does not
 * apply.
 */
export function compileSponsoredSkillFit(
  fit: SponsoredSkillFit,
): SponsoredSkillCheck[] {
  const routes = sponsoredFitRoutes(fit)
  const path = sponsoredFitManifestGlob(fit)
  const ecosystems = routes.map((route) =>
    route.ecosystem === 'node' ? 'a package.json' : 'a Python manifest',
  )
  const checks: SponsoredSkillCheck[] = [
    {
      id: SPONSORED_FIT_CHECK_IDS.manifest,
      label: `the project has ${ecosystems.join(' or ')}`,
      kind: 'file_exists',
      path,
    },
  ]
  if (routes.some((route) => route.dependencies)) {
    checks.push({
      id: SPONSORED_FIT_CHECK_IDS.route,
      label: `the project uses ${routes
        .map((route) =>
          route.dependencies
            ? route.dependencies.slice(0, 4).join(', ') +
              (route.dependencies.length > 4 ? ' …' : '')
            : `any ${route.ecosystem} project`,
        )
        .join(' or ')}`,
      kind: 'file_contains',
      path,
      pattern: routes.map(routePattern).join('|'),
      flags: 'im',
      changedOnly: false,
    })
  }
  if (fit.mustNotExist?.length) {
    checks.push({
      id: SPONSORED_FIT_CHECK_IDS.mustNotExist,
      label: `the project has no ${fit.mustNotExist.join(' or ')} yet`,
      kind: 'file_contains',
      path:
        fit.mustNotExist.length === 1
          ? fit.mustNotExist[0]!
          : `{${fit.mustNotExist.join(',')}}`,
      // `^` matches every file, empty ones too: any match is a failure.
      pattern: '^',
      absent: true,
      changedOnly: false,
    })
  }
  return checks
}
