import { PLACEMENT_SLOTS } from '../constants/freebuff-placements'

/** Available canonical waiting-room inventory, in catalog order. */
export const WAITING_ROOM_PLACEMENT_IDS = PLACEMENT_SLOTS.filter(
  (slot) => slot.available && slot.surface === 'waiting_room',
).map((slot) => slot.id)

export const WAITING_ROOM_MIN_CARD_WIDTH = 60

/** The exact canonical prefix that can fit in the landing-screen ad row. */
export function visibleWaitingRoomPlacementIds(
  terminalWidth: number,
): string[] {
  const availableWidth = terminalWidth - 2
  const count = Math.min(
    WAITING_ROOM_PLACEMENT_IDS.length,
    Math.max(1, Math.floor(availableWidth / WAITING_ROOM_MIN_CARD_WIDTH)),
  )
  return WAITING_ROOM_PLACEMENT_IDS.slice(0, count)
}
