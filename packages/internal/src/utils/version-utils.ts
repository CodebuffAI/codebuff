import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and, desc } from 'drizzle-orm'

/**
 * Parse a semantic version string into its components
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } {
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

/**
 * Increment the patch version of a semantic version string
 */
export function incrementPatchVersion(version: string): string {
  const { major, minor, patch } = parseVersion(version)
  return `${major}.${minor}.${patch + 1}`
}

/**
 * Get the latest version for an agent from the database
 */
export async function getLatestAgentVersion(
  agentId: string,
  publisherId: string
): Promise<string | null> {
  const latestAgent = await db
    .select({
      version: schema.agentTemplate.version,
    })
    .from(schema.agentTemplate)
    .where(
      and(
        eq(schema.agentTemplate.id, agentId),
        eq(schema.agentTemplate.publisher_id, publisherId)
      )
    )
    .orderBy(
      desc(schema.agentTemplate.major),
      desc(schema.agentTemplate.minor),
      desc(schema.agentTemplate.patch)
    )
    .limit(1)
    .then((rows) => rows[0])

  return latestAgent?.version || null
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
  providedVersion?: string
): Promise<string> {
  if (providedVersion) {
    // Validate the provided version format
    if (!/^\d+\.\d+\.\d+$/.test(providedVersion)) {
      throw new Error(`Invalid version format: ${providedVersion}. Must be in semver format (e.g., 1.0.0)`)
    }
    return providedVersion
  }

  // No version provided, determine automatically
  const latestVersion = await getLatestAgentVersion(agentId, publisherId)
  
  if (latestVersion) {
    // Agent exists, increment patch version
    return incrementPatchVersion(latestVersion)
  } else {
    // New agent, start with 0.0.1
    return '0.0.1'
  }
}

/**
 * Check if a specific version already exists for an agent
 */
export async function versionExists(
  agentId: string,
  version: string,
  publisherId: string
): Promise<boolean> {
  const existingAgent = await db
    .select()
    .from(schema.agentTemplate)
    .where(
      and(
        eq(schema.agentTemplate.id, agentId),
        eq(schema.agentTemplate.version, version),
        eq(schema.agentTemplate.publisher_id, publisherId)
      )
    )
    .then((rows) => rows[0])

  return !!existingAgent
}