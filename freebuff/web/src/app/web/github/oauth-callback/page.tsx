"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/vly/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import { Button } from "@/vly/components/ui/button";
import { Loader, CheckCircle, XCircle } from "lucide-react";

export default function GitHubOAuthCallbackPage() {
  const [isProcessing, setIsProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    redirectUrl?: string;
  } | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const handleOAuthCallback = useAction(
    api.github.auth.handleGitHubOAuthCallback,
  );

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        setResult({
          success: false,
          message: `GitHub OAuth was cancelled: ${error}`,
        });
        setIsProcessing(false);
        return;
      }

      if (!code || !state) {
        setResult({
          success: false,
          message: "Missing authorization code or state parameter",
        });
        setIsProcessing(false);
        return;
      }

      try {
        const callbackResult = await handleOAuthCallback({
          code,
          state,
        });

        setResult(callbackResult);

        if (callbackResult.success) {
          toast({
            title: "Success",
            description: "GitHub account identified successfully",
          });

          // Debug logging
          console.log("OAuth callback result:", callbackResult);
          console.log("Redirect URL:", callbackResult.redirectUrl);

          // Redirect to GitHub App installation
          if (callbackResult.redirectUrl) {
            console.log("Redirecting to GitHub App installation");
            window.location.href = callbackResult.redirectUrl;
          } else {
            console.log("No redirect URL, redirecting to dashboard");
            router.push("/web");
          }
        } else {
          toast({
            title: "Error",
            description: callbackResult.message,
            variant: "destructive",
          });
        }
      } catch (error) {
        setResult({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to complete GitHub OAuth",
        });

        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to complete GitHub OAuth",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, router, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isProcessing ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Identifying GitHub Account...
              </>
            ) : result?.success ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                GitHub Account Identified
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                Identification Failed
              </>
            )}
          </CardTitle>
          <CardDescription>
            {isProcessing
              ? "Verifying your GitHub account..."
              : result?.message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isProcessing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <Loader className="h-8 w-8 animate-spin text-blue-500" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Please wait while we verify your GitHub account...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                {result?.success ? (
                  <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
                ) : (
                  <XCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                )}
                <p className="mb-4 text-sm text-muted-foreground">
                  {result?.success
                    ? "Your GitHub account has been identified. Redirecting to install the GitHub App..."
                    : "There was an error identifying your GitHub account."}
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => router.push("/web")} className="flex-1">
                  Go to Dashboard
                </Button>
                {!result?.success && (
                  <Button
                    variant="outline"
                    onClick={() => router.push("/web")}
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
