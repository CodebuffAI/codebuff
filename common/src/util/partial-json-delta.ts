// TODO: optimize this to not be O(n^2)
export function parsePartialJsonObject(content: string): {
  lastParamComplete: boolean
  params: any
} {
  try {
    return { lastParamComplete: true, params: JSON.parse(content) }
  } catch (error) {}

  try {
    return { lastParamComplete: true, params: JSON.parse(content + '}') }
  } catch (error) {}

  try {
    return { lastParamComplete: false, params: JSON.parse(content + '"}') }
  } catch (error) {}

  let lastIndex = content.lastIndexOf(',')
  while (lastIndex > 0) {
    try {
      return {
        lastParamComplete: true,
        params: JSON.parse(content.slice(0, lastIndex) + '}'),
      }
    } catch (error) {}

    lastIndex = content.lastIndexOf(',', lastIndex - 1)
  }

  return { lastParamComplete: true, params: {} }
}

export function getPartialJsonDelta(
  content: string,
  previous: Record<string, any>
): {
  delta: Record<string, any>
  result: Record<string, any>
  lastParam: { key: string | undefined; complete: boolean }
} {
  const { lastParamComplete, params: current } = parsePartialJsonObject(content)

  const entries = Object.entries(current)
  const lastKey = (entries[entries.length - 1] ?? [undefined])[0]

  const delta: Record<string, any> = {}
  for (const [key, value] of Object.entries(current)) {
    if (previous[key] === value) {
      continue
    }
    if (typeof value === 'string') {
      delta[key] = value.slice((previous[key] ?? '').length)
    } else {
      delta[key] = value
    }
  }

  return {
    delta,
    result: current,
    lastParam: {
      key: lastKey,
      complete: lastParamComplete,
    },
  }
}
