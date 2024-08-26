import { createRNG } from 'common/util/random'
import { ensureDeviceToken } from 'web/components/auth-context'
import { track } from 'web/lib/service/analytics'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

const AB_TEST_CACHE: Record<string, boolean> = {}

export const useABTest = <T extends string>(
  testName: string,
  variants: T[],
  trackingProperties?: Record<string, unknown>
) => {
  const [variant, setVariant] = usePersistentInMemoryState<T | undefined>(
    undefined,
    `ab-test-${testName}`
  )

  useEffectCheckEquality(() => {
    const deviceId = ensureDeviceToken()
    if (!deviceId) return

    const rand = createRNG(testName + deviceId)
    const keys = variants.sort()
    const randomVariant = keys[Math.floor(rand() * keys.length)]

    setVariant(randomVariant)

    // Only track once per user session
    if (!AB_TEST_CACHE[testName]) {
      AB_TEST_CACHE[testName] = true
      track(testName, { ...trackingProperties, variant: randomVariant })
    }
  }, [testName, trackingProperties, variants])

  return variant
}
