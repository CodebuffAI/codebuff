import { z } from 'zod'

export const FIRESTORE_DOC_REF_ID_REGEX = /^[a-zA-Z0-9_-]{1,}$/

export const searchProps = z
  .object({
    term: z.string().optional(),
    filter: z
      .union([
        z.literal('open'),
        z.literal('closing-this-month'),
        z.literal('closing-next-month'),
        z.literal('closed'),
        z.literal('resolved'),
        z.literal('all'),
      ])
      .default('all'),
    sort: z
      .union([
        z.literal('newest'),
        z.literal('score'),
        z.literal('daily-score'),
        z.literal('freshness-score'),
        z.literal('24-hour-vol'),
        z.literal('most-popular'),
        z.literal('liquidity'),
        z.literal('subsidy'),
        z.literal('last-updated'),
        z.literal('close-date'),
        z.literal('resolve-date'),
        z.literal('random'),
        z.literal('bounty-amount'),
        z.literal('prob-descending'),
        z.literal('prob-ascending'),
      ])
      .default('most-popular'),
    contractType: z
      .union([
        z.literal('ALL'),
        z.literal('BINARY'),
        z.literal('MULTIPLE_CHOICE'),
        z.literal('FREE_RESPONSE'),
        z.literal('PSEUDO_NUMERIC'),
        z.literal('BOUNTIED_QUESTION'),
        z.literal('STONK'),
        z.literal('POLL'),
        z.literal('NUMBER'),
      ])
      .default('ALL'),
    offset: z.coerce.number().gte(0).default(0),
    limit: z.coerce.number().gt(0).lte(1000).default(100),
    topicSlug: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
    forYou: z.union([z.literal('1'), z.literal('0')]).default('0'),
    creatorId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
    isPrizeMarket: z
      .union([
        z.literal('true'),
        z.literal('false'),
        z.literal('1'),
        z.literal('0'),
      ])
      .default('0'),
    marketTier: z
      .string()
      .regex(/^[01]{5}$/)
      .default('00000'),
    isSweepies: z
      .union([
        z.literal('true'),
        z.literal('false'),
        z.literal('1'),
        z.literal('0'),
      ])
      .default('0'),
  })
  .strict()
