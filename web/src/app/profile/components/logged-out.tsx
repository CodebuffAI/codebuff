'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SignInButton } from '@/components/sign-in/sign-in-button'

export function ProfileLoggedOut() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-center">
        <Card className="w-full max-w-2xl bg-gradient-to-br from-background via-background to-accent/5 border-border/50 shadow-lg">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-3xl font-bold mb-4">
              Sign in to Codebuff
            </CardTitle>
            <CardDescription className="text-lg text-muted-foreground">
              Access your account settings and manage your profile
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <SignInButton providerName="github" providerDomain="github.com" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
