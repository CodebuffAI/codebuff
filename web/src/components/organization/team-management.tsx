'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Users, 
  Plus, 
  Mail, 
  MoreHorizontal, 
  UserMinus, 
  Shield, 
  Clock,
  X,
  RefreshCw,
  UserPlus
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'

interface Member {
  user: {
    id: string
    name: string
    email: string
  }
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

interface Invitation {
  id: string
  email: string
  role: 'admin' | 'member'
  invited_by_name: string
  created_at: string
  expires_at: string
}

interface TeamManagementProps {
  organizationId: string
  userRole: 'owner' | 'admin' | 'member'
}

export function TeamManagement({ organizationId, userRole }: TeamManagementProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [bulkInviteDialogOpen, setBulkInviteDialogOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member' as 'admin' | 'member'
  })
  const [bulkInviteForm, setBulkInviteForm] = useState({
    emails: '',
    role: 'member' as 'admin' | 'member'
  })
  const [inviting, setInviting] = useState(false)
  const [bulkInviting, setBulkInviting] = useState(false)
  const [resendingInvites, setResendingInvites] = useState<Set<string>>(new Set())

  const canManageTeam = userRole === 'owner' || userRole === 'admin'
  const isMobile = useIsMobile()

  useEffect(() => {
    fetchTeamData()
  }, [organizationId])

  const fetchTeamData = async () => {
    try {
      setLoading(true)
      const [membersResponse, invitationsResponse] = await Promise.all([
        fetch(`/api/orgs/${organizationId}/members`),
        fetch(`/api/orgs/${organizationId}/invitations`)
      ])

      if (membersResponse.ok) {
        const membersData = await membersResponse.json()
        setMembers(membersData.members || [])
      }

      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json()
        setInvitations(invitationsData.invitations || [])
      }
    } catch (error) {
      console.error('Error fetching team data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load team data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInviteMember = async () => {
    if (!inviteForm.email.trim()) {
      toast({
        title: 'Error',
        description: 'Email is required',
        variant: 'destructive',
      })
      return
    }

    setInviting(true)
    try {
      const response = await fetch(`/api/orgs/${organizationId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inviteForm),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation')
      }

      toast({
        title: 'Success',
        description: `Invitation sent to ${inviteForm.email}`,
      })

      setInviteDialogOpen(false)
      setInviteForm({ email: '', role: 'member' })
      fetchTeamData() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send invitation',
        variant: 'destructive',
      })
    } finally {
      setInviting(false)
    }
  }

  const handleBulkInviteMembers = async () => {
    if (!bulkInviteForm.emails.trim()) {
      toast({
        title: 'Error',
        description: 'Email addresses are required',
        variant: 'destructive',
      })
      return
    }

    // Parse emails from textarea (split by newlines, commas, or spaces)
    const emailList = bulkInviteForm.emails
      .split(/[\n,\s]+/)
      .map(email => email.trim())
      .filter(email => email.length > 0)

    if (emailList.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter at least one email address',
        variant: 'destructive',
      })
      return
    }

    if (emailList.length > 50) {
      toast({
        title: 'Error',
        description: 'Maximum 50 invitations allowed at once',
        variant: 'destructive',
      })
      return
    }

    setBulkInviting(true)
    try {
      const invitations = emailList.map(email => ({
        email,
        role: bulkInviteForm.role
      }))

      const response = await fetch(`/api/orgs/${organizationId}/invitations/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invitations }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send bulk invitations')
      }

      const { summary, results } = data
      
      if (summary.successful > 0) {
        toast({
          title: 'Success',
          description: `${summary.successful} invitation(s) sent successfully${summary.failed > 0 ? `, ${summary.failed} failed` : ''}`,
        })
      }

      if (summary.failed > 0) {
        const failedEmails = results
          .filter((r: any) => !r.success)
          .map((r: any) => `${r.email}: ${r.error}`)
          .join('\n')
        
        toast({
          title: 'Some invitations failed',
          description: failedEmails,
          variant: 'destructive',
        })
      }

      setBulkInviteDialogOpen(false)
      setBulkInviteForm({ emails: '', role: 'member' })
      fetchTeamData() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send bulk invitations',
        variant: 'destructive',
      })
    } finally {
      setBulkInviting(false)
    }
  }

  const handleResendInvitation = async (email: string) => {
    setResendingInvites(prev => new Set(prev).add(email))
    
    try {
      const response = await fetch(`/api/orgs/${organizationId}/invitations/${encodeURIComponent(email)}/resend`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend invitation')
      }

      toast({
        title: 'Success',
        description: `Invitation resent to ${email}`,
      })

      fetchTeamData() // Refresh the data to show updated expiration
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to resend invitation',
        variant: 'destructive',
      })
    } finally {
      setResendingInvites(prev => {
        const newSet = new Set(prev)
        newSet.delete(email)
        return newSet
      })
    }
  }

  const handleCancelInvitation = async (email: string) => {
    try {
      const response = await fetch(`/api/orgs/${organizationId}/invitations/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to cancel invitation')
      }

      toast({
        title: 'Success',
        description: 'Invitation cancelled',
      })

      fetchTeamData() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cancel invitation',
        variant: 'destructive',
      })
    }
  }

  const handleUpdateMemberRole = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      const response = await fetch(`/api/orgs/${organizationId}/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update member role')
      }

      toast({
        title: 'Success',
        description: 'Member role updated',
      })

      fetchTeamData() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update member role',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the organization?`)) {
      return
    }

    try {
      const response = await fetch(`/api/orgs/${organizationId}/members/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove member')
      }

      toast({
        title: 'Success',
        description: `${memberName} has been removed from the organization`,
      })

      fetchTeamData() // Refresh the data
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove member',
        variant: 'destructive',
      })
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default'
      case 'admin':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const isInvitationExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-base sm:text-lg">
              <Users className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Team Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 sm:p-4 border rounded-lg">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-24 sm:w-32"></div>
                    <div className="h-3 bg-gray-200 rounded w-32 sm:w-48"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-12 sm:w-16"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Team Members */}
      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center text-base sm:text-lg">
              <Users className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Team Members ({members.length})
            </CardTitle>
            {canManageTeam && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Dialog open={bulkInviteDialogOpen} onOpenChange={setBulkInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size={isMobile ? "sm" : "default"} className="w-full sm:w-auto">
                      <UserPlus className="mr-2 h-4 w-4" />
                      {isMobile ? 'Bulk' : 'Bulk Invite'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-md mx-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Bulk Invite Team Members</DialogTitle>
                      <DialogDescription className="text-sm">
                        Send invitations to multiple people at once.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="bulk-emails" className="text-sm">Email Addresses</Label>
                        <Textarea
                          id="bulk-emails"
                          placeholder="Enter email addresses (one per line, or separated by commas)"
                          value={bulkInviteForm.emails}
                          onChange={(e) => setBulkInviteForm({ ...bulkInviteForm, emails: e.target.value })}
                          rows={4}
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum 50 invitations at once
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bulk-role" className="text-sm">Role</Label>
                        <Select
                          value={bulkInviteForm.role}
                          onValueChange={(value: 'admin' | 'member') => 
                            setBulkInviteForm({ ...bulkInviteForm, role: value })
                          }
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setBulkInviteDialogOpen(false)}
                        disabled={bulkInviting}
                        className="w-full sm:w-auto"
                        size={isMobile ? "sm" : "default"}
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleBulkInviteMembers} 
                        disabled={bulkInviting}
                        className="w-full sm:w-auto"
                        size={isMobile ? "sm" : "default"}
                      >
                        {bulkInviting ? 'Sending...' : 'Send Invitations'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size={isMobile ? "sm" : "default"} className="w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      {isMobile ? 'Invite' : 'Invite Member'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-md mx-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Invite Team Member</DialogTitle>
                      <DialogDescription className="text-sm">
                        Send an invitation to join this organization.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter email address"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role" className="text-sm">Role</Label>
                        <Select
                          value={inviteForm.role}
                          onValueChange={(value: 'admin' | 'member') => 
                            setInviteForm({ ...inviteForm, role: value })
                          }
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setInviteDialogOpen(false)}
                        disabled={inviting}
                        className="w-full sm:w-auto"
                        size={isMobile ? "sm" : "default"}
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleInviteMember} 
                        disabled={inviting}
                        className="w-full sm:w-auto"
                        size={isMobile ? "sm" : "default"}
                      >
                        {inviting ? 'Sending...' : 'Send Invitation'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 sm:space-y-4">
            {members.map((member) => (
              <div key={member.user.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg">
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-semibold text-sm sm:text-base">
                      {member.user.name?.charAt(0) || member.user.email.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm sm:text-base truncate">{member.user.name || 'Unknown'}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground truncate">{member.user.email}</div>
                    <div className="text-xs text-muted-foreground sm:hidden">
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-muted-foreground hidden sm:block">
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end space-x-2 flex-shrink-0">
                  <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                    {member.role}
                  </Badge>
                  {canManageTeam && member.role !== 'owner' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {member.role === 'member' && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateMemberRole(member.user.id, 'admin')}
                            className="text-sm"
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Make Admin
                          </DropdownMenuItem>
                        )}
                        {member.role === 'admin' && userRole === 'owner' && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateMemberRole(member.user.id, 'member')}
                            className="text-sm"
                          >
                            <Users className="mr-2 h-4 w-4" />
                            Make Member
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleRemoveMember(member.user.id, member.user.name)}
                          className="text-red-600 text-sm"
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <p className="text-sm sm:text-base">No team members yet. Invite someone to get started!</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center text-base sm:text-lg">
              <Mail className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Pending Invitations ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 sm:space-y-4">
              {invitations.map((invitation) => {
                const isExpired = isInvitationExpired(invitation.expires_at)
                const isResending = resendingInvites.has(invitation.email)
                
                return (
                  <div key={invitation.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg">
                    <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isExpired ? 'bg-red-100' : 'bg-orange-100'
                      }`}>
                        <Clock className={`h-4 w-4 sm:h-5 sm:w-5 ${
                          isExpired ? 'text-red-600' : 'text-orange-600'
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm sm:text-base truncate">{invitation.email}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground">
                          Invited by {invitation.invited_by_name}
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground sm:hidden">
                          {new Date(invitation.created_at).toLocaleDateString()}
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                          {new Date(invitation.created_at).toLocaleDateString()}
                        </div>
                        <div className={`text-xs ${isExpired ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {isExpired ? 'Expired' : 'Expires'} {new Date(invitation.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end space-x-2 flex-shrink-0">
                      <Badge variant="outline" className="text-xs">{invitation.role}</Badge>
                      {canManageTeam && (
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResendInvitation(invitation.email)}
                            disabled={isResending}
                            title="Resend invitation"
                            className="h-8 w-8 p-0"
                          >
                            <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelInvitation(invitation.email)}
                            title="Cancel invitation"
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
