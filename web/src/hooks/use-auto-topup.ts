import { convertStripeGrantAmountToCredits } from '@codebuff/common/util/currency'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash/debounce'
import { useState, useCallback, useRef, useEffect } from 'react'

import type { AutoTopupState } from '@/components/auto-topup/types'
import type { UserProfile } from '@/types/user'

import { AUTO_TOPUP_CONSTANTS } from '@/components/auto-topup/constants'
import { toast } from '@/components/ui/use-toast'
import { clamp } from '@/lib/utils'

const {
  MIN_THRESHOLD_CREDITS,
  MAX_THRESHOLD_CREDITS,
  MIN_TOPUP_DOLLARS,
  MAX_TOPUP_DOLLARS,
  CENTS_PER_CREDIT,
} = AUTO_TOPUP_CONSTANTS

export function useAutoTopup(): AutoTopupState {
  const queryClient = useQueryClient()
  const [isEnabled, setIsEnabled] = useState(false)
  const [threshold, setThreshold] = useState<number>(MIN_THRESHOLD_CREDITS)
  const [topUpAmountDollars, setTopUpAmountDollars] =
    useState<number>(MIN_TOPUP_DOLLARS)
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
          MAX_THRESHOLD_CREDITS,
        ),
        initialTopUpDollars: clamp(
          topUpDollars > 0 ? topUpDollars : MIN_TOPUP_DOLLARS,
          MIN_TOPUP_DOLLARS,
          MAX_TOPUP_DOLLARS,
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
        userProfile.initialTopUpDollars ?? MIN_TOPUP_DOLLARS,
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
      >,
    ) => {
      const payload = {
        enabled: settings.auto_topup_enabled,
        threshold: settings.auto_topup_threshold,
        amount: settings.auto_topup_amount,
      }

      if (typeof payload.enabled !== 'boolean') {
        throw new Error('Internal error: Auto-topup enabled state is invalid.')
      }

      if (payload.enabled) {
        if (!payload.threshold) throw new Error('Threshold is required.')
        if (!payload.amount) throw new Error('Amount is required.')
        if (
          payload.threshold < MIN_THRESHOLD_CREDITS ||
          payload.threshold > MAX_THRESHOLD_CREDITS
        ) {
          throw new Error('Invalid threshold value.')
        }
        if (
          payload.amount < MIN_TOPUP_DOLLARS ||
          payload.amount > MAX_TOPUP_DOLLARS
        ) {
          throw new Error('Invalid top-up amount value.')
        }

        const topUpCredits = convertStripeGrantAmountToCredits(
          payload.amount * 100,
          CENTS_PER_CREDIT,
        )
        const minTopUpCredits = convertStripeGrantAmountToCredits(
          MIN_TOPUP_DOLLARS * 100,
          CENTS_PER_CREDIT,
        )
        const maxTopUpCredits = convertStripeGrantAmountToCredits(
          MAX_TOPUP_DOLLARS * 100,
          CENTS_PER_CREDIT,
        )

        if (topUpCredits < minTopUpCredits || topUpCredits > maxTopUpCredits) {
          throw new Error(
            `Top-up amount must result in between ${minTopUpCredits} and ${maxTopUpCredits} credits.`,
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
        throw new Error(errorData.error || 'Failed to update settings')
      }

      return response.json()
    },
    onSuccess: (data, variables) => {
      const wasEnabled = variables.auto_topup_enabled
      const savingSettings =
        variables.auto_topup_threshold !== undefined &&
        variables.auto_topup_amount !== undefined

      if (wasEnabled && savingSettings) {
        toast({ title: 'Auto Top-up settings saved!' })
      }

      queryClient.setQueryData(['userProfile'], (oldData: any) => {
        if (!oldData) return oldData

        const savedEnabled =
          data?.auto_topup_enabled ?? variables.auto_topup_enabled
        const savedThreshold =
          data?.auto_topup_threshold ??
          variables.auto_topup_threshold ??
          MIN_THRESHOLD_CREDITS
        const savedAmountCents =
          data?.auto_topup_amount ??
          (variables.auto_topup_amount
            ? Math.round(variables.auto_topup_amount * 100)
            : null)

        const updatedData = {
          ...oldData,
          auto_topup_enabled: savedEnabled,
          auto_topup_threshold: savedEnabled ? savedThreshold : null,
          auto_topup_amount: savedEnabled ? savedAmountCents : null,
          initialTopUpDollars:
            savedEnabled && savedAmountCents
              ? savedAmountCents / 100
              : MIN_TOPUP_DOLLARS,
        }

        setIsEnabled(updatedData.auto_topup_enabled ?? false)
        setThreshold(updatedData.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS)
        setTopUpAmountDollars(
          updatedData.initialTopUpDollars ?? MIN_TOPUP_DOLLARS,
        )

        return updatedData
      })

      pendingSettings.current = null
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      })
      if (userProfile) {
        setIsEnabled(userProfile.auto_topup_enabled ?? false)
        setThreshold(userProfile.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS)
        setTopUpAmountDollars(
          userProfile.initialTopUpDollars ?? MIN_TOPUP_DOLLARS,
        )
      }
      pendingSettings.current = null
    },
  })

  const debouncedSaveSettings = useCallback(
    debounce(() => {
      if (!pendingSettings.current) return

      const {
        threshold: currentThreshold,
        topUpAmountDollars: currentTopUpDollars,
      } = pendingSettings.current

      if (
        currentThreshold === userProfile?.auto_topup_threshold &&
        Math.round(currentTopUpDollars * 100) ===
          userProfile?.auto_topup_amount &&
        userProfile?.auto_topup_enabled === true
      ) {
        pendingSettings.current = null
        return
      }

      autoTopupMutation.mutate({
        auto_topup_enabled: true,
        auto_topup_threshold: currentThreshold,
        auto_topup_amount: currentTopUpDollars,
      })
    }, 750),
    [autoTopupMutation, userProfile],
  )

  const handleThresholdChange = (rawValue: number) => {
    // Allow any value for UI display
    setThreshold(rawValue)

    if (isEnabled) {
      // Make sure we send a valid value to the server
      const validValue = clamp(
        rawValue,
        MIN_THRESHOLD_CREDITS,
        MAX_THRESHOLD_CREDITS,
      )
      pendingSettings.current = { threshold: validValue, topUpAmountDollars }

      // Only save if the value is valid
      if (
        rawValue >= MIN_THRESHOLD_CREDITS &&
        rawValue <= MAX_THRESHOLD_CREDITS
      ) {
        debouncedSaveSettings()
      }
    }
  }

  const handleTopUpAmountChange = (rawValue: number) => {
    // Allow any value for UI display
    setTopUpAmountDollars(rawValue)

    if (isEnabled) {
      // Make sure we send a valid value to the server
      const validValue = clamp(rawValue, MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS)
      pendingSettings.current = { threshold, topUpAmountDollars: validValue }

      // Only save if the value is valid
      if (rawValue >= MIN_TOPUP_DOLLARS && rawValue <= MAX_TOPUP_DOLLARS) {
        debouncedSaveSettings()
      }
    }
  }

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
          description:
            'Cannot enable auto top-up with current values. Please ensure they are within limits.',
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
        },
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
        },
      )
    }
  }

  return {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingProfile,
    isPending: autoTopupMutation.isPending,
    userProfile: userProfile ?? null,
    handleToggleAutoTopup,
    handleThresholdChange,
    handleTopUpAmountChange,
  }
}
