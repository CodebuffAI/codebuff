'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { 
  ArrowLeft, 
  Settings, 
  CreditCard, 
  Bell, 
  Shield,
  Trash2,
  Save
} from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ui/use-toast'

interface OrganizationSettings {
  id: string
  name: string
  slug: string
  description?: string
  userRole: 'owner' | 'admin' | 'member'
  autoTopupEnabled: boolean
  autoTopupThreshold: number
  autoTopupAmount: number
  creditLimit?: number
  billingAlerts: boolean
  usageAlerts: boolean
  weeklyReports: boolean
}

export default function OrganizationSettingsPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && orgId) {
      fetchSettings()
    }
  }, [status, orgId])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/orgs/${orgId}/settings`)
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch settings')
      }

      const data = await response.json()
      setSettings(data)
    } catch (error) {
      console.error('Error fetching settings:', error)
      setError(error instanceof Error ? error.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return

    try {
      setSaving(true)
      const response = await fetch(`/api/orgs/${orgId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: settings.name,
          description: settings.description,
          autoTopupEnabled: settings.autoTopupEnabled,
          autoTopupThreshold: settings.autoTopupThreshold,
          autoTopupAmount: settings.autoTopupAmount,
          creditLimit: settings.creditLimit,
          billingAlerts: settings.billingAlerts,
          usageAlerts: settings.usageAlerts,
          weeklyReports: settings.weeklyReports,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save settings')
      }

      toast({
        title: 'Success',
        description: 'Organization settings saved successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save settings',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteOrganization = async () => {
    if (!confirm('Are you sure you want to delete this organization? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/orgs/${orgId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete organization')
      }

      toast({
        title: 'Success',
        description: 'Organization deleted successfully',
      })

      router.push('/orgs')
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete organization',
        variant: 'destructive',
      })
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Sign in Required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">Please sign in to access organization settings.</p>
              <Link href="/login">
                <Button>Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">{error || 'Organization not found'}</p>
              <div className="flex gap-2">
                <Button onClick={() => router.back()} variant="outline">
                  Go Back
                </Button>
                <Button onClick={fetchSettings}>
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const canManageSettings = settings.userRole === 'owner' || settings.userRole === 'admin'
  const canDeleteOrg = settings.userRole === 'owner'

  if (!canManageSettings) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">You don't have permission to manage organization settings.</p>
              <Link href={`/orgs/${orgId}`}>
                <Button>Back to Organization</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Link href={`/orgs/${orgId}`}>
              <Button variant="ghost" size="sm" className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to {settings.name}
              </Button>
            </Link>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center">
            <Settings className="mr-3 h-8 w-8" />
            Organization Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization's configuration and billing preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Organization Name</Label>
                  <Input
                    id="name"
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                    placeholder="Enter organization name"
                  />
                </div>
                <div>
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input
                    id="slug"
                    value={settings.slug}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    URL slug cannot be changed after creation
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={settings.description || ''}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  placeholder="Describe your organization"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Billing Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="mr-2 h-5 w-5" />
                Billing & Credits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Auto-topup */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-medium">Auto-topup</h4>
                    <p className="text-sm text-muted-foreground">
                      Automatically purchase credits when balance is low
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoTopupEnabled}
                    onCheckedChange={(checked) => 
                      setSettings({ ...settings, autoTopupEnabled: checked })
                    }
                  />
                </div>
                
                {settings.autoTopupEnabled && (
                  <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-muted">
                    <div>
                      <Label htmlFor="threshold">Trigger Threshold</Label>
                      <Input
                        id="threshold"
                        type="number"
                        value={settings.autoTopupThreshold}
                        onChange={(e) => setSettings({ 
                          ...settings, 
                          autoTopupThreshold: parseInt(e.target.value) || 0 
                        })}
                        placeholder="500"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Credits remaining to trigger auto-topup
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="amount">Topup Amount</Label>
                      <Input
                        id="amount"
                        type="number"
                        value={settings.autoTopupAmount}
                        onChange={(e) => setSettings({ 
                          ...settings, 
                          autoTopupAmount: parseInt(e.target.value) || 0 
                        })}
                        placeholder="2000"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Credits to purchase during auto-topup
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Credit Limit */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="font-medium">Monthly Credit Limit</h4>
                    <p className="text-sm text-muted-foreground">
                      Set a maximum monthly spending limit (optional)
                    </p>
                  </div>
                </div>
                <Input
                  type="number"
                  value={settings.creditLimit || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings({ 
                    ...settings, 
                    creditLimit: e.target.value ? parseInt(e.target.value) : undefined 
                  })}
                  placeholder="10000"
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty for no limit
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="mr-2 h-5 w-5" />
                Notifications & Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Billing Alerts</h4>
                  <p className="text-sm text-muted-foreground">
                    Get notified about low credit balance and billing issues
                  </p>
                </div>
                <Switch
                  checked={settings.billingAlerts}
                  onCheckedChange={(checked) => 
                    setSettings({ ...settings, billingAlerts: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Usage Alerts</h4>
                  <p className="text-sm text-muted-foreground">
                    Get notified about high usage and spending patterns
                  </p>
                </div>
                <Switch
                  checked={settings.usageAlerts}
                  onCheckedChange={(checked) => 
                    setSettings({ ...settings, usageAlerts: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Weekly Reports</h4>
                  <p className="text-sm text-muted-foreground">
                    Receive weekly usage and billing summary reports
                  </p>
                </div>
                <Switch
                  checked={settings.weeklyReports}
                  onCheckedChange={(checked) => 
                    setSettings({ ...settings, weeklyReports: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          {canDeleteOrg && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center text-red-600">
                  <Shield className="mr-2 h-5 w-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Delete Organization</h4>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete this organization and all its data
                    </p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeleteOrganization}
                    className="ml-4"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Organization
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
