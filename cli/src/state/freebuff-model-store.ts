import {
  DEFAULT_FREEBUFF_MODEL_ID,
  resolveAvailableFreebuffModel,
  resolveSupportedFreebuffModel,
} from '@codebuff/common/constants/freebuff-models'
import { create } from 'zustand'

import { loadFreebuffModelPreference } from '../utils/settings'

/**
 * Holds the user's currently-selected freebuff model. Initialized from the
 * persisted settings file so freebuff defaults to whatever model the user
 * last picked.
 *
 * `setSelectedModel` is in-memory only — it does NOT persist. Persistence
 * happens exclusively in `startFreebuffSession` (the explicit-pick path), so
 * server-driven auto-flips (`model_locked`, `model_unavailable`, takeover)
 * can update the in-memory selection without overwriting the user's saved
 * preference. The latter previously caused users to get permanently flipped
 * to the fallback model after a single auto-fallback.
 *
 * Components on the landing screen read this to highlight the current row in
 * the model picker; the session hook reads it to decide which model to start.
 */
interface FreebuffModelStore {
  selectedModel: string
  setSelectedModel: (model: string) => void
}

export const useFreebuffModelStore = create<FreebuffModelStore>((set) => ({
  selectedModel: resolveAvailableFreebuffModel(
    loadFreebuffModelPreference() ?? DEFAULT_FREEBUFF_MODEL_ID,
  ),
  setSelectedModel: (model) =>
    set({ selectedModel: resolveSupportedFreebuffModel(model) }),
}))

/** Imperative read for non-React callers (the session hook's tick loop and
 *  the chat-completions metadata builder). */
export function getSelectedFreebuffModel(): string {
  return useFreebuffModelStore.getState().selectedModel
}
