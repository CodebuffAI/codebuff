'use client'

import { finetunedVertexModelNames } from '@codebuff/common/old-constants'
import react from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { useToast } from '@/components/ui/use-toast'
import {
  useModelConfigQuery,
  useSaveModelConfigMutation,
} from '@/hooks/use-model-config'

interface ModelConfigSheetProps {
  organization: { id: string; name: string }
  isOpen: boolean
  onClose: () => void
}

interface ModelConfig {
  model: string
}

export function ModelConfigSheet({
  organization,
  isOpen,
  onClose,
}: ModelConfigSheetProps) {
  const { toast } = useToast()
  const [config, setConfig] = react.useState<ModelConfig>({ model: '' })

  const { data: initialConfig, isLoading: isLoadingConfig } =
    useModelConfigQuery(organization.id, isOpen)

  const { mutate: saveConfig, isPending: isSaving } =
    useSaveModelConfigMutation()

  react.useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig)
    }
  }, [initialConfig])

  const handleSave = () => {
    saveConfig(
      { orgId: organization.id, config },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: `Configuration for ${organization.name} saved.`,
          })
          onClose()
        },
        onError: () => {
          toast({
            title: 'Error',
            description: 'Failed to save configuration.',
            variant: 'destructive',
          })
        },
      },
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Manage Model for {organization.name}</SheetTitle>
          <SheetDescription>
            Select a custom finetuned model for this organization.
          </SheetDescription>
        </SheetHeader>
        {isLoadingConfig ? (
          <div>Loading...</div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="model-select" className="text-right">
                Model
              </Label>
              <Select
                value={config.model}
                onValueChange={(value) =>
                  setConfig({ ...config, model: value })
                }
              >
                <SelectTrigger id="model-select" className="col-span-3">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(finetunedVertexModelNames).map(
                    ([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoadingConfig}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
