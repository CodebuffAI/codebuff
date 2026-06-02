"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Loader, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import { Button } from "@/vly/components/ui/button";

export default function MigratingPage() {
  const searchParams = useSearchParams();
  const projectSemanticIdentifier = searchParams.get("project");

  const migrationRecord = useQuery(api.convex_instance.lookup, {
    semanticIdentifier: projectSemanticIdentifier ?? undefined,
  });

  const router = useRouter();

  useEffect(() => {
    if (migrationRecord) {
      router.push(`/web/project/${projectSemanticIdentifier}`);
    }
  }, [migrationRecord, projectSemanticIdentifier, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Card className="mx-4 w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="relative">
              <Loader className="h-12 w-12 animate-spin text-primary" />
              <Shield className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">
            Security Migration in Progress
          </CardTitle>
          <CardDescription className="mt-2">
            We're upgrading your project with enhanced security features. This
            is a one-time process that ensures your data remains protected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span>Migrating project infrastructure...</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
              <span>Updating security protocols...</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-primary/30" />
              <span>Finalizing configuration...</span>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            This usually takes less than 30 seconds
          </p>

          <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-orange-900">
                  Taking longer than expected?
                </h3>
                <p className="mt-1 text-sm text-orange-800">
                  If it has been more than 5 minutes, report it in the help
                  channel in our Discord, and we will fix it for you.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-orange-300 text-orange-700 hover:bg-orange-100"
                  onClick={() =>
                    window.open("https://discord.gg/2gSmB9DxJW", "_blank")
                  }
                >
                  Join Discord
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
