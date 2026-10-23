import { expect, test } from 'bun:test'

import {
  FREEBUFF_BOUNTIES_ENABLED,
  isBountyListable,
} from './freebuff-bounties'

test('Reddit bounties stay unlisted whatever the program switch says', () => {
  for (const id of [
    'reddit-post',
    'reddit-comments',
    'reddit-competitor-comments',
  ]) {
    expect(isBountyListable(id)).toBe(false)
  }
})

test('other bounties follow the program switch', () => {
  expect(isBountyListable('x-follow')).toBe(FREEBUFF_BOUNTIES_ENABLED)
})
