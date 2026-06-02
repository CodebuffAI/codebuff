"use client";

import { Button } from "@/vly/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/vly/hooks/use-toast";
import { useAction } from "convex/react";
import { CheckCircle, Loader, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function GitHubCallbackPage() {
  const [isProcessing, setIsProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const handleCallback = useAction(api.github.octokit.handleGitHubCallback);

  useEffect(() => {
    const processCallback = async () => {
      const installationId = searchParams.get("installation_id");
      const setupAction = searchParams.get("setup_action");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        setResult({
          success: false,
          message: `GitHub App installation was cancelled: ${error}`,
        });
        setIsProcessing(false);
        return;
      }

      if (!installationId || !state) {
        setResult({
          success: false,
          message: "Missing installation ID or state parameter",
        });
        setIsProcessing(false);
        return;
      }

      try {
        const callbackResult = await handleCallback({
          installation_id: installationId,
          setup_action: setupAction || undefined,
          state,
        });

        setResult(callbackResult);

        if (callbackResult.success) {
          toast({
            title: "Success",
            description: callbackResult.message,
          });

          // Debug logging
          console.log("Callback result:", callbackResult);
          console.log("Return URL:", callbackResult.returnUrl);

          // Redirect based on return URL or default to home page
          setTimeout(() => {
            if (callbackResult.returnUrl) {
              console.log("Redirecting to:", callbackResult.returnUrl);
              router.push(callbackResult.returnUrl);
            } else {
              console.log("No return URL, redirecting to dashboard");
              router.push("/web");
            }
          }, 2000);
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
              : "Failed to complete GitHub App installation",
        });

        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to complete GitHub App installation",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, handleCallback, router, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isProcessing ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Installing GitHub App...
              </>
            ) : result?.success ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                GitHub App Installed
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                Installation Failed
              </>
            )}
          </CardTitle>
          <CardDescription>
            {isProcessing
              ? "Completing your GitHub App installation..."
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
                Please wait while we complete your GitHub App installation...
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
                    ? "The GitHub App has been successfully installed and can now create repositories on your behalf."
                    : "There was an error installing the GitHub App."}
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => router.push("/web")} className="flex-1">
                  Go to Dashboard
                </Button>
                {!result?.success && (
                  <Button
                    variant="outline"
                    onClick={() => router.push("/web/dashboard/preferences")}
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
