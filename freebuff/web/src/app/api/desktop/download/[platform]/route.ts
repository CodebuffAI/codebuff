import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

/**
 * Redirect to the correct Freebuff Desktop installer for the requested
 * platform, resolved from the latest `freebuff-desktop-v*` release on the
 * public community repo. Keeps the download links on /desktop stable across
 * releases (they never need to hardcode a version).
 *
 * Why not just list releases and take the newest? That repo also hosts the
 * (very frequent) CLI releases, and — because the desktop releases are
 * cross-repo tags pointing at the community repo's default branch — every
 * release shares the same `created_at`, so GitHub's release list sort buries
 * the desktop release far down the list. Instead we resolve the latest desktop
 * *tag* via the git matching-refs API (which only returns our prefix), pick the
 * highest semver, then fetch that release directly for its assets.
 *
 * Both GitHub calls are cached (`next.revalidate`) so a burst of downloads
 * collapses into one pair of requests and we stay well under GitHub's
 * unauthenticated rate limit (60/hr/IP).
 */

const RELEASES_REPO = 'CodebuffAI/codebuff-community'
const DESKTOP_TAG_PREFIX = 'freebuff-desktop-v'
const UPSTREAM_TTL_SECONDS = 300

// Mirror the authenticated GitHub request pattern from
// src/app/api/github/stars/route.ts: a token lifts us off the 60/hr
// unauthenticated rate limit (shared across all users behind our server IP),
// and pinning the API version avoids surprise response-shape changes.
const GITHUB_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'freebuff-web',
}
const githubToken = process.env.GITHUB_TOKEN ?? process.env.CODEBUFF_GITHUB_TOKEN
if (githubToken) {
  GITHUB_HEADERS.Authorization = `Bearer ${githubToken}`
}

type Platform = 'mac-arm64' | 'mac-intel' | 'windows' | 'linux'

// The supported platform keys (also the canonical URL path values) and how to
// pick each one's installer from a release's assets. Note the Linux AppImage is
// named `...-linux-x86_64.AppImage` (electron-builder emits the `x86_64` arch
// string, not the `x64` from our artifactName template), so match on extension.
const ASSET_MATCHERS: Record<Platform, (name: string) => boolean> = {
  'mac-arm64': (n) => n.includes('mac-arm64') && n.endsWith('.dmg'),
  'mac-intel': (n) => n.includes('mac-x64') && n.endsWith('.dmg'),
  windows: (n) => n.endsWith('.exe'),
  linux: (n) => n.endsWith('.AppImage'),
}

type GitRef = { ref: string }
type GithubAsset = { name: string; browser_download_url: string }
type GithubRelease = { tag_name: string; assets: GithubAsset[] }

// Accept X.Y.Z with an optional pre-release suffix (e.g. `1.2.0-rc.1`) so a
// pre-release desktop tag isn't silently dropped — important since this is
// explicitly a beta product that may ship RC builds.
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** Compare two `VERSION_RE`-valid version strings by semver precedence. */
function compareSemver(a: string, b: string): number {
  const ma = VERSION_RE.exec(a)!
  const mb = VERSION_RE.exec(b)!
  for (let i = 1; i <= 3; i++) {
    const diff = Number(ma[i]) - Number(mb[i])
    if (diff !== 0) return diff
  }
  // Equal core: a release (no suffix) outranks a pre-release; between two
  // pre-releases, compare the suffix lexically.
  const preA = ma[4]
  const preB = mb[4]
  if (!preA && !preB) return 0
  if (!preA) return 1
  if (!preB) return -1
  return preA < preB ? -1 : preA > preB ? 1 : 0
}

/** Highest-semver `freebuff-desktop-v*` tag on the community repo, or null. */
async function resolveLatestVersion(): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${RELEASES_REPO}/git/matching-refs/tags/${DESKTOP_TAG_PREFIX}`,
    { headers: GITHUB_HEADERS, next: { revalidate: UPSTREAM_TTL_SECONDS } },
  )
  if (!res.ok) throw new Error(`GitHub matching-refs ${res.status}`)
  const body = await res.json()
  // matching-refs returns an array; guard so an unexpected shape doesn't throw
  // (which would surface as a misleading 502 despite a 200 from GitHub).
  const refs = Array.isArray(body) ? (body as GitRef[]) : []
  const versions = refs
    .map((r) => r.ref.replace(`refs/tags/${DESKTOP_TAG_PREFIX}`, ''))
    .filter((v) => VERSION_RE.test(v))
    .sort(compareSemver)
  return versions.at(-1) ?? null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: raw } = await params
  const matchAsset = ASSET_MATCHERS[raw?.toLowerCase() as Platform]
  if (!matchAsset) {
    return NextResponse.json(
      {
        error: `Unknown platform "${raw}". Use mac-arm64, mac-intel, windows, or linux.`,
      },
      { status: 400 },
    )
  }

  let release: GithubRelease
  try {
    const version = await resolveLatestVersion()
    if (!version) {
      return NextResponse.json(
        { error: 'No Freebuff Desktop release found yet.' },
        { status: 404 },
      )
    }
    const res = await fetch(
      `https://api.github.com/repos/${RELEASES_REPO}/releases/tags/${DESKTOP_TAG_PREFIX}${version}`,
      { headers: GITHUB_HEADERS, next: { revalidate: UPSTREAM_TTL_SECONDS } },
    )
    if (!res.ok) throw new Error(`GitHub release-by-tag ${res.status}`)
    release = (await res.json()) as GithubRelease
  } catch {
    return NextResponse.json(
      { error: 'Could not reach the release server. Try again shortly.' },
      { status: 502 },
    )
  }

  const asset = release.assets.find((a) => matchAsset(a.name))
  if (!asset) {
    return NextResponse.json(
      { error: `No ${raw} installer in ${release.tag_name}.` },
      { status: 404 },
    )
  }

  return NextResponse.redirect(asset.browser_download_url, {
    status: 302,
    headers: {
      'Cache-Control':
        'public, max-age=0, s-maxage=300, stale-while-revalidate=60',
    },
  })
}
