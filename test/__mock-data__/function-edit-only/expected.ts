import { Tool } from '@anthropic-ai/sdk/resources'
import axios from 'axios'

const MANIFOLD_API_BASE_URL = 'https://manifold.markets/api/v0'

async function searchManifoldMarkets(query: string): Promise<any> {
  const response = await axios.get(`${MANIFOLD_API_BASE_URL}/search-markets`, {
    params: { term: query, limit: 1 }
  })
  return response.data[0]
}

export const getTools = (): Tool[] => {
  return [
    {
      name: 'read_files',
      description: `Retrieves the current contents of files given a list of file paths in the user's project. You should provide an array of file paths that refer to existing files in the user's project. The tool will provide the file contents for each. It should be used frequently and liberally to gain context on the user's coding questions and before modifying each file. You should not invoke the tool more than once to read the same file if it likely has not changed. This tool should not be used to create or modify files directly -- only to read them.`,
      input_schema: {
        type: 'object',
        properties: {
          file_paths: {
            type: 'array',
            description: 'The file paths to read',
          },
        },
      },
    } as Tool,
    {
      name: 'search_manifold_market',
      description: 'Searches for a relevant market on Manifold Markets and returns its current probability.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query for finding a relevant market',
          },
        },
        required: ['query'],
      },
    } as Tool,
  ]
}

export const executeToolCall = async (name: string, input: any): Promise<any> => {
  switch (name) {
    case 'search_manifold_market':
      const market = await searchManifoldMarkets(input.query)
      if (market) {
        return {
          title: market.question,
          url: market.url,
          probability: market.probability,
        }
      } else {
        return { error: 'No matching market found' }
      }
    // Add other tool cases here
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
