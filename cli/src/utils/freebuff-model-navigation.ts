export function nextFreebuffModelId(params: {
  modelIds: readonly string[]
  focusedId: string
  direction: 'forward' | 'backward'
}): string | null {
  const { modelIds, focusedId, direction } = params
  if (modelIds.length === 0) return null

  const currentIdx = modelIds.indexOf(focusedId)
  if (currentIdx === -1) return modelIds[0] ?? null

  const step = direction === 'forward' ? 1 : -1
  return modelIds[(currentIdx + step + modelIds.length) % modelIds.length]
}

export function resolveFreebuffModelCommitTarget(params: {
  focusedId: string
  committedId: string | null
  isSelectable: (modelId: string) => boolean
}): string | null {
  const { focusedId, committedId, isSelectable } = params

  if (!isSelectable(focusedId) || focusedId === committedId) return null
  return focusedId
}
