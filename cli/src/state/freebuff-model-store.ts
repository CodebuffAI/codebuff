import {
  DEFAULT_FREEBUFF_MODEL_ID,
  resolveAvailableFreebuffModel,
} from '@codebuff/common/constants/freebuff-models'
import { create } from 'zustand'

import {
  loadFreebuffModelPreference,
  saveFreebuffModelPreference,
} from '../utils/settings'

/**
 * Holds the user's currently-selected freebuff model. Initialized from the
 * persisted settings file so freebuff defaults to whatever model the user
 * last picked. Writing through `setSelectedModel` also persists to disk so
 * the next launch picks it up without an explicit save call.
 *
 * Components in the waiting room read this to highlight the current row in
 * the model picker; the session hook reads it to decide which queue to join.
 */
interface FreebuffModelStore {
  selectedModel: string
  setSelectedModel: (model: string) => void
}

export const useFreebuffModelStore = create<FreebuffModelStore>((set) => ({
  selectedModel: resolveAvailableFreebuffModel(
    loadFreebuffModelPreference() ?? DEFAULT_FREEBUFF_MODEL_ID,
  ),
  setSelectedModel: (model) => {
    const resolved = resolveAvailableFreebuffModel(model)
    saveFreebuffModelPreference(resolved)
    set({ selectedModel: resolved })
  },
}))

/** Imperative read for non-React callers (the session hook's tick loop and
 *  the chat-completions metadata builder). */
export function getSelectedFreebuffModel(): string {
  return useFreebuffModelStore.getState().selectedModel
}
