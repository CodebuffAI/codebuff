export function nextSelectableFreebuffModelId(params: {
  modelIds: readonly string[]
  focusedId: string
  direction: 'forward' | 'backward'
  isSelectable: (modelId: string) => boolean
}): string | null {
  const { modelIds, focusedId, direction, isSelectable } = params
  if (modelIds.length === 0) return null

  const currentIdx = modelIds.indexOf(focusedId)
  if (currentIdx === -1) return null

  const step = direction === 'forward' ? 1 : -1
  // Include a full wrap back to the current item so arrows stay on the same
  // selectable model when every peer is unavailable.
  for (let offset = 1; offset <= modelIds.length; offset++) {
    const idx =
      (currentIdx + step * offset + modelIds.length) % modelIds.length
    const candidate = modelIds[idx]
    if (isSelectable(candidate)) return candidate
  }

  return null
}

export function resolveFreebuffModelCommitTarget(params: {
  focusedId: string
  selectedId: string
  committedId: string | null
  isSelectable: (modelId: string) => boolean
}): string | null {
  const { focusedId, selectedId, committedId, isSelectable } = params
  const targetId = isSelectable(focusedId) ? focusedId : selectedId

  if (!isSelectable(targetId) || targetId === committedId) return null
  return targetId
}
