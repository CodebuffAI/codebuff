import { Label } from '@/components/ui/label'
import { AvatarUpload } from '@/components/ui/avatar-upload'
import { StepTemplate } from './step-template'

interface ProfileDetailsStepProps {
  formData: {
    bio: string
    avatar_url: string
  }
  onBioChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onAvatarChange: (file: File | null, url: string) => void
  isLoading: boolean
  isUploadingAvatar: boolean
}

export function ProfileDetailsStep({
  formData,
  onBioChange,
  onAvatarChange,
  isLoading,
  isUploadingAvatar,
}: ProfileDetailsStepProps) {
  return (
    <StepTemplate>
      <div className="space-y-2">
        <AvatarUpload
          value={formData.avatar_url}
          onChange={onAvatarChange}
          disabled={isLoading || isUploadingAvatar}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          value={formData.bio}
          onChange={onBioChange}
          placeholder="Tell users about yourself and your agents..."
          rows={4}
          disabled={isLoading}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </StepTemplate>
  )
}
