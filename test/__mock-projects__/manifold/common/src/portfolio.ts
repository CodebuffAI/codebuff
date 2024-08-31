import { convertSQLtoTS, tsToMillis } from './supabase/utils'

export type Portfolio = {
  id: string
  creatorId: string
  slug: string
  name: string
  items: PortfolioItem[]
  createdTime: number
}

export type PortfolioItem = {
  contractId: string
  answerId?: string
  position: 'YES' | 'NO'
}

export const MAX_PORTFOLIO_NAME_LENGTH = 140

export const convertPortfolio = (portfolioRow: any) => {
  return convertSQLtoTS(portfolioRow, {
    created_time: tsToMillis,
  }) as Portfolio
}

export function portfolioPath(portfolioSlug: string) {
  return `/portfolios/${portfolioSlug}`
}
