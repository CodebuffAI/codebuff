import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, desc, eq } from 'drizzle-orm'

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

/**
 * Get the latest version for an agent from the database
 */
export async function getLatestAgentVersion(
  agentId: string,
  publisherId: string,
): Promise<Version> {
  const latestAgent = await db
    .select({
      major: schema.agentConfig.major,
      minor: schema.agentConfig.minor,
      patch: schema.agentConfig.patch,
    })
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.id, agentId),
        eq(schema.agentConfig.publisher_id, publisherId),
      ),
    )
    .orderBy(
      desc(schema.agentConfig.major),
      desc(schema.agentConfig.minor),
      desc(schema.agentConfig.patch),
    )
    .limit(1)
    .then((rows) => rows[0])

  return {
    major: latestAgent?.major ?? 0,
    minor: latestAgent?.minor ?? 0,
    patch: latestAgent?.patch ?? 0,
  }
}

/**
 * Determine the next version for an agent
 * - If no version is provided and agent exists, increment patch of latest version
 * - If no version is provided and agent doesn't exist, use '0.0.1'
 * - If version is provided, validate and use it
 */
export async function determineNextVersion(
  agentId: string,
  publisherId: string,
  providedVersion?: string,
): Promise<Version> {
  const latestVersion = await getLatestAgentVersion(agentId, publisherId)

  if (!providedVersion) {
    return incrementPatchVersion(latestVersion)
  }

  let version: Version
  try {
    version = parseVersion(providedVersion)
  } catch (error) {
    throw new Error(
      `Invalid version format: ${providedVersion}. Must be in semver format (e.g., 1.0.0)`,
    )
  }

  if (!isGreater(version, latestVersion)) {
    throw new Error(
      `Provided version ${providedVersion} must be greater than the latest version (${stringifyVersion(
        latestVersion,
      )})`,
    )
  }

  return version
}

/**
 * Check if a specific version already exists for an agent
 */
export async function versionExists(
  agentId: string,
  version: Version,
  publisherId: string,
): Promise<boolean> {
  const existingAgent = await db
    .select()
    .from(schema.agentConfig)
    .where(
      and(
        eq(schema.agentConfig.id, agentId),
        eq(schema.agentConfig.version, stringifyVersion(version)),
        eq(schema.agentConfig.publisher_id, publisherId),
      ),
    )
    .then((rows) => rows[0])

  return !!existingAgent
}
