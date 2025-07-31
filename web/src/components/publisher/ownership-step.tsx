import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { User, Building2 } from 'lucide-react'
import { StepTemplate } from './step-template'

interface Organization {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'member'
}

interface OwnershipStepProps {
  selectedOrgId: string | null | undefined
  onSelectedOrgIdChange: (value: string | null | undefined) => void
  organizations: Organization[]
  isLoadingOrgs: boolean
  errors: Record<string, string>
}

export function OwnershipStep({
  selectedOrgId,
  onSelectedOrgIdChange,
  organizations,
  isLoadingOrgs,
  errors,
}: OwnershipStepProps) {
  return (
    <StepTemplate>
      <RadioGroup
        value={
          selectedOrgId === null
            ? 'personal'
            : selectedOrgId
              ? 'organization'
              : ''
        }
        onValueChange={(value: 'personal' | 'organization') => {
          if (value === 'personal') {
            onSelectedOrgIdChange(null)
          } else {
            onSelectedOrgIdChange('')
          }
        }}
        className="space-y-4"
      >
        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
          <RadioGroupItem value="personal" id="personal" />
          <Label
            htmlFor="personal"
            className="flex items-center cursor-pointer flex-1"
          >
            <User className="mr-3 h-5 w-5" />
            <div>
              <div className="font-medium">Personal</div>
              <div className="text-sm text-muted-foreground">
                Create a personal publisher profile
              </div>
            </div>
          </Label>
        </div>
        {organizations.length > 0 && (
          <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="organization" id="organization" />
            <Label
              htmlFor="organization"
              className="flex items-center cursor-pointer flex-1"
            >
              <Building2 className="mr-3 h-5 w-5" />
              <div>
                <div className="font-medium">Organization</div>
                <div className="text-sm text-muted-foreground">
                  Create a publisher profile for your organization
                </div>
              </div>
            </Label>
          </div>
        )}
      </RadioGroup>

      {selectedOrgId !== undefined && selectedOrgId !== null && (
        <div className="ml-6 space-y-3">
          <Label htmlFor="org-select">Select Organization</Label>
          <Select
            value={selectedOrgId || ''}
            onValueChange={onSelectedOrgIdChange}
            disabled={isLoadingOrgs}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose an organization" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {organizations.length === 0 && !isLoadingOrgs && (
            <p className="text-sm text-muted-foreground">
              You don't have admin access to any organizations.
            </p>
          )}
          {errors.organization && (
            <p className="text-sm text-red-600">{errors.organization}</p>
          )}
        </div>
      )}
    </StepTemplate>
  )
}
