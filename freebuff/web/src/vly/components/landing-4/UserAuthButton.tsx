'use client'

import React, { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from '@/vly/components/auth/AuthComponents'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/vly/components/ui/avatar'
import { Switch } from '@/vly/components/ui/switch'
import { Beaker, Gift, Loader2 } from 'lucide-react'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { toast } from 'sonner'

interface UserAuthButtonProps {
  mounted: boolean
}

export default function UserAuthButton({ mounted }: UserAuthButtonProps) {
  const { data: session, status } = useSession()
  const convexUser = useSignedInUser()
  const toggleBeta = useMutation(api.featureFlags.toggleUserBeta)
  const [isTogglingBeta, setIsTogglingBeta] = useState(false)

  const userName = session?.user?.name || 'User'
  const userEmail = session?.user?.email || ''
  const userImage = session?.user?.image || undefined

  const handleBetaToggle = async () => {
    if (!convexUser?._id) return

    setIsTogglingBeta(true)
    try {
      const newBetaStatus = !convexUser.is_beta
      await toggleBeta({
        userId: convexUser._id,
        isBeta: newBetaStatus,
      })
      toast.success(
        newBetaStatus ? 'Beta features enabled' : 'Beta features disabled',
      )
    } catch (error) {
      toast.error(
        `Failed to toggle beta: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setIsTogglingBeta(false)
    }
  }

  if (!mounted || status === 'loading') {
    return <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
  }

  return (
    <>
      <SignedIn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              id="user-btn"
              className="group relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full transition-all duration-300 hover:scale-105 focus:outline-none"
              aria-label="User menu"
            >
              <Avatar className="relative z-10 h-9 w-9">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="pointer-events-none absolute inset-y-0 -left-full z-20 w-[300%] -translate-x-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-1/3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="z-[10001] w-64 rounded-lg border border-gray-200 bg-white p-0 shadow-lg"
            align="end"
          >
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={userImage} alt={userName} />
                  <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {userName}
                  </p>
                  <p className="truncate text-sm text-gray-500">{userEmail}</p>
                </div>
              </div>
            </div>

            <div className="py-1">
              <DropdownMenuItem
                className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                onClick={() => {
                  window.location.href = '/web'
                }}
              >
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                onClick={() => {
                  window.location.href = '/web/referrals'
                }}
              >
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  <span>Refer friends</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer px-4 py-2 !text-gray-600 hover:!bg-gray-100 data-[highlighted]:!bg-gray-100"
                onSelect={(e) => {
                  e.preventDefault()
                  handleBetaToggle()
                }}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Beaker className="h-4 w-4" />
                    <span className="text-sm">Beta Features</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isTogglingBeta ? (
                      <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                    ) : null}
                    <Switch
                      checked={convexUser?.is_beta || false}
                      disabled={isTogglingBeta}
                      onCheckedChange={handleBetaToggle}
                      onClick={(e) => e.stopPropagation()}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                Sign out
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal" asChild>
          <button
            className="flex h-7 w-24 cursor-pointer items-center justify-center rounded-[90px] bg-[#7CFF3F] font-semibold text-white transition-colors hover:bg-[#bfa0d6]"
            style={{ fontSize: 16 }}
          >
            Sign In
          </button>
        </SignInButton>
      </SignedOut>
    </>
  )
}
