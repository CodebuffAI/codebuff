import { z } from 'zod'
import { randomUUID } from 'crypto'

import { getUser } from 'shared/utils'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import {
  MAX_PORTFOLIO_NAME_LENGTH,
  Portfolio,
  convertPortfolio,
} from 'common/portfolio'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const portfolioSchema = z.object({
  name: z.string().min(1).max(MAX_PORTFOLIO_NAME_LENGTH),
  items: z.array(
    z.object({
      contractId: z.string(),
      answerId: z.string().optional(),
      position: z.union([z.literal('YES'), z.literal('NO')]),
    })
  ),
})

export const createportfolio = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  const { name, items } = validate(portfolioSchema, req.body)

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')

  const slug = await getSlug(name)

  console.log(
    'creating portfolio owned by',
    creator.username,
    'name',
    name,
    'slug',
    slug,
    'items',
    items
  )

  const portfolio: Portfolio = {
    id: randomUUID(),
    creatorId: creator.id,
    slug,
    name,
    items,
    createdTime: Date.now(),
  }

  const returnedPortfolio = await pg.one(
    'insert into portfolios (id, creator_id, slug, name, items) values ($1, $2, $3, $4, $5) returning *',
    [
      portfolio.id,
      portfolio.creatorId,
      portfolio.slug,
      portfolio.name,
      JSON.stringify(portfolio.items),
    ],
    convertPortfolio
  )

  console.log('returned portfolio', returnedPortfolio)

  return { status: 'success', portfolio: returnedPortfolio }
})

export const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)

  const preexistingPortfolio = await portfolioExists(proposedSlug)

  return preexistingPortfolio
    ? proposedSlug + '-' + randomString()
    : proposedSlug
}

export async function portfolioExists(slug: string) {
  const pg = createSupabaseDirectClient()
  const post = await pg.oneOrNone(`select 1 from portfolios where slug = $1`, [
    slug,
  ])

  return !!post
}
