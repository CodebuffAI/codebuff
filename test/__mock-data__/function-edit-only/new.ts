async function searchManifoldMarkets(query: string): Promise<any> {
  const response = await axios.get(`${MANIFOLD_API_BASE_URL}/search-markets`, {
    params: { term: query, limit: 1 },
  })
  return response.data[0]
}