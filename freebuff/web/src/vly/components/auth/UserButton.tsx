'use client'

import { signOut, useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/vly/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import { Button } from '@/vly/components/ui/button'
import { Badge } from '@/vly/components/ui/badge'
import { LogOut, User, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCreditsBalance } from '@/vly/hooks/useCreditCheck'

export function UserButton() {
  const { data: session } = useSession()
  const router = useRouter()
  const { planName } = useCreditsBalance()
  const user = session?.user

  if (!user) return null

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
    router.push('/web')
  }

  const displayName = user.name || user.email || 'User'
  const userInitials = displayName.substring(0, 2).toUpperCase()

  // Format plan name for display (capitalize first letter)
  const displayPlanName =
    planName && planName !== 'Free'
      ? planName.charAt(0).toUpperCase() + planName.slice(1).toLowerCase()
      : 'Free'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 min-w-0 max-w-full gap-2 overflow-hidden rounded-full px-2"
        >
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={user.image ?? undefined} alt={displayName} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
          <Badge
            variant="secondary"
            className="min-w-0 max-w-full truncate text-xs font-medium"
          >
            {displayPlanName}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push('/web/dashboard')}
          className="cursor-pointer"
        >
          <User className="mr-2 h-4 w-4" />
          <span>Dashboard</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push('/web/dashboard/preferences')}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-red-600 focus:text-red-600"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
