import { writeFile, readFile } from 'fs/promises'

export const writeJson = async <T>(filename: string, obj: T) => {
  console.log('\n', 'Writing to', filename, '\n')
  await writeFile(filename, JSON.stringify(obj))
}

export const readJson = async <T>(filename: string) => {
  let data: string
  try {
    data = await readFile(filename, { encoding: 'utf-8' })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
      // File doesn't exist.
      console.log('File does not exist:', filename)
      return undefined
    } else {
      throw e
    }
  }

  return JSON.parse(data) as T
}

const SEPARATOR = ','

export const writeCsv = async <T extends { [field: string]: string }>(
  filename: string,
  fields: string[],
  data: T[],
  seperator = SEPARATOR
) => {
  console.log('\n', 'Writing to', filename, '\n')

  const firstLine = fields.join(seperator) + '\n'

  const lines =
    firstLine +
    data
      .map((datum) => {
        const values = fields.map((field) => datum[field] ?? '')
        return values.join(seperator)
      })
      .join('\n') +
    '\n'

  await writeFile(filename, lines)
}

export const readCsv = async <T extends { [field: string]: string }>(
  filename: string
) => {
  let data: string
  try {
    data = await readFile(filename, { encoding: 'utf-8' })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
      // File doesn't exist.
      return undefined
    } else {
      throw e
    }
  }
  const lines = data.split('\n')

  const fields = lines[0].split(SEPARATOR)

  const rows: T[] = []

  for (const line of lines.slice(1)) {
    const items = line.split(SEPARATOR)
    const row: { [field: string]: string } = {}

    for (let i = 0; i < items.length; i++) row[fields[i]] = items[i]

    rows.push(row as T)
  }

  return rows
}
