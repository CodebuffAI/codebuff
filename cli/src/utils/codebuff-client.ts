import { CodebuffClient, LOCAL_MODE_API_KEY } from '@codebuff/sdk'

// Singleton instance of the SDK's CodebuffClient for reuse within the CLI
let clientInstance: CodebuffClient | null = null

let lastApiKey: string | null = null

/**
 * Reset the API client singleton so it picks up new settings
 * on the next call to getCodebuffClient().
 */
export function resetCodebuffClient(): void {
  clientInstance = null
  lastApiKey = null
}

export function getCodebuffClient(): CodebuffClient {
  const apiKey = LOCAL_MODE_API_KEY

  // Reuse singleton when key hasn't changed
  if (clientInstance) {
    if (apiKey === lastApiKey) return clientInstance
  }

  clientInstance = new CodebuffClient({
    apiKey,
    localMode: true,
  })
  lastApiKey = apiKey

  return clientInstance
}