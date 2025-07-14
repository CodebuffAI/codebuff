import { searchWeb } from '../../llm/providers/linkup-api'

export async function handleWebSearch(args: {
  query: string
  depth?: 'standard' | 'deep'
}): Promise<string> {
  try {
    const result = await searchWeb(args.query, { depth: args.depth })
    
    if (!result) {
      return 'No search results found for the given query.'
    }

    return result
  } catch (error) {
    return `Error performing web search: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}
