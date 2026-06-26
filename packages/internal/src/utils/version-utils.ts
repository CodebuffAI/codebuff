export type Version = { major: number; minor: number; patch: number }

export function versionOne(): Version {
  return { major: 0, minor: 0, patch: 1 }
}

/**
 * Parse a semantic version string into its components
 */
export function parseVersion(version: string): Version {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`Invalid semantic version format: ${version}`)
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

export function stringifyVersion(version: Version): string {
  return `${version.major}.${version.minor}.${version.patch}`
}

/**
 * Increment the patch version of a semantic version string
 */
export function incrementPatchVersion(version: Version): Version {
  return { ...version, patch: version.patch + 1 }
}

export function isGreater(v1: Version, v2: Version): boolean {
  if (v1.major !== v2.major) {
    return v1.major > v2.major
  }

  if (v1.minor !== v2.minor) {
    return v1.minor > v2.minor
  }

  return v1.patch > v2.patch
}
