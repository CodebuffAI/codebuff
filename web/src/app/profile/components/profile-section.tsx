import { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ProfileSectionProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  headerActions?: ReactNode
  variant?: 'card' | 'plain'
}

export function ProfileSection({
  title,
  description,
  children,
  className,
  headerActions,
  variant = 'plain',
}: ProfileSectionProps) {
  const content = (
    <>
      {(title || description || headerActions) && (
        <div className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              {title && (
                <h2 className="text-2xl font-semibold tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
            </div>
            {headerActions && (
              <div className="flex items-center gap-2 md:ml-4">
                {headerActions}
              </div>
            )}
          </div>
        </div>
      )}
      {children}
    </>
  )

  if (variant === 'card') {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          {headerActions}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    )
  }

  return <div className={cn('space-y-6', className)}>{content}</div>
}
