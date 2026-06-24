import { create } from 'zustand'

/**
 * A keyboard-focus target contributed to the landing screen by a component
 * that sits *below* the model picker (currently the GLM referral banner). The
 * model selector owns the single keyboard handler for the landing block, so
 * sibling controls register here to ride the same up/down arrow navigation:
 * arrowing down past "See all models" walks into these targets (and wraps).
 */
export interface FreebuffLandingFocusTarget {
  /** Stable id used as the navigation key (and matched against `focusedId`). */
  id: string
  /** Fired when Enter/Space is pressed while this target is focused. */
  activate: () => void
}

/**
 * Bridges keyboard focus between the model selector (which owns the landing
 * screen's keyboard handler) and the sibling referral banner. The selector
 * mirrors its focused element id here so the banner can render its own button
 * as focused, and reads `extraTargets` so its arrow navigation can flow into —
 * and back out of — the banner's buttons.
 */
interface FreebuffLandingFocusStore {
  /** The element id the model selector currently has focused. Mirrored so the
   *  referral banner can highlight its matching button. `null` when the
   *  selector is unmounted or focus sits on a row the banner doesn't own. */
  focusedId: string | null
  setFocusedId: (id: string | null) => void
  /** Focus targets contributed by the referral banner, in navigation order.
   *  Appended after the picker's own rows + toggle. */
  extraTargets: FreebuffLandingFocusTarget[]
  setExtraTargets: (targets: FreebuffLandingFocusTarget[]) => void
}

export const useFreebuffLandingFocusStore = create<FreebuffLandingFocusStore>(
  (set) => ({
    focusedId: null,
    setFocusedId: (focusedId) => set({ focusedId }),
    extraTargets: [],
    setExtraTargets: (extraTargets) => set({ extraTargets }),
  }),
)
