import { describe, expect, test } from 'bun:test'

import {
  AD_PLACEMENT_CPC_SELF_SERVE_CEILING_CENTS,
  advertiserPlacementCpcBand,
} from './freebuff-topups'

describe('advertiserPlacementCpcBand', () => {
  test('uses the conservative $10 ceiling when an operator has not set one', () => {
    expect(
      advertiserPlacementCpcBand({ floorOverrideCents: null, ceilingCents: null }),
    ).toEqual({ floorCents: 100, ceilingCents: AD_PLACEMENT_CPC_SELF_SERVE_CEILING_CENTS })
  })

  test('keeps the operator floor exception and tighter ceiling intact', () => {
    expect(
      advertiserPlacementCpcBand({ floorOverrideCents: 50, ceilingCents: 500 }),
    ).toEqual({ floorCents: 50, ceilingCents: 500 })
  })
})
