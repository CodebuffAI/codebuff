'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle, XCircle, Clock, Users } from 'lucide-react'

interface InvitationData {
  organization_name: string
  organization_slug: string
  email: string
  role: string
  inviter_name: string
  expires_at: string
}

interface PageProps {
  params: { token: string }
}

export default function InvitationPage({ params }: PageProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchInvitation()
  }, [params.token])

  const fetchInvitation = async () => {
    try {
      const response = await fetch(`/api/invitations/${params.token}`)
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to load invitation')
        return
      }

      setInvitation(data.invitation)
    } catch (error) {
      setError('Failed to load invitation')
    } finally {
      setLoading(false)
    }
  }

  const acceptInvitation = async () => {
    if (!session) {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.href)}`)
      return
    }

    setAccepting(true)
    setError(null)

    try {
      const response = await fetch(`/api/invitations/${params.token}`, {
        method: 'POST',
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to accept invitation')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push(`/organizations/${data.organization.slug}`)
      }, 2000)
    } catch (error) {
      setError('Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/')} 
              variant="outline" 
              className="w-full"
            >
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <CardTitle>Welcome to {invitation?.organization_name}!</CardTitle>
            </div>
            <CardDescription>
              You've successfully joined the organization. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!invitation) {
    return null
  }

  const isExpired = new Date(invitation.expires_at) < new Date()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            <CardTitle>Organization Invitation</CardTitle>
          </div>
          <CardDescription>
            {invitation.inviter_name} has invited you to join {invitation.organization_name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm text-gray-600">
              <strong>Organization:</strong> {invitation.organization_name}
            </div>
            <div className="text-sm text-gray-600">
              <strong>Role:</strong> {invitation.role}
            </div>
            <div className="text-sm text-gray-600">
              <strong>Email:</strong> {invitation.email}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              <span>
                Expires: {new Date(invitation.expires_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {isExpired ? (
            <div className="text-center">
              <p className="text-red-600 mb-4">This invitation has expired.</p>
              <Button 
                onClick={() => router.push('/')} 
                variant="outline" 
                className="w-full"
              >
                Go to Homepage
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {status === 'loading' ? (
                <Skeleton className="h-10 w-full" />
              ) : !session ? (
                <div className="text-center">
                  <p className="text-gray-600 mb-4">
                    Please sign in to accept this invitation.
                  </p>
                  <Button 
                    onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(window.location.href)}`)}
                    className="w-full"
                  >
                    Sign In to Accept
                  </Button>
                </div>
              ) : session.user?.email !== invitation.email ? (
                <div className="text-center">
                  <p className="text-red-600 mb-4">
                    This invitation is for {invitation.email}, but you're signed in as {session.user?.email}.
                  </p>
                  <Button 
                    onClick={() => router.push('/login')}
                    variant="outline" 
                    className="w-full"
                  >
                    Sign in with correct account
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={acceptInvitation}
                  disabled={accepting}
                  className="w-full"
                >
                  {accepting ? 'Accepting...' : 'Accept Invitation'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}