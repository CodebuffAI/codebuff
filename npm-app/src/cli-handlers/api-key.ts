import { yellow } from 'picocolors'
import { Client } from '../client'
import { API_KEY_TYPES, ApiKeyType, KEY_LENGTHS, KEY_PREFIXES } from 'common/api-keys/constants'

export type ApiKeyDetectionResult =
  | { status: 'found'; type: ApiKeyType; key: string }
  | { status: 'prefix_only'; type: ApiKeyType; prefix: string; length: number }
  | { status: 'not_found' }

/**
 * Detects if the user input contains a known API key pattern.
 * Returns information about the detected key or prefix.
 */
export function detectApiKey(userInput: string): ApiKeyDetectionResult {
  // Build regex patterns for each key type
  const keyPatterns = API_KEY_TYPES.map((keyType) => {
    const prefix = KEY_PREFIXES[keyType]
    const length = KEY_LENGTHS[keyType]
    const escapedPrefix = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    return {
      type: keyType,
      prefix: prefix,
      length: length,
      // Regex to find the key potentially surrounded by whitespace or at start/end
      regex: new RegExp(
        `(?:^|\\s)(${escapedPrefix}[^\\s]{${length - prefix.length}})(?:\\s|$)`
      ),
    }
  })

  // Test input against each pattern for a full match
  for (const patternInfo of keyPatterns) {
    const match = userInput.match(patternInfo.regex)
    if (match && match[1]) {
      // Found a full, valid key pattern
      return { status: 'found', type: patternInfo.type, key: match[1] }
    }
  }

  // If no full key matched, check if the input *starts* with any known prefix
  for (const patternInfo of keyPatterns) {
    if (userInput.includes(patternInfo.prefix)) {
      // Found a prefix, but it didn't match the full pattern (wrong length/format)
      return {
        status: 'prefix_only',
        type: patternInfo.type,
        prefix: patternInfo.prefix,
        length: patternInfo.length,
      }
    }
  }

  // No valid key or known prefix detected
  return { status: 'not_found' }
}

/**
 * Handles the result of API key detection.
 */
export async function handleApiKeyInput(
  client: Client,
  detectionResult: Exclude<ApiKeyDetectionResult, { status: 'not_found' }>,
  readyPromise: Promise<any>,
  returnControlToUser: () => void
): Promise<void> {
  switch (detectionResult.status) {
    case 'found':
      await readyPromise
      // Call the client method to add the valid key
      await client.handleAddApiKey(
        detectionResult.type,
        detectionResult.key
      )
      // Note: client.handleAddApiKey calls returnControlToUser internally
      break
    case 'prefix_only':
      // Print the warning for incorrect format/length
      console.log(
        yellow(
          `Input looks like a ${detectionResult.type} API key but has the wrong length or format. Expected ${detectionResult.length} characters starting with "${detectionResult.prefix}".`
        )
      )
      returnControlToUser() // Give the user a fresh prompt after the warning
      break
  }
}