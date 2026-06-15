declare module 'open-websearch/build/engines/duckduckgo/index.js' {
  export type DuckDuckGoSearchResult = {
    title?: string
    url?: string
    description?: string
  }

  export function searchDuckDuckGo(
    query: string,
    limit: number,
  ): Promise<DuckDuckGoSearchResult[]>
}
