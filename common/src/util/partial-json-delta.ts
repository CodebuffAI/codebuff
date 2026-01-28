export function parsePartialJsonObjectSingle(content: string): {
  lastParamComplete: boolean
  params: any
} {
  try {
    return { lastParamComplete: true, params: JSON.parse(content) }
  } catch {}

  if (!content.match(/\d$/)) {
    try {
      return { lastParamComplete: true, params: JSON.parse(content + '}') }
    } catch {}
  }

  try {
    return { lastParamComplete: false, params: JSON.parse(content + '"}') }
  } catch {}

  if (content.endsWith('\\')) {
    try {
      return {
        lastParamComplete: false,
        params: JSON.parse(content.slice(0, -1) + '"}'),
      }
    } catch {}
  }

  let commaPos = content.length
  while ((commaPos = content.lastIndexOf(',', commaPos - 1)) !== -1) {
    try {
      return {
        lastParamComplete: true,
        params: JSON.parse(content.slice(0, commaPos) + '}'),
      }
    } catch {}
  }

  return { lastParamComplete: true, params: {} }
}

export function getPartialJsonDelta(
  content: string,
  previous: string,
): {
  delta: Record<string, any>
  result: Record<string, any>
  lastParam: { key: string | undefined; complete: boolean }
} {
  if (!content.startsWith(previous)) {
    throw new Error(
      `Content must be previous content plus new content. Content ${JSON.stringify(content)} does not start with previous content ${JSON.stringify(previous)}`,
    )
  }
  const { lastParamComplete, params } = parsePartialJsonObjectSingle(content)
  const lastParam = Object.keys(params).pop()

  const { lastParamComplete: prevLastParamComplete, params: prevParams } =
    parsePartialJsonObjectSingle(previous)
  const prevLastParam = Object.keys(prevParams).pop()

  const entries = Object.entries(params)

  const delta: Record<string, any> = {}
  for (const [key, value] of entries) {
    if (prevParams[key] === value) {
      if (prevLastParam === key && !prevLastParamComplete) {
        delta[key] = ''
      }
      continue
    }
    if (typeof value === 'string') {
      delta[key] = value.slice((prevParams[key] ?? '').length)
    } else {
      delta[key] = value
    }
  }

  return {
    delta,
    result: params,
    lastParam: {
      key: lastParam,
      complete:
        prevLastParam === lastParam
          ? lastParamComplete && !prevLastParamComplete
          : lastParamComplete,
    },
  }
}
