import { convertPortfolio } from 'common/portfolio'
import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getPortfolioBySlug(slug: string) {
  const { data } = await run(db.from('portfolios').select().eq('slug', slug))
  if (data && data.length > 0) {
    return convertPortfolio(data[0])
  }
  return null
}

export async function getAllPortfolios() {
  const { data } = await run(db.from('portfolios').select('*'))
  if (data && data.length > 0) {
    return data.map(convertPortfolio)
  }
  return []
}
