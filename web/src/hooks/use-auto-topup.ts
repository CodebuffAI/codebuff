import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast'
import { UserProfile } from '@/types/user'
import { clamp } from '@/lib/utils'
import debounce from 'lodash/debounce'
import {
  convertCreditsToUsdCents,
  convertStripeGrantAmountToCredits,
} from 'common/src/billing/credit-conversion'

const MIN_THRESHOLD_CREDITS = 100
const MAX_THRESHOLD_CREDITS = 10000
const MIN_TOPUP_DOLLARS = 5.0
const MAX_TOPUP_DOLLARS = 100.0
const CENTS_PER_CREDIT = 1

export function useAutoTopup() {
  const queryClient = useQueryClient()
  const [isEnabled, setIsEnabled] = useState(false)
  const [threshold, setThreshold] = useState(MIN_THRESHOLD_CREDITS)
  const [topUpAmountDollars, setTopUpAmountDollars] =
    useState(MIN_TOPUP_DOLLARS)
  const isInitialLoad = useRef(true)
  const pendingSettings = useRef<{
    threshold: number
    topUpAmountDollars: number
  } | null>(null)

  const { data: userProfile, isLoading: isLoadingProfile } = useQuery<
    UserProfile & { initialTopUpDollars?: number }
  >({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const response = await fetch('/api/user/profile')
      if (!response.ok) throw new Error('Failed to fetch profile')
      const data = await response.json()
      const thresholdCredits =
        data.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS
      const topUpAmount = data.auto_topup_amount ?? MIN_TOPUP_DOLLARS * 100
      const topUpDollars = topUpAmount / 100

      return {
        ...data,
        auto_topup_enabled: data.auto_topup_enabled ?? false,
        auto_topup_threshold: clamp(
          thresholdCredits,
          MIN_THRESHOLD_CREDITS,
          MAX_THRESHOLD_CREDITS
        ),
        initialTopUpDollars: clamp(
          topUpDollars > 0 ? topUpDollars : MIN_TOPUP_DOLLARS,
          MIN_TOPUP_DOLLARS,
          MAX_TOPUP_DOLLARS
        ),
      }
    },
  })

  useEffect(() => {
    if (userProfile?.auto_topup_blocked_reason && isEnabled) {
      setIsEnabled(false)
      toast({
        title: 'Auto Top-up Disabled',
        description: userProfile.auto_topup_blocked_reason,
        variant: 'destructive',
      })
    }
  }, [userProfile?.auto_topup_blocked_reason, isEnabled])

  useEffect(() => {
    if (userProfile) {
      setIsEnabled(userProfile.auto_topup_enabled ?? false)
      setThreshold(userProfile.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS)
      setTopUpAmountDollars(
        userProfile.initialTopUpDollars ?? MIN_TOPUP_DOLLARS
      )
      setTimeout(() => {
        isInitialLoad.current = false
      }, 0)
    }
  }, [userProfile])

  const autoTopupMutation = useMutation({
    mutationFn: async (
      settings: Partial<
        Pick<
          UserProfile,
          'auto_topup_enabled' | 'auto_topup_threshold' | 'auto_topup_amount'
        >
      >
    ) => {
      const payload = {
        enabled: settings.auto_topup_enabled,
        threshold: settings.auto_topup_threshold,
        amount: settings.auto_topup_amount,
      }

      if (typeof payload.enabled !== 'boolean') {
        console.error(
          "Auto-topup 'enabled' state is not boolean before sending to API:",
          payload.enabled
        )
        throw new Error('Internal error: Auto-topup enabled state is invalid.')
      }

      if (payload.enabled) {
        if (payload.threshold === null || payload.threshold === undefined)
          throw new Error('Threshold is required.')
        if (payload.amount === null || payload.amount === undefined)
          throw new Error('Amount is required.')
        if (
          payload.threshold < MIN_THRESHOLD_CREDITS ||
          payload.threshold > MAX_THRESHOLD_CREDITS
        )
          throw new Error('Invalid threshold value.')

        if (
          payload.amount < MIN_TOPUP_DOLLARS ||
          payload.amount > MAX_TOPUP_DOLLARS
        )
          throw new Error('Invalid top-up amount value.')

        const topUpCredits = convertStripeGrantAmountToCredits(
          payload.amount * 100,
          CENTS_PER_CREDIT
        )
        const minTopUpCredits = convertStripeGrantAmountToCredits(
          MIN_TOPUP_DOLLARS * 100,
          CENTS_PER_CREDIT
        )
        const maxTopUpCredits = convertStripeGrantAmountToCredits(
          MAX_TOPUP_DOLLARS * 100,
          CENTS_PER_CREDIT
        )
        if (topUpCredits < minTopUpCredits || topUpCredits > maxTopUpCredits) {
          throw new Error(
            `Top-up amount must result in between ${minTopUpCredits} and ${maxTopUpCredits} credits.`
          )
        }
      }

      const response = await fetch('/api/user/auto-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          amount: payload.amount ? Math.round(payload.amount * 100) : null,
        }),
      })
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to update settings' }))
        let message = errorData.error || 'Failed to update settings'
        if (errorData.issues) {
          message = errorData.issues
            .map((issue: any) => issue.message)
            .join(', ')
        } else if (response.status === 400) {
          message = errorData.error || 'Invalid settings provided.'
        }
        throw new Error(message)
      }
      return response.json()
    },
    onSuccess: (data, variables) => {
      const wasEnabled = variables.auto_topup_enabled
      const savingSettings =
        variables.auto_topup_threshold !== undefined &&
        variables.auto_topup_amount !== undefined

      let toastMessage = ''
      if (wasEnabled && savingSettings) {
        toastMessage = 'Auto Top-up settings saved!'
      }

      if (toastMessage) {
        toast({ title: toastMessage })
      }

      queryClient.setQueryData(
        ['userProfile'],
        (
          oldData: (UserProfile & { initialTopUpDollars?: number }) | undefined
        ) => {
          if (!oldData) return oldData

          const savedEnabled =
            data?.auto_topup_enabled ?? variables.auto_topup_enabled
          const savedThreshold =
            data?.auto_topup_threshold ?? variables.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS
          const savedAmountCents =
            data?.auto_topup_amount ?? (variables.auto_topup_amount ? Math.round(variables.auto_topup_amount * 100) : null)

          const updatedData = {
            ...oldData,
            auto_topup_enabled: savedEnabled,
            auto_topup_threshold: savedEnabled ? savedThreshold : null,
            auto_topup_amount: savedEnabled ? savedAmountCents : null,
            initialTopUpDollars: savedEnabled && savedAmountCents ? savedAmountCents / 100 : MIN_TOPUP_DOLLARS,
          }

          setIsEnabled(updatedData.auto_topup_enabled ?? false)
          setThreshold(
            updatedData.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS
          )
          setTopUpAmountDollars(
            updatedData.initialTopUpDollars ?? MIN_TOPUP_DOLLARS
          )

          return updatedData
        }
      )

      pendingSettings.current = null
    },
    onError: (error: Error, variables) => {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      })
      if (userProfile) {
        setIsEnabled(userProfile.auto_topup_enabled ?? false)
        setThreshold(userProfile.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS)
        setTopUpAmountDollars(
          userProfile.initialTopUpDollars ?? MIN_TOPUP_DOLLARS
        )
      }
      pendingSettings.current = null
    },
  })

  const handleThresholdInputChange = (rawValue: number) => {
    const clampedValue = clamp(
      rawValue,
      MIN_THRESHOLD_CREDITS,
      MAX_THRESHOLD_CREDITS
    )
    setThreshold(clampedValue)
    if (isEnabled) {
      pendingSettings.current = {
        threshold: clampedValue,
        topUpAmountDollars,
      }
      debouncedSaveSettings()
    }
  }

  const handleTopUpAmountInputChange = (rawValue: number) => {
    const clampedValue = clamp(rawValue, MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS)
    setTopUpAmountDollars(clampedValue)
    if (isEnabled) {
      pendingSettings.current = {
        threshold,
        topUpAmountDollars: clampedValue,
      }
      debouncedSaveSettings()
    }
  }

  const debouncedSaveSettings = useCallback(
    debounce(() => {
      if (!pendingSettings.current) return

      const { threshold: currentThreshold, topUpAmountDollars: currentTopUpDollars } =
        pendingSettings.current

      if (
        currentThreshold < MIN_THRESHOLD_CREDITS ||
        currentThreshold > MAX_THRESHOLD_CREDITS
      ) {
        console.error(
          'Debounced save called with invalid threshold:',
          currentThreshold
        )
        return
      }
      if (
        currentTopUpDollars < MIN_TOPUP_DOLLARS ||
        currentTopUpDollars > MAX_TOPUP_DOLLARS
      ) {
        console.error(
          'Debounced save called with invalid top-up amount:',
          currentTopUpDollars
        )
        return
      }

      if (
        currentThreshold === userProfile?.auto_topup_threshold &&
        Math.round(currentTopUpDollars * 100) === userProfile?.auto_topup_amount &&
        userProfile?.auto_topup_enabled === true
      ) {
        pendingSettings.current = null
        return
      }

      console.log('Debounced save triggered', {
        threshold: currentThreshold,
        topUpAmount: currentTopUpDollars,
      })
      autoTopupMutation.mutate({
        auto_topup_enabled: true,
        auto_topup_threshold: currentThreshold,
        auto_topup_amount: currentTopUpDollars,
      })
    }, 750),
    [autoTopupMutation, userProfile]
  )

  const handleToggleAutoTopup = (checked: boolean) => {
    if (checked && userProfile?.auto_topup_blocked_reason) {
      toast({
        title: 'Cannot Enable Auto Top-up',
        description: userProfile.auto_topup_blocked_reason,
        variant: 'destructive',
      })
      return
    }

    setIsEnabled(checked)
    debouncedSaveSettings.cancel()
    pendingSettings.current = null

    if (checked) {
      if (
        threshold < MIN_THRESHOLD_CREDITS ||
        threshold > MAX_THRESHOLD_CREDITS ||
        topUpAmountDollars < MIN_TOPUP_DOLLARS ||
        topUpAmountDollars > MAX_TOPUP_DOLLARS
      ) {
        toast({
          title: 'Invalid Settings',
          description: `Cannot enable auto top-up with current values. Please ensure they are within limits.`,
          variant: 'destructive',
        })
        setIsEnabled(false)
        return
      }

      autoTopupMutation.mutate(
        {
          auto_topup_enabled: true,
          auto_topup_threshold: threshold,
          auto_topup_amount: topUpAmountDollars,
        },
        {
          onSuccess: () => {
            toast({
              title: 'Auto Top-up enabled!',
              description: `We'll automatically add credits when your balance falls below ${threshold.toLocaleString()} credits.`,
            })
          },
          onError: () => {
            setIsEnabled(false)
          },
        }
      )
    } else {
      autoTopupMutation.mutate(
        {
          auto_topup_enabled: false,
          auto_topup_threshold: null,
          auto_topup_amount: null,
        },
        {
          onSuccess: () => {
            toast({ title: 'Auto Top-up disabled.' })
          },
          onError: () => {
            setIsEnabled(true)
          },
        }
      )
    }
  }

  return {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingProfile,
    userProfile,
    handleThresholdInputChange,
    handleTopUpAmountInputChange,
    handleToggleAutoTopup,
    isPending: autoTopupMutation.isPending,
  }
}

export const AUTO_TOPUP_CONSTANTS = {
  MIN_THRESHOLD_CREDITS,
  MAX_THRESHOLD_CREDITS,
  MIN_TOPUP_DOLLARS,
  MAX_TOPUP_DOLLARS,
  CENTS_PER_CREDIT,
}