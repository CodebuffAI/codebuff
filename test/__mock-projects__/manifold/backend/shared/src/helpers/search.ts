export const constructPrefixTsQuery = (term: string) => {
  const sanitized = term
    .replace(/'/g, "''")
    .replace(/[!&|():*<>]/g, '')
    .trim()
  console.log(`Term: "${sanitized}"`)
  if (sanitized === '') return ''
  const tokens = sanitized.split(/\s+/)
  return tokens.join(' & ') + ':*'
}

export const constructIlikeQuery = (term: string) => {
  const sanitized = term
    .replace(/'/g, "''")
    .replace(/[_%()<>]/g, '')
    .trim()

  if (sanitized === '') return ''
  return '%' + sanitized + '%' // ideally we'd do prefix but many groups have leading emojis
}
