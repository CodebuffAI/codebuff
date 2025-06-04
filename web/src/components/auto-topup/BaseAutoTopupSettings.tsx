import { ReactElement } from 'react'

interface BaseAutoTopupSettingsProps {
  isLoading: boolean
  switchComponent: ReactElement
  formComponent: ReactElement
}

export function BaseAutoTopupSettings({
  isLoading,
  switchComponent,
  formComponent,
}: BaseAutoTopupSettingsProps) {
  if (isLoading) {
    return null
  }

  return (
    <>
      <div className="flex items-center justify-between">
        {switchComponent}
      </div>
      {formComponent}
    </>
  )
}
