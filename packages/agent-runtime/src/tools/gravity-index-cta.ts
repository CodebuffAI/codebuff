import { failure, success } from '@codebuff/common/util/error'

import type { RenderUIGravityIndexLink } from '@codebuff/common/tools/params/tool/render-ui'
import type { ErrorOr } from '@codebuff/common/util/error'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined

const asHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? value
      : undefined
  } catch {
    return undefined
  }
}

const getJsonResult = (output: readonly unknown[]): JsonRecord | undefined => {
  const jsonPart = output.map(asRecord).find((part) => part?.type === 'json')
  return asRecord(jsonPart?.value)
}

const findSearchResults = (
  messages: readonly Message[],
  searchId: string,
): JsonRecord[] => {
  const results: JsonRecord[] = []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'tool' || message.toolName !== 'gravity_index') {
      continue
    }
    const result = getJsonResult(message.content)
    if (result?.search_id === searchId) results.push(result)
  }
  return results
}

/**
 * Resolves an agent-selected Gravity search/service pair to the exact tracked
 * URL stored in that tool result. A missing or invalid reference fails closed:
 * render_ui never receives a guessed or vendor-homepage fallback.
 */
export const resolveGravityIndexLink = (params: {
  reference: RenderUIGravityIndexLink
  messages: readonly Message[]
}): ErrorOr<string> => {
  const { reference } = params
  const searchResults = findSearchResults(params.messages, reference.search_id)

  if (searchResults.length === 0) {
    return failure(
      new Error(
        `No gravity_index result found for search_id "${reference.search_id}".`,
      ),
    )
  }

  let foundService = false
  for (const searchResult of searchResults) {
    const recommendation = asRecord(searchResult.recommendation)
    const recommendationMatches =
      recommendation?.slug === reference.service_slug
    const selectedService = recommendationMatches
      ? recommendation
      : Array.isArray(searchResult.options)
        ? searchResult.options
            .map(asRecord)
            .find((option) => option?.slug === reference.service_slug)
        : undefined

    if (!selectedService) continue
    foundService = true

    const clickUrl =
      asHttpUrl(selectedService.click_url) ??
      (recommendationMatches ? asHttpUrl(searchResult.click_url) : undefined) ??
      (recommendationMatches
        ? asHttpUrl(asRecord(searchResult.credential_request)?.setup_url)
        : undefined)

    if (clickUrl) return success(clickUrl)
  }

  return failure(
    new Error(
      foundService
        ? `Service "${reference.service_slug}" has no valid tracked click URL in gravity_index search "${reference.search_id}".`
        : `Service "${reference.service_slug}" was not present in gravity_index search "${reference.search_id}".`,
    ),
  )
}
