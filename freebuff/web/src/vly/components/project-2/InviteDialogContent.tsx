import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useAction, useMutation, useQuery } from 'convex/react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/vly/components/ui/table'
import { Button } from '@/vly/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/vly/components/ui/alert-dialog'
import { ArrowRightLeft, Loader2, XIcon } from 'lucide-react'
import { useToast } from '@/vly/hooks/use-toast'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { Label } from '@/vly/components/ui/label'
import { Input } from '@/vly/components/ui/input'
import { useMemo, useState } from 'react'
import { useCustomer } from 'autumn-js/react'
import {
  CollaboratorUpgradePrompt,
  FeatureGate,
  UpgradePrompt,
} from '@/vly/components/billing/FeatureGate'
import { hobbyPlan, businessPlan } from '@/vly/autumn.config'
import { getFormattedPriceWithPeriod } from '@/vly/autumn/helpers'
import { getActivePlan } from '@/vly/lib/billing'

interface InviteDialogContentProps {
  projectId: Id<'project'>
  setIsOpen: (isOpen: boolean) => void
  className?: string
}

interface ProjectMemberRecord {
  _id: string
  user: Id<'users'>
  project_role: 'member' | 'admin' | 'owner'
  userInfo?: {
    name?: string
    email?: string
  } | null
}

export function InviteDialogContent({
  projectId,
  setIsOpen,
  className,
}: InviteDialogContentProps) {
  const [email, setEmail] = useState('')
  const [showProUpgrade, setShowProUpgrade] = useState(false)
  const [transferTarget, setTransferTarget] =
    useState<ProjectMemberRecord | null>(null)
  const [isTransferringOwnership, setIsTransferringOwnership] = useState(false)
  const { toast } = useToast()
  const signedInUser = useSignedInUser()
  const { customer } = useCustomer()
  const createInvite = useAction(api.invites.sendInvite)
  const removeMember = useMutation(api.project.removeProjectMember)
  const transferOwnership = useMutation(api.project.transferProjectOwnership)

  const members = useQuery(api.project.getProjectMembers, { projectId })
  const pendingInvites = useQuery(api.invites.getInvitesByProject, {
    projectId,
  })

  const memberLimit = Infinity

  const currentProjectUsage = useMemo(() => {
    const memberCount = members?.length ?? 0
    const pendingCount = pendingInvites?.length ?? 0
    return memberCount + pendingCount
  }, [members, pendingInvites])

  const currentUsage = currentProjectUsage

  const isAtLimit = useMemo(() => {
    return memberLimit !== Infinity && currentUsage >= memberLimit
  }, [currentUsage, memberLimit])

  const isOnHobbyPlan = useMemo(() => {
    if (!customer?.products) return false
    const { planId } = getActivePlan(customer.products, customer, 'free_plan')
    return planId === hobbyPlan.id
  }, [customer])

  const sortedMembers = useMemo(() => {
    const roleOrder = {
      owner: 0,
      admin: 1,
      member: 2,
    } as const

    return [...((members ?? []) as ProjectMemberRecord[])].sort((a, b) => {
      const byRole = roleOrder[a.project_role] - roleOrder[b.project_role]
      if (byRole !== 0) {
        return byRole
      }

      return (a.userInfo?.name || '').localeCompare(b.userInfo?.name || '')
    })
  }, [members])

  const currentUserMembership = useMemo(() => {
    if (!signedInUser) {
      return null
    }

    return (
      sortedMembers.find((member) => member.user === signedInUser._id) ?? null
    )
  }, [signedInUser, sortedMembers])

  const canTransferOwnership = currentUserMembership?.project_role === 'owner'

  const handleInvite = async () => {
    if (!email) return

    if (isAtLimit) {
      if (isOnHobbyPlan && memberLimit === 2) {
        setShowProUpgrade(true)
        return
      }

      toast({
        title: 'Member limit reached',
        description: `You've reached your plan's member limit of ${memberLimit}. Upgrade to add more members.`,
        variant: 'destructive',
      })
      return
    }

    try {
      await createInvite({
        projectId,
        email,
      })

      toast({
        title: 'Invitation sent',
        description: `Invitation email sent to ${email}`,
      })

      setEmail('')
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to send invitation',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveMember = async (userId: Id<'users'>) => {
    try {
      await removeMember({
        projectId,
        userId,
      })

      toast({
        title: 'Member removed',
        description: 'Successfully removed member from project',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to remove member',
        variant: 'destructive',
      })
    }
  }

  const handleTransferOwnership = async () => {
    if (!transferTarget) {
      return
    }

    try {
      setIsTransferringOwnership(true)
      await transferOwnership({
        projectId,
        newOwnerUserId: transferTarget.user,
      })

      toast({
        title: 'Ownership transferred',
        description: `${transferTarget.userInfo?.name || 'The selected member'} is now the project owner`,
      })
      setTransferTarget(null)
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to transfer ownership',
        variant: 'destructive',
      })
    } finally {
      setIsTransferringOwnership(false)
    }
  }

  return (
    <>
      <DialogContent
        className={`compact-dialog-text light flex max-h-[90vh] max-w-2xl flex-col overflow-hidden ${className}`}
      >
        <DialogHeader className="flex-shrink-0 p-4">
          <DialogTitle className="text-base">Project Members</DialogTitle>
          <DialogDescription className="text-xs">
            Manage collaborators and send invitations to this project.
            {memberLimit !== Infinity && (
              <span className="ml-1">
                ({currentUsage}/{memberLimit} members)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <FeatureGate
            featureId="team_collaboration"
            fallback={
              <div className="p-4">
                <UpgradePrompt
                  featureId="team_collaboration"
                  title="Unlock Team Collaboration with Hobby Plan"
                  message={`Add collaborators to your project. Upgrade to Hobby plan (${getFormattedPriceWithPeriod('hobby')}) to add up to 5 total members across all projects.`}
                />
              </div>
            }
          >
            <div className="space-y-4 p-4 pt-0">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Current Members</h3>
                  {canTransferOwnership && (
                    <p className="text-xs text-muted-foreground">
                      Transfer ownership to another existing collaborator.
                    </p>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedMembers.map((member) => {
                      const isTransferTarget =
                        transferTarget?.user === member.user &&
                        isTransferringOwnership

                      return (
                        <TableRow key={member._id}>
                          <TableCell>{member.userInfo?.name}</TableCell>
                          <TableCell>{member.userInfo?.email}</TableCell>
                          <TableCell className="capitalize">
                            {member.project_role}
                          </TableCell>
                          <TableCell className="text-right">
                            {member.project_role !== 'owner' && (
                              <div className="flex justify-end gap-2">
                                {canTransferOwnership && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 px-2.5"
                                    onClick={() => setTransferTarget(member)}
                                    disabled={isTransferringOwnership}
                                  >
                                    {isTransferTarget ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <ArrowRightLeft className="h-3.5 w-3.5" />
                                    )}
                                    Transfer ownership
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveMember(member.user)
                                  }
                                  disabled={isTransferringOwnership}
                                >
                                  <XIcon className="h-3 w-3 text-zinc-800" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {pendingInvites && pendingInvites.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Pending Invites</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Expires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingInvites.map((invite) => (
                        <TableRow key={invite._id}>
                          <TableCell>{invite.email}</TableCell>
                          <TableCell>
                            {invite.expires_at
                              ? new Date(invite.expires_at).toLocaleDateString()
                              : 'Never'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="space-y-2 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">
                    Invite New Member
                    {isAtLimit && (
                      <span className="ml-2 text-xs text-destructive">
                        (Limit reached)
                      </span>
                    )}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="border-neutral-200 bg-slate-100 text-sm"
                      disabled={
                        isAtLimit && !(isOnHobbyPlan && memberLimit === 2)
                      }
                    />
                    <Button
                      onClick={handleInvite}
                      variant="secondary"
                      type="button"
                      disabled={
                        isAtLimit && !(isOnHobbyPlan && memberLimit === 2)
                      }
                    >
                      Send Invitation
                    </Button>
                  </div>
                  {isAtLimit && !showProUpgrade && (
                    <p className="text-xs text-muted-foreground">
                      You've reached your plan's member limit of {memberLimit}.{' '}
                      <button
                        onClick={() => {
                          setIsOpen(false)
                          window.location.href = '/web/dashboard'
                        }}
                        className="text-primary underline hover:no-underline"
                      >
                        Upgrade to add more members
                      </button>
                    </p>
                  )}
                  {showProUpgrade && (
                    <div className="mt-4">
                      <CollaboratorUpgradePrompt
                        onUpgradeClick={() => {
                          setShowProUpgrade(false)
                          setIsOpen(false)
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </FeatureGate>
        </div>
      </DialogContent>

      <AlertDialog
        open={transferTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTransferTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer project ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              {transferTarget?.userInfo?.name || 'This collaborator'} will
              become the owner. You will remain on the project as a member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTransferringOwnership}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleTransferOwnership()
              }}
              disabled={isTransferringOwnership}
            >
              {isTransferringOwnership ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Transferring
                </>
              ) : (
                'Transfer ownership'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
