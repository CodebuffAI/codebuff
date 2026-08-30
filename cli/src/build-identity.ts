export const BUILD_IDENTITY_SCHEMA_VERSION = 1 as const

export type BuildIdentity = {
  schemaVersion: typeof BUILD_IDENTITY_SCHEMA_VERSION
  product: string
  version: string
  target: string
}

/**
 * Machine-readable identity embedded into every compiled CLI artifact.
 * The release launcher verifies this before replacing an installed binary.
 */
export function createBuildIdentity({
  product,
  version,
  target,
}: Omit<BuildIdentity, 'schemaVersion'>): BuildIdentity {
  return {
    schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
    product,
    version,
    target,
  }
}
