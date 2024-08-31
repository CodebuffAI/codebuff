import { sortBy } from 'lodash'
import { pgp, SupabaseDirectClient } from './init'
import { DataFor, Tables, TableName, Column, Row } from 'common/supabase/utils'

export async function getIds<T extends TableName>(
  db: SupabaseDirectClient,
  table: T
) {
  return db.map('select id from $1~', [table], (r) => r.id as string)
}

export async function insert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(db: SupabaseDirectClient, table: T, values: ColumnValues) {
  const columnNames = Object.keys(values)
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const query = pgp.helpers.insert(values, cs)
  // Hack to properly cast values.
  const q = query.replace(/::(\w*)'/g, "'::$1")
  return await db.one<Row<T>>(q + ` returning *`)
}

export async function bulkInsert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(db: SupabaseDirectClient, table: T, values: ColumnValues[]) {
  if (values.length == 0) {
    return []
  }
  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const query = pgp.helpers.insert(values, cs)
  // Hack to properly cast values.
  const q = query.replace(/::(\w*)'/g, "'::$1")
  return await db.many<Row<T>>(q + ` returning *`)
}

export async function update<
  T extends TableName,
  ColumnValues extends Tables[T]['Update']
>(
  db: SupabaseDirectClient,
  table: T,
  idField: Column<T>,
  values: ColumnValues
) {
  const columnNames = Object.keys(values)
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  if (!(idField in values)) {
    throw new Error(`missing ${idField} in values for ${columnNames}`)
  }
  const clause = pgp.as.format(
    `${idField} = $1`,
    values[idField as keyof ColumnValues]
  )
  const query = pgp.helpers.update(values, cs) + ` WHERE ${clause}`
  // Hack to properly cast values.
  const q = query.replace(/::(\w*)'/g, "'::$1")
  return await db.one<Row<T>>(q + ` returning *`)
}

export async function bulkUpdate<
  T extends TableName,
  ColumnValues extends Tables[T]['Update']
>(
  db: SupabaseDirectClient,
  table: T,
  idFields: Column<T>[],
  values: ColumnValues[],
  timeoutMs?: number // only works with SupabaseDirectClientTimeout
) {
  if (values.length) {
    const columnNames = Object.keys(values[0])
    const cs = new pgp.helpers.ColumnSet(columnNames, { table })
    const clause = idFields.map((f) => `v.${f} = t.${f}`).join(' and ')
    const query = pgp.helpers.update(values, cs) + ` WHERE ${clause}`
    // Hack to properly cast values.
    const q = query.replace(/::(\w*)'/g, "'::$1")
    if (timeoutMs) {
      if (!('timeout' in db)) {
        throw new Error(
          'bulkUpdate with timeoutMs is not supported in a transaction'
        )
      }
      await db.timeout(timeoutMs, (t) => t.none(q))
    } else {
      await db.none(q)
    }
  }
}

export async function bulkUpsert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert'],
  Col extends Column<T>
>(
  db: SupabaseDirectClient,
  table: T,
  idField: Col | Col[],
  values: ColumnValues[],
  onConflict?: string
) {
  if (!values.length) return

  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const baseQuery = pgp.helpers.insert(values, cs)
  // Hack to properly cast values.
  const baseQueryReplaced = baseQuery.replace(/::(\w*)'/g, "'::$1")

  const primaryKey = Array.isArray(idField) ? idField.join(', ') : idField
  const upsertAssigns = cs.assignColumns({ from: 'excluded', skip: idField })
  const query =
    `${baseQueryReplaced} on ` +
    (onConflict ? onConflict : `conflict(${primaryKey})`) +
    ' ' +
    (upsertAssigns ? `do update set ${upsertAssigns}` : `do nothing`)

  await db.none(query)
}

// Replacement for BulkWriter
export async function bulkUpdateData<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  // TODO: explicit id field
  updates: (Partial<DataFor<T>> & { id: string })[]
) {
  if (updates.length > 0) {
    const values = updates
      .map((update) => `('${update.id}', '${JSON.stringify(update)}'::jsonb)`)
      .join(',\n')

    await db.none(
      `update ${table} as c
        set data = data || v.update
      from (values ${values}) as v(id, update)
      where c.id = v.id`
    )
  }
}

// Replacement for firebase updateDoc. Updates just the data field (what firebase would've replicated to)
export async function updateData<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  idField: Column<T>,
  data: DataUpdate<T>
) {
  const { [idField]: id, ...rest } = data
  if (!id) throw new Error(`Missing id field ${idField} in data`)

  const basic: Partial<DataFor<T>> = {}
  const extras: string[] = []
  for (const key in rest) {
    const val = rest[key as keyof typeof rest]
    if (typeof val === 'function') {
      extras.push(val(key))
    } else {
      basic[key as keyof typeof rest] = val
    }
  }
  const sortedExtraOperations = sortBy(extras, (statement) =>
    statement.startsWith('-') ? -1 : 1
  )

  return await db.one<Row<T>>(
    `update ${table} set data = data
    ${sortedExtraOperations.join('\n')}
    || $1
    where ${idField} = '${id}' returning *`,
    [JSON.stringify(basic)]
  )
}

/*
 * this attempts to copy the firebase syntax
 * each returns a function that takes the field name and returns a sql string that updateData can handle
 */
export const FieldVal = {
  increment: (n: number) => (fieldName: string) =>
    `|| jsonb_build_object('${fieldName}', (data->'${fieldName}')::numeric + ${n})`,

  delete: () => (fieldName: string) => `- '${fieldName}'`,

  arrayConcat:
    (...values: string[]) =>
    (fieldName: string) => {
      return pgp.as.format(
        `|| jsonb_build_object($1, coalesce(data->$1, '[]'::jsonb) || $2:json)`,
        [fieldName, values]
      )
    },

  arrayRemove:
    (...values: string[]) =>
    (fieldName: string) => {
      return pgp.as.format(
        `|| jsonb_build_object($1, coalesce(data->$1,'[]'::jsonb) - '{$2:raw}'::text[])`,
        [fieldName, values.join(',')]
      )
    },
}

type ValOrFieldVal<R extends Record<string, any>> = {
  [key in keyof R]?: R[key] | ((fieldName: string) => string)
}

export type DataUpdate<T extends TableName> = ValOrFieldVal<DataFor<T>>
