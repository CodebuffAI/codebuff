import { describe, expect, test } from 'bun:test'

import {
  createAccountDeletionProof,
  verifyAccountDeletionProof,
} from './account-deletion-proof'

const SECRET = 'account-deletion-proof-secret-at-least-32-chars'

describe('account deletion proof', () => {
  test('round-trips only for the bound subject and code', async () => {
    const proof = await createAccountDeletionProof(SECRET, 'user-1', '123456')

    expect(
      await verifyAccountDeletionProof(proof, SECRET, 'user-1', '123456'),
    ).toBe(true)
    expect(
      await verifyAccountDeletionProof(proof, SECRET, 'user-2', '123456'),
    ).toBe(false)
    expect(
      await verifyAccountDeletionProof(proof, SECRET, 'user-1', '654321'),
    ).toBe(false)
  })

  test('length-prefixes fields so concatenation cannot collide', async () => {
    const first = await createAccountDeletionProof(SECRET, 'ab', 'c')
    const second = await createAccountDeletionProof(SECRET, 'a', 'bc')
    expect(first).not.toBe(second)
  })

  test('refuses a weak shared secret', async () => {
    await expect(
      createAccountDeletionProof('short', 'user-1', '123456'),
    ).rejects.toThrow('at least 32 characters')
  })

  test('rejects malformed and truncated proofs', async () => {
    const proof = await createAccountDeletionProof(SECRET, 'user-1', '123456')
    expect(
      await verifyAccountDeletionProof(
        proof.slice(0, -1),
        SECRET,
        'user-1',
        '123456',
      ),
    ).toBe(false)
  })
})
