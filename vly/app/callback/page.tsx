"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader, CheckCircle, XCircle, Database } from "lucide-react";

/**
 * OAuth Callback Page
 * Handles OAuth callbacks from Convex for self-hosting migration
 * This route exists at /callback to match the redirect URI configured in Convex OAuth
 */
export default function OAuthCallbackPage() {
  const [isProcessing, setIsProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    semantic_identifier?: string;
  } | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const handleOAuthCallback = useAction(
    api.convex_oauth.oauth.handleMigrationCallback,
  );

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        setResult({
          success: false,
          message: `Convex OAuth was cancelled: ${errorDescription || error}`,
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
        console.log("[Convex OAuth] Processing callback...");

        const callbackResult = await handleOAuthCallback({
          code,
          state,
        });

        setResult(callbackResult);

        if (callbackResult.success && callbackResult.semantic_identifier) {
          toast({
            title: "Migration Started",
            description:
              "Your data is being migrated to your own Convex project. This may take a few minutes.",
          });

          console.log(
            "[Convex OAuth] Migration started for project:",
            callbackResult.semantic_identifier,
          );

          // Redirect to project page with migration status
          setTimeout(() => {
            router.push(
              `/project/${callbackResult.semantic_identifier}?migration=started`,
            );
          }, 2000);
        } else {
          toast({
            title: "Error",
            description: callbackResult.message,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("[Convex OAuth] Callback error:", error);

        setResult({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to complete Convex OAuth",
        });

        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to complete Convex OAuth",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, router, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isProcessing ? (
              <>
                <Loader className="h-5 w-5 animate-spin text-blue-600" />
                Connecting to Your Convex...
              </>
            ) : result?.success ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                Migration Started
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                Connection Failed
              </>
            )}
          </CardTitle>
          <CardDescription>
            {isProcessing
              ? "Authorizing access to your Convex project..."
              : result?.message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isProcessing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <Database className="h-12 w-12 text-blue-500" />
                  <div className="absolute -bottom-1 -right-1">
                    <Loader className="h-5 w-5 animate-spin text-blue-600" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-center text-sm text-muted-foreground">
                  Please wait while we connect to your Convex project...
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div className="h-2 animate-pulse rounded-full bg-blue-500" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                {result?.success ? (
                  <>
                    <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
                    <p className="mb-4 text-sm text-muted-foreground">
                      Your Convex project has been connected successfully!
                      Migration is now in progress. You'll be redirected to your
                      project page to monitor the progress.
                    </p>
                  </>
                ) : (
                  <>
                    <XCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                    <p className="mb-4 text-sm text-muted-foreground">
                      There was an error connecting to your Convex project.
                      Please try again or contact support if the issue persists.
                    </p>
                  </>
                )}
              </div>

              {!result?.success && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => router.push("/dashboard")}
                    className="flex-1"
                  >
                    Go to Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
