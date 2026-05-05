export type FreebuffModelNavigationDirection = 'forward' | 'backward'

export function nextFreebuffModelId(params: {
  modelIds: readonly string[]
  focusedId: string
  direction: FreebuffModelNavigationDirection
}): string | null {
  const { modelIds, focusedId, direction } = params
  if (modelIds.length === 0) return null

  const currentIdx = modelIds.indexOf(focusedId)
  if (currentIdx === -1) return modelIds[0] ?? null

  const step = direction === 'forward' ? 1 : -1
  return modelIds[(currentIdx + step + modelIds.length) % modelIds.length]
}

export function freebuffModelNavigationDirectionForKey(key: {
  name?: string
  shift?: boolean
  sequence?: string
  raw?: string
}): FreebuffModelNavigationDirection | null {
  const name = (key.name ?? '').toLowerCase()
  const sequence = key.sequence ?? key.raw ?? ''

  if (name === 'right' || name === 'down') return 'forward'
  if (name === 'left' || name === 'up') return 'backward'

  const isShiftTab =
    (name === 'tab' && Boolean(key.shift)) ||
    sequence === '\x1b[Z' ||
    sequence === '\x1b[9;2u' ||
    sequence === '\x1b[27;2;9~'
  if (isShiftTab) return 'backward'

  if (name === 'tab' || sequence === '\t' || sequence === '\x1b[9u') {
    return 'forward'
  }

  return null
}
