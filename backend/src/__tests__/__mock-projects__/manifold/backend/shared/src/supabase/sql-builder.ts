import { last } from 'lodash'
import { buildArray } from 'common/util/array'
import { pgp } from './init'

export type SqlBuilder = {
  with: string[]
  select: string[]
  from: string | undefined
  join: string[]
  leftJoin: string[]
  where: string[]
  orderBy: string[]
  groupBy: string[]
  limit: number | undefined
  offset: number | undefined
}

export type SqlParts = {
  with?: string
  select?: string
  from?: string
  join?: string
  leftJoin?: string
  groupBy?: string
  where?: string
  orderBy?: string
  limit?: number
  offset?: number
}

type Args = (Args | SqlParts | SqlBuilder | undefined | false | 0 | '')[]

export function buildSql(...parts: Args): SqlBuilder {
  const definedParts = buildArray(parts)

  return {
    with: definedParts.flatMap((part) => part.with || []),
    select: definedParts.flatMap((part) => part.select || []),
    from: last(definedParts.filter((part) => part.from))?.from,
    join: definedParts.flatMap((part) => part.join || []),
    leftJoin: definedParts.flatMap((part) => part.leftJoin || []),
    where: definedParts.flatMap((part) => part.where || []),
    orderBy: definedParts.flatMap((part) => part.orderBy || []),
    groupBy: definedParts.flatMap((part) => part.groupBy || []),
    limit: last(definedParts.filter((part) => part.limit))?.limit,
    offset: last(definedParts.filter((part) => part.offset))?.offset,
  }
}

export function withClause(clause: string, formatValues?: any) {
  const formattedWith = pgp.as.format(clause, formatValues)
  return buildSql({ with: formattedWith })
}

export function select(clause: string) {
  return buildSql({ select: clause })
}

export function from(clause: string, formatValues?: any) {
  const from = pgp.as.format(clause, formatValues)
  return buildSql({ from })
}

export function join(clause: string) {
  return buildSql({ join: clause })
}

export function leftJoin(clause: string, formatValues?: any) {
  const leftJoin = pgp.as.format(clause, formatValues)
  return buildSql({ leftJoin })
}

export function groupBy(clause: string) {
  return buildSql({ groupBy: clause })
}

export function where(clause: string, formatValues?: any) {
  const where = pgp.as.format(clause, formatValues)
  return buildSql({ where })
}

export function orderBy(clause: string, formatValues?: any) {
  const orderBy = pgp.as.format(clause, formatValues)
  return buildSql({ orderBy })
}

export function limit(limit: number, offset?: number) {
  return buildSql({ limit, offset })
}

export function renderSql(...args: Args) {
  const builder = buildSql(...args)

  const {
    with: withClause,
    select,
    from,
    join,
    where,
    orderBy,
    limit,
    offset,
    leftJoin,
    groupBy,
  } = builder
  return buildArray(
    withClause.length && `with ${withClause.join(', ')}`,
    select.length && `select ${select.join(', ')}`,
    from && `from ${from}`,
    join.length && `join ${join.join(' join ')}`,
    leftJoin.length && `left join ${leftJoin.join(' left join ')}`,
    where.length &&
      `where ${where.map((clause) => `(${clause})`).join(' and ')}`,
    groupBy.length && `group by ${groupBy.join(', ')}`,
    orderBy.length && `order by ${orderBy.join(', ')}`,
    limit && `limit ${limit}`,
    limit && offset && `offset ${offset}`
  ).join('\n')
}
