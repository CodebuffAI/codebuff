import { authEndpoint, validate } from './helpers/endpoint'
import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { MAX_PORTFOLIO_NAME_LENGTH, convertPortfolio } from 'common/portfolio'

const schema = z.object({
  id: z.string(),
  name: z.string().min(1).max(MAX_PORTFOLIO_NAME_LENGTH).optional(),
  items: z
    .array(
      z.object({
        contractId: z.string(),
        answerId: z.string().optional(),
        position: z.union([z.literal('YES'), z.literal('NO')]),
      })
    )
    .optional(),
})

export const updateportfolio = authEndpoint(async (req) => {
  const { id, name, items } = validate(schema, req.body)

  console.log('updating', id, name, items)
  const pg = createSupabaseDirectClient()

  let updatedPortfolio
  if (name) {
    updatedPortfolio = await pg.one(
      'update portfolios set name = $2 where id = $1 returning *',
      [id, name],
      convertPortfolio
    )
  }
  if (items) {
    updatedPortfolio = await pg.one(
      'update portfolios set items = $2 where id = $1 returning *',
      [id, JSON.stringify(items)],
      convertPortfolio
    )
  }
  console.log('updated portfolio', updatedPortfolio)
  return { status: 'success', portfolio: updatedPortfolio }
})
