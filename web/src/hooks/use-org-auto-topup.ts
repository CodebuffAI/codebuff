import { CREDIT_PRICING } from '@codebuff/common/old-constants'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash/debounce'
import { useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/components/ui/use-toast'
import { clamp } from '@/lib/utils'

// Organization-specific constants based on the plan
const ORG_AUTO_TOPUP_CONSTANTS = {
  MIN_THRESHOLD_CREDITS: 5000,
  MAX_THRESHOLD_CREDITS: 10000,
  MIN_TOPUP_CREDITS: 20000,
  MAX_TOPUP_DOLLARS: 200.0,
  CENTS_PER_CREDIT: CREDIT_PRICING.CENTS_PER_CREDIT,
} as const

const MIN_TOPUP_DOLLARS =
  (ORG_AUTO_TOPUP_CONSTANTS.MIN_TOPUP_CREDITS *
    ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT) /
  100

interface OrganizationSettings {
  id: string
  name: string
  slug: string
  description: string | null
  userRole: 'owner' | 'admin' | 'member'
  autoTopupEnabled: boolean
  autoTopupThreshold: number
  autoTopupAmount: number
  creditLimit: number | null
  billingAlerts: boolean
  usageAlerts: boolean
  weeklyReports: boolean
}

export interface OrgAutoTopupState {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  isLoadingSettings: boolean
  isPending: boolean
  organizationSettings: OrganizationSettings | null
  canManageAutoTopup: boolean
  handleToggleAutoTopup: (checked: boolean) => Promise<boolean>
  handleThresholdChange: (value: number) => void
  handleTopUpAmountChange: (value: number) => void
}

export function useOrgAutoTopup(organizationId: string): OrgAutoTopupState {
  const queryClient = useQueryClient()
  const [isEnabled, setIsEnabled] = useState(false)
  const [threshold, setThreshold] = useState<number>(
    ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
  )
  const [topUpAmountDollars, setTopUpAmountDollars] =
    useState<number>(MIN_TOPUP_DOLLARS)
  const isInitialLoad = useRef(true)
  const pendingSettings = useRef<{
    threshold: number
    topUpAmountDollars: number
  } | null>(null)

  const { data: organizationSettings, isLoading: isLoadingSettings } =
    useQuery<OrganizationSettings>({
      queryKey: ['organizationSettings', organizationId],
      queryFn: async () => {
        const response = await fetch(`/api/orgs/${organizationId}/settings`)
        if (!response.ok)
          throw new Error('Failed to fetch organization settings')
        const data = await response.json()

        const thresholdCredits =
          data.autoTopupThreshold ??
          ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS
        const topUpAmount =
          data.autoTopupAmount ?? ORG_AUTO_TOPUP_CONSTANTS.MIN_TOPUP_CREDITS
        const topUpDollars =
          (topUpAmount * ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT) / 100

        return {
          ...data,
          autoTopupEnabled: data.autoTopupEnabled ?? false,
          autoTopupThreshold: clamp(
            thresholdCredits,
            ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
            ORG_AUTO_TOPUP_CONSTANTS.MAX_THRESHOLD_CREDITS,
          ),
          autoTopupAmount: clamp(
            topUpAmount,
            ORG_AUTO_TOPUP_CONSTANTS.MIN_TOPUP_CREDITS,
            (ORG_AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS * 100) /
              ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT,
          ),
          initialTopUpDollars: clamp(
            topUpDollars > 0 ? topUpDollars : MIN_TOPUP_DOLLARS,
            MIN_TOPUP_DOLLARS,
            ORG_AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS,
          ),
        }
      },
      enabled: !!organizationId,
    })

  const canManageAutoTopup = organizationSettings?.userRole === 'owner'

  useEffect(() => {
    if (organizationSettings) {
      setIsEnabled(organizationSettings.autoTopupEnabled ?? false)
      setThreshold(
        organizationSettings.autoTopupThreshold ??
          ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
      )
      const topUpDollars =
        (organizationSettings.autoTopupAmount *
          ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT) /
        100
      setTopUpAmountDollars(topUpDollars > 0 ? topUpDollars : MIN_TOPUP_DOLLARS)
      setTimeout(() => {
        isInitialLoad.current = false
      }, 0)
    }
  }, [organizationSettings])

  const autoTopupMutation = useMutation({
    mutationFn: async (
      settings: Partial<{
        autoTopupEnabled: boolean
        autoTopupThreshold: number
        autoTopupAmount: number
      }>,
    ) => {
      const payload = {
        autoTopupEnabled: settings.autoTopupEnabled,
        autoTopupThreshold: settings.autoTopupThreshold,
        autoTopupAmount: settings.autoTopupAmount,
      }

      if (typeof payload.autoTopupEnabled !== 'boolean') {
        throw new Error('Internal error: Auto-topup enabled state is invalid.')
      }

      if (payload.autoTopupEnabled) {
        if (!payload.autoTopupThreshold)
          throw new Error('Threshold is required.')
        if (!payload.autoTopupAmount) throw new Error('Amount is required.')
        if (
          payload.autoTopupThreshold <
            ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS ||
          payload.autoTopupThreshold >
            ORG_AUTO_TOPUP_CONSTANTS.MAX_THRESHOLD_CREDITS
        ) {
          throw new Error('Invalid threshold value.')
        }
        if (
          payload.autoTopupAmount <
            ORG_AUTO_TOPUP_CONSTANTS.MIN_TOPUP_CREDITS ||
          payload.autoTopupAmount >
            (ORG_AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS * 100) /
              ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT
        ) {
          throw new Error('Invalid top-up amount value.')
        }
      }

      const response = await fetch(`/api/orgs/${organizationId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const wasEnabled = variables.autoTopupEnabled
      const savingSettings =
        variables.autoTopupThreshold !== undefined &&
        variables.autoTopupAmount !== undefined

      if (wasEnabled && savingSettings) {
        toast({ title: 'Organization auto top-up settings saved!' })
      }

      queryClient.setQueryData(
        ['organizationSettings', organizationId],
        (oldData: any) => {
          if (!oldData) return oldData

          const savedEnabled = variables.autoTopupEnabled
          const savedThreshold =
            variables.autoTopupThreshold ??
            ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS
          const savedAmount =
            variables.autoTopupAmount ??
            ORG_AUTO_TOPUP_CONSTANTS.MIN_TOPUP_CREDITS

          const updatedData = {
            ...oldData,
            autoTopupEnabled: savedEnabled,
            autoTopupThreshold: savedEnabled
              ? savedThreshold
              : ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
            autoTopupAmount: savedEnabled
              ? savedAmount
              : ORG_AUTO_TOPUP_CONSTANTS.MIN_TOPUP_CREDITS,
          }

          setIsEnabled(updatedData.autoTopupEnabled ?? false)
          setThreshold(
            updatedData.autoTopupThreshold ??
              ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
          )
          const topUpDollars =
            (updatedData.autoTopupAmount *
              ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT) /
            100
          setTopUpAmountDollars(
            topUpDollars > 0 ? topUpDollars : MIN_TOPUP_DOLLARS,
          )

          return updatedData
        },
      )

      pendingSettings.current = null
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving organization settings',
        description: error.message,
        variant: 'destructive',
      })
      if (organizationSettings) {
        setIsEnabled(organizationSettings.autoTopupEnabled ?? false)
        setThreshold(
          organizationSettings.autoTopupThreshold ??
            ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
        )
        const topUpDollars =
          (organizationSettings.autoTopupAmount *
            ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT) /
          100
        setTopUpAmountDollars(
          topUpDollars > 0 ? topUpDollars : MIN_TOPUP_DOLLARS,
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
      const currentTopUpCredits = Math.round(
        (currentTopUpDollars * 100) / ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT,
      )

      if (
        currentThreshold === organizationSettings?.autoTopupThreshold &&
        currentTopUpCredits === organizationSettings?.autoTopupAmount &&
        organizationSettings?.autoTopupEnabled === true
      ) {
        pendingSettings.current = null
        return
      }

      autoTopupMutation.mutate({
        autoTopupEnabled: true,
        autoTopupThreshold: currentThreshold,
        autoTopupAmount: currentTopUpCredits,
      })
    }, 750),
    [autoTopupMutation, organizationSettings],
  )

  const handleThresholdChange = (rawValue: number) => {
    // Allow any value for UI display
    setThreshold(rawValue)

    if (isEnabled && canManageAutoTopup) {
      // Make sure we send a valid value to the server
      const validValue = clamp(
        rawValue,
        ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
        ORG_AUTO_TOPUP_CONSTANTS.MAX_THRESHOLD_CREDITS,
      )
      pendingSettings.current = { threshold: validValue, topUpAmountDollars }

      // Only save if the value is valid
      if (
        rawValue >= ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS &&
        rawValue <= ORG_AUTO_TOPUP_CONSTANTS.MAX_THRESHOLD_CREDITS
      ) {
        debouncedSaveSettings()
      }
    }
  }

  const handleTopUpAmountChange = (rawValue: number) => {
    // Allow any value for UI display
    setTopUpAmountDollars(rawValue)

    if (isEnabled && canManageAutoTopup) {
      // Make sure we send a valid value to the server
      const validValue = clamp(
        rawValue,
        MIN_TOPUP_DOLLARS,
        ORG_AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS,
      )
      pendingSettings.current = { threshold, topUpAmountDollars: validValue }

      // Only save if the value is valid
      if (
        rawValue >= MIN_TOPUP_DOLLARS &&
        rawValue <= ORG_AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS
      ) {
        debouncedSaveSettings()
      }
    }
  }

  const handleToggleAutoTopup = async (checked: boolean): Promise<boolean> => {
    if (!canManageAutoTopup) {
      toast({
        title: 'Permission Denied',
        description:
          'Only organization owners can manage auto top-up settings.',
        variant: 'destructive',
      })
      return false
    }

    setIsEnabled(checked)
    debouncedSaveSettings.cancel()
    pendingSettings.current = null

    if (checked) {
      if (
        threshold < ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS ||
        threshold > ORG_AUTO_TOPUP_CONSTANTS.MAX_THRESHOLD_CREDITS ||
        topUpAmountDollars < MIN_TOPUP_DOLLARS ||
        topUpAmountDollars > ORG_AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS
      ) {
        toast({
          title: 'Invalid Settings',
          description:
            'Cannot enable auto top-up with current values. Please ensure they are within limits.',
          variant: 'destructive',
        })
        setIsEnabled(false)
        return false
      }

      const topUpCredits = Math.round(
        (topUpAmountDollars * 100) / ORG_AUTO_TOPUP_CONSTANTS.CENTS_PER_CREDIT,
      )

      try {
        await autoTopupMutation.mutateAsync({
          autoTopupEnabled: true,
          autoTopupThreshold: threshold,
          autoTopupAmount: topUpCredits,
        })

        toast({
          title: 'Organization auto top-up enabled!',
          description: `We'll automatically add credits when the organization balance falls below ${threshold.toLocaleString()} credits.`,
        })
        return true
      } catch (error) {
        setIsEnabled(false)
        return false
      }
    } else {
      try {
        await autoTopupMutation.mutateAsync({
          autoTopupEnabled: false,
          autoTopupThreshold: ORG_AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS,
          autoTopupAmount: ORG_AUTO_TOPUP_CONSTANTS.MIN_TOPUP_CREDITS,
        })

        toast({ title: 'Organization auto top-up disabled.' })
        return true
      } catch (error) {
        setIsEnabled(true)
        return false
      }
    }
  }

  return {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingSettings,
    isPending: autoTopupMutation.isPending,
    organizationSettings: organizationSettings ?? null,
    canManageAutoTopup,
    handleToggleAutoTopup,
    handleThresholdChange,
    handleTopUpAmountChange,
  }
}

export { ORG_AUTO_TOPUP_CONSTANTS }
