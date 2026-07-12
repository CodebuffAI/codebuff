import { IndexManager } from '@codebuff/indexer'
import { AskUserBridge } from '@codebuff/common/utils/ask-user-bridge'
import {
  OpenbuffClient,
  loadProviderConfigSync,
  createConfiguredEmbedder,
} from '@openbuff/sdk'

import { getRgPath } from '../native/ripgrep'
import { getProjectRoot } from '../project-files'
import { getCliEnv, getSystemProcessEnv } from './env'
import { logger } from './logger'

import type { ClientToolCall } from '@codebuff/common/tools/list'
import type { JSONObject } from '@codebuff/common/types/json'

// Singleton instance of the SDK's OpenbuffClient for reuse within the CLI
let clientInstance: OpenbuffClient | null = null

/**
 * Recursively removes undefined values from an object to ensure clean JSON serialization.
 * This prevents issues with APIs that don't accept explicit undefined values.
 */
function removeUndefinedValues<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues) as T
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = removeUndefinedValues(value)
      }
    }
    return result as T
  }
  return obj
}

/**
 * Reset the API client singleton so it picks up new settings
 * on the next call to getCodebuffClient().
 */
export function resetCodebuffClient(): void {
  clientInstance = null
}

export async function getCodebuffClient(): Promise<OpenbuffClient> {
  // Reuse singleton
  if (clientInstance) {
    return clientInstance
  }

  // Set up ripgrep path for SDK to use
  const env = getCliEnv()
  if (env.CODEBUFF_IS_BINARY) {
    try {
      const rgPath = await getRgPath()
      // Note: We still set process.env here because SDK reads from it
      getSystemProcessEnv().CODEBUFF_RG_PATH = rgPath
    } catch (error) {
      logger.error(error, 'Failed to set up ripgrep binary for SDK')
    }
  }

  clientInstance = new OpenbuffClient({
    cwd: getProjectRoot(),
    logger,
    filesystemResultFormat: 'structured-v1',
    overrideTools: {
      ask_user: async (input: ClientToolCall<'ask_user'>['input']) => {
        const askUserResponse = await AskUserBridge.request(
          'cli-override',
          input.questions,
        )
        const response = askUserResponse as {
          answers?: Array<{ questionIndex: number; selectedOption: string }>
          skipped?: boolean
        }
        return [
          {
            type: 'json',
            value: removeUndefinedValues(response),
          },
        ]
      },
      query_index: async (input: ClientToolCall<'query_index'>['input']) => {
        const projectRoot = getProjectRoot()
        const indexingConfig = loadProviderConfigSync().config.indexing
        if (indexingConfig.enabled === false) {
          return [
            {
              type: 'json',
              value: {
                results: [],
                totalIndexed: 0,
                indexAge: 0,
                message:
                  'Codebase indexing is disabled in openbuff.json; fall back to read_subtree, glob, or code_search.',
                status: {
                  state: 'disabled', ready: false, stale: false, refreshing: false,
                  semantic: 'disabled', totalIndexed: 0, indexAge: 0,
                  diagnostics: [], message: 'Indexing is disabled.',
                },
              } as JSONObject,
            },
          ]
        }
        // Wire a provider-backed embedder when semantic indexing is enabled so
        // the index can build vectors and blend semantic hits into results.
        const embedder =
          indexingConfig.semantic?.enabled && indexingConfig.semantic?.model
            ? (createConfiguredEmbedder(indexingConfig.semantic.model) ??
              undefined)
            : undefined
        const manager = IndexManager.getInstance(
          projectRoot,
          indexingConfig,
          embedder,
        )
        await manager.waitUntilReady(2_000)
        const result = await manager.queryBlended(input.query ?? '', {
          limit: input.limit,
          fileTypes: input.fileTypes,
          mode: input.mode,
          from: input.from,
          to: input.to,
        })
        const semanticNotice =
          indexingConfig.semantic?.enabled && !manager.isSemanticReady()
            ? ' Semantic indexing is enabled but unavailable (no routable embedding model or vectors not yet built); results are metadata-only.'
            : ''
        const results = result.results.map((item) => {
          const output: JSONObject = {
            path: item.path,
            score: item.score,
            matchedOn: item.matchedOn,
          }
          if (item.symbols) output.symbols = item.symbols
          if (item.headings) output.headings = item.headings
          if (item.matchedSnippets)
            output.matchedSnippets = item.matchedSnippets
          if (item.relatedFiles) {
            output.relatedFiles = item.relatedFiles.map((related) => {
              const relatedOutput: JSONObject = {
                path: related.path,
                score: related.score,
                reason: related.reason,
              }
              if (related.via) relatedOutput.via = related.via
              return relatedOutput
            })
          }
          if (item.explanation) output.explanation = item.explanation
          return output
        })
        return [
          {
            type: 'json',
            value: {
              results,
              totalIndexed: result.totalIndexed,
              indexAge: result.indexAge,
              status: result.status as unknown as JSONObject,
              message: `${result.status.message} Found ${result.results.length} indexed file result(s).${semanticNotice}`,
            } as JSONObject,
          },
        ]
      },
    },
  })

  return clientInstance
}
