
import axios from 'axios'

const MANIFOLD_API_BASE_URL = 'https://api.manifold.markets/v0'

interface ManifoldMarket {
  id: string
  question: string
  probability: number
  url: string
}

export async function searchManifoldMarkets(query: string, limit: number = 5): Promise<ManifoldMarket[]> {
  try {
    console.log('sending markets request', query, limit)
    const response = await axios.get(`${MANIFOLD_API_BASE_URL}/search-markets`, {
      params: {
        term: query,
        limit,
        contractType: 'BINARY',
      },
    })
    console.log('got response', response.data)

    return response.data.map((market: any) => ({
      id: market.id,
      question: market.question,
      probability: market.probability,
      url: market.url,
    }))
  } catch (error) {
    console.error('Error searching Manifold markets:', error)
    throw new Error('Failed to search Manifold markets')
  }
}
