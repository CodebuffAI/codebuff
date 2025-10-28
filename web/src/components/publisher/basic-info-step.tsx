import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { StepTemplate } from './step-template'

interface BasicInfoStepProps {
  formData: {
    name: string
    id: string
    email: string
  }
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onIdChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  errors: Record<string, string>
  isLoading: boolean
  isValidatingId: boolean
  idValidationResult: {
    valid: boolean
    error: string | null
  } | null
}

export function BasicInfoStep({
  formData,
  onNameChange,
  onIdChange,
  onEmailChange,
  errors,
  isLoading,
  isValidatingId,
  idValidationResult,
}: BasicInfoStepProps) {
  return (
    <StepTemplate>
      <div className="space-y-2">
        <Label htmlFor="name">
          Publisher Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={onNameChange}
          placeholder="Enter your publisher name"
          required
          disabled={isLoading}
          className={errors.name ? 'border-red-500' : ''}
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
        <p className="text-sm text-muted-foreground">
          This will be displayed publicly on your published agents.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="id">
          Publisher ID <span className="text-red-500">*</span>
        </Label>
        <div className="relative">
          <Input
            id="id"
            type="text"
            value={formData.id}
            onChange={onIdChange}
            placeholder="your-publisher-id"
            required
            disabled={isLoading}
            className={`pr-10 ${
              errors.id || (idValidationResult && !idValidationResult.valid)
                ? 'border-red-500'
                : idValidationResult?.valid
                  ? 'border-green-500'
                  : ''
            }`}
          />
          {isValidatingId && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {!isValidatingId && idValidationResult && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              {idValidationResult.valid ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          )}
        </div>
        {errors.id && <p className="text-sm text-red-600">{errors.id}</p>}
        {!errors.id && idValidationResult && !idValidationResult.valid && (
          <p className="text-sm text-red-600">{idValidationResult.error}</p>
        )}
        {!errors.id && idValidationResult?.valid && (
          <p className="text-sm text-green-600">
            This publisher ID is available!
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          This will be your unique URL: codebuff.com/publishers/
          {formData.id || 'your-publisher-id'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Contact Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={onEmailChange}
          placeholder="contact@example.com"
          disabled={isLoading}
        />
        <p className="text-sm text-muted-foreground">
          Optional. For users to contact you about your agents.
        </p>
      </div>
    </StepTemplate>
  )
}
