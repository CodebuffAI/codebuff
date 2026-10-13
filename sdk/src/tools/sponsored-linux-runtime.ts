import fs from 'fs'
import path from 'path'

// Nix's store holds the executables AND their dynamic loaders/libraries. A
// profile's bin directory alone is not a usable runtime. Only the store is
// exposed, read-only; /nix/var and the user's home remain outside the sandbox.
export const SPONSORED_LINUX_RUNTIME_ROOTS = [
  '/usr',
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  '/nix/store',
] as const

const BWRAP_PATHS = [
  '/usr/bin/bwrap',
  '/bin/bwrap',
  '/usr/local/bin/bwrap',
  // Preserve NixOS's wrapper spelling: it may carry the privilege needed to
  // create a user namespace. This executable runs on the HOST, not inside it.
  '/run/wrappers/bin/bwrap',
  '/run/current-system/sw/bin/bwrap',
]

export type SponsoredLinuxPaths = {
  exists: (pathname: string) => boolean
  realpath: (pathname: string) => string
  searchPath: string
}

function isNixStorePath(value: string): boolean {
  return (
    value.startsWith('/nix/store/') && path.posix.normalize(value) === value
  )
}

/** Find the sandbox itself without trusting a bwrap from the project/PATH. */
export function findBubblewrap(
  dependencies: Partial<SponsoredLinuxPaths> = {},
): string | null {
  const exists = dependencies.exists ?? fs.existsSync
  const fixed = BWRAP_PATHS.find(exists)
  if (fixed) return fixed

  const realpath = dependencies.realpath ?? fs.realpathSync
  const searchPath = dependencies.searchPath ?? process.env.PATH ?? ''
  for (const directory of searchPath.split(':')) {
    if (!path.posix.isAbsolute(directory)) continue
    try {
      const candidate = realpath(path.posix.join(directory, 'bwrap'))
      // Nix profiles/dev shells resolve to immutable store executables. Do
      // not broaden this to an arbitrary PATH lookup: the run can edit a
      // project-local executable that would then impersonate the sandbox.
      if (isNixStorePath(candidate) && exists(candidate)) return candidate
    } catch {
      // Missing command or broken profile link; try the next PATH entry.
    }
  }
  return null
}

/** Keep Nix tools usable without mounting their profile's home or /run tree. */
export function sponsoredLinuxRuntimePath(
  value: string,
  realpath: (pathname: string) => string = fs.realpathSync,
): string {
  if (!path.posix.isAbsolute(value)) return value
  try {
    const resolved = realpath(value)
    return isNixStorePath(resolved) ? resolved : value
  } catch {
    return value
  }
}

export function sponsoredLinuxSearchPath(
  value: string,
  realpath: (pathname: string) => string = fs.realpathSync,
): string {
  return value
    .split(':')
    .map((entry) => sponsoredLinuxRuntimePath(entry, realpath))
    .join(':')
}
