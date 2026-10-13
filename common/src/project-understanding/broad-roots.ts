/**
 * Folders too broad to be "a project": the project-understanding agent never runs on
 * them (docs/freebuff-project-understanding.md). Opening the home folder, Desktop
 * or Documents in Freebuff is not a request to have everything in it looked at.
 *
 * Pure and platform-parameterised so it is testable anywhere: no node:os, no
 * node:path. The caller passes the user's home directory.
 */

type Platform = 'darwin' | 'win32' | 'linux' | (string & {})

/** Folders directly under home that hold a user's files, not one project.
 *  Lower-case; compared case-insensitively on every platform. */
const BROAD_HOME_FOLDERS: ReadonlySet<string> = new Set([
  'desktop',
  'documents',
  'downloads',
  'library',
  'pictures',
  'movies',
  'music',
  'public',
  'applications',
  'videos',
  'icloud drive',
  'dropbox',
  'google drive',
  'onedrive',
])

/** Synced-drive roots directly under home; the user folders inside one
 *  (`~/OneDrive/Documents`, Windows' redirected Desktop) are broad too. */
function isCloudDriveFolder(name: string): boolean {
  return (
    name === 'onedrive' ||
    name.startsWith('onedrive - ') ||
    name === 'icloud drive' ||
    name === 'dropbox' ||
    name === 'google drive'
  )
}

/** POSIX system folders (lower-case segments from `/`). */
const BROAD_POSIX_PATHS: readonly string[][] = [
  ['tmp'],
  ['private'],
  ['private', 'tmp'],
  ['private', 'var'],
  ['var'],
  ['etc'],
  ['applications'],
  ['system'],
  ['library'],
  ['usr'],
  ['opt'],
  ['bin'],
  ['sbin'],
  ['volumes'],
  ['mnt'],
  ['media'],
  ['srv'],
]

/** POSIX folders whose direct children are mount points (a volume's root). */
const POSIX_MOUNT_PARENTS: ReadonlySet<string> = new Set([
  'volumes',
  'mnt',
  'media',
])

/** Windows system folders under a drive root (lower-case). */
const BROAD_WIN32_PATHS: readonly string[][] = [
  ['windows'],
  ['program files'],
  ['program files (x86)'],
  ['programdata'],
  ['users'],
  ['users', 'public'],
]

type ParsedPath = { prefix: string; segments: string[] }

/**
 * An absolute path split into a root prefix and its segments, with `.` and
 * `..` resolved. `null` for a path that is not absolute: there is nothing to
 * resolve it against here.
 */
function parseAbsolute(input: string, platform: Platform): ParsedPath | null {
  const win = platform === 'win32'
  let rest = win ? input.replace(/\\/g, '/') : input
  let prefix: string
  if (win) {
    const drive = /^([a-zA-Z]):(\/|$)/.exec(rest)
    const unc = /^\/\/([^/]+)\/([^/]+)/.exec(rest)
    if (drive) {
      prefix = `${drive[1]!.toLowerCase()}:`
      rest = rest.slice(2)
    } else if (unc) {
      prefix = `//${unc[1]}/${unc[2]}`
      rest = rest.slice(unc[0].length)
    } else {
      return null
    }
  } else {
    if (!rest.startsWith('/')) return null
    prefix = '/'
  }
  const segments: string[] = []
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return { prefix, segments }
}

function caseInsensitive(platform: Platform): boolean {
  return platform === 'darwin' || platform === 'win32'
}

function startsWithSegments(path: string[], prefix: string[]): boolean {
  return (
    prefix.length <= path.length &&
    prefix.every((segment, i) => path[i] === segment)
  )
}

function equalSegments(a: string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, i) => segment === b[i])
}

/**
 * Whether `root` is too broad to look at: the filesystem root, the home folder
 * or any folder above it (`/Users`, `/home`, `C:\Users`), a user folder
 * directly under home (Desktop, Documents, Downloads, Library, Pictures,
 * Movies, Music, Public, Applications, Videos, OneDrive and `OneDrive - *`,
 * iCloud Drive, Dropbox, Google Drive, and the user folders inside a synced
 * drive), the macOS cloud-storage roots (`~/Library/Mobile Documents`, its
 * `com~apple~CloudDocs`, and each `~/Library/CloudStorage/*`), or a system
 * folder (`/tmp`, `/private/tmp`, `/var`, `/etc`, `/Applications`, `/System`,
 * `/usr`, `/opt`, `/Volumes` and a volume root under it, `C:\Windows`, ...).
 *
 * A project folder inside any of them (`~/Documents/my-app`) is not broad.
 * A path that is not absolute counts as broad: it cannot be placed, so it is
 * not profiled. Case-insensitive on darwin and win32.
 */
export function isBroadProjectRoot(
  root: string,
  home: string,
  platform: Platform = typeof process !== 'undefined'
    ? process.platform
    : 'linux',
): boolean {
  const parsed = parseAbsolute(root, platform)
  if (!parsed) return true
  const fold = caseInsensitive(platform)
  const norm = (segments: string[]) =>
    fold ? segments.map((s) => s.toLowerCase()) : segments
  const segments = norm(parsed.segments)
  const lower = parsed.segments.map((s) => s.toLowerCase())

  // The filesystem (or drive, or share) root.
  if (segments.length === 0) return true

  // System folders.
  if (platform === 'win32') {
    if (BROAD_WIN32_PATHS.some((p) => equalSegments(lower, p))) return true
  } else {
    if (BROAD_POSIX_PATHS.some((p) => equalSegments(lower, p))) return true
    if (lower.length === 2 && POSIX_MOUNT_PARENTS.has(lower[0]!)) return true
  }

  const homeParsed = parseAbsolute(home, platform)
  if (!homeParsed) return false
  const samePrefix = fold
    ? homeParsed.prefix.toLowerCase() === parsed.prefix.toLowerCase()
    : homeParsed.prefix === parsed.prefix
  if (!samePrefix) return false
  const homeSegments = norm(homeParsed.segments)

  // Home, or any folder above it.
  if (startsWithSegments(homeSegments, segments)) return true
  if (!startsWithSegments(segments, homeSegments)) return false

  // Below home: compared case-insensitively on every platform.
  const below = lower.slice(homeSegments.length)
  const [first, second, third] = below
  if (below.length === 1) {
    return BROAD_HOME_FOLDERS.has(first!) || isCloudDriveFolder(first!)
  }
  if (below.length === 2) {
    if (isCloudDriveFolder(first!) && BROAD_HOME_FOLDERS.has(second!)) {
      return true
    }
    if (first === 'library') {
      return second === 'mobile documents' || second === 'cloudstorage'
    }
    return false
  }
  if (below.length === 3 && first === 'library') {
    return (
      (second === 'mobile documents' && third === 'com~apple~clouddocs') ||
      second === 'cloudstorage'
    )
  }
  return false
}
