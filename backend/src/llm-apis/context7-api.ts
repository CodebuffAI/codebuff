import { logger } from '../util/logger'

const CONTEXT7_BASE_URL = 'https://context7.com'
const FETCH_TIMEOUT_MS = 10_000

interface ProjectSettings {
  title: string
  project: string
  folders: string[]
  docsRepoUrl: string
}

interface Version {
  lastUpdate: string
  state:
    | 'initial'
    | 'parsed'
    | 'finalized'
    | 'invalid_docs'
    | 'error'
    | 'stop'
    | 'delete'
  parseDuration: number
  totalTokens: number
  totalSnippets: number
  averageTokens: number
}

interface Project {
  settings: ProjectSettings
  version: Version
}

interface GetChunksOptions {
  tokens?: number
  topic?: string
  folders?: string
}

/**
 * Lists all available documentation projects from Context7
 * @returns Array of projects with their metadata, or empty array if the request fails
 */
async function listContext7Projects(): Promise<Project[]> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), FETCH_TIMEOUT_MS)
    )

    const response = await Promise.race([
      fetch(`${CONTEXT7_BASE_URL}/api/projects`),
      timeoutPromise,
    ])

    if (!response.ok) {
      logger.error(`Failed to fetch Context7 projects: ${response.status}`)
      return []
    }
    return await response.json()
  } catch (error) {
    logger.error({ error }, 'Error fetching Context7 projects')
    return []
  }
}

// Initialize the projects list once and export it as a promise
export const context7ProjectsPromise: Promise<Project[]> =
  listContext7Projects()

/**
 * Gets documentation chunks for a specific project
 * @param projectId The project ID or path to fetch documentation for
 * @param options Optional parameters for the request
 * @param options.tokens Number of tokens to retrieve (default: 5000)
 * @param options.topic Optional topic to rerank context for
 * @param options.folders Optional comma-separated list of folders to include
 * @returns The documentation text chunks or null if no results or request fails
 */
export async function getContext7ProjectChunks(
  projectId: string,
  options: GetChunksOptions = {}
): Promise<string | null> {
  try {
    // Remove leading slash if present
    if (projectId.startsWith('/')) {
      projectId = projectId.slice(1)
    }

    // Build the URL with query parameters
    const params = new URLSearchParams()
    if (options.tokens) {
      params.append('tokens', options.tokens.toString())
    }
    if (options.topic) {
      params.append('topic', options.topic)
    }
    if (options.folders) {
      params.append('folders', options.folders)
    }

    const url = `${CONTEXT7_BASE_URL}/${projectId}/llms.txt${params.toString() ? `?${params.toString()}` : ''}`

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), FETCH_TIMEOUT_MS)
    )

    const response = await Promise.race([fetch(url), timeoutPromise])

    if (!response.ok) {
      logger.error(
        `Failed to fetch Context7 documentation chunks: ${response.status}`
      )
      return null
    }

    const text = await response.text()
    if (
      !text ||
      text === 'No content available' ||
      text === 'No context data available'
    ) {
      return null
    }
    return text
  } catch (error) {
    logger.error({ error }, 'Error fetching Context7 project chunks')
    return null
  }
}
