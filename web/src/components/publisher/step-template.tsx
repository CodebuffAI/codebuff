import { ReactNode } from 'react'

interface StepTemplateProps {
  children: ReactNode
}

export function StepTemplate({ children }: StepTemplateProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">{children}</div>
    </div>
  )
}
