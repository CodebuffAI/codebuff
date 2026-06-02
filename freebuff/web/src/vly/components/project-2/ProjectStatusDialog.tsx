"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader, Shield, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";
import { Card, CardContent } from "@/vly/components/ui/card";

export type ProjectStatus = "not-found" | "migrating" | "maintenance";

interface ProjectStatusDialogProps {
  status: ProjectStatus | null;
  semanticIdentifier: string;
  onMigrationComplete?: () => void;
}

export function ProjectStatusDialog({
  status,
  semanticIdentifier,
  onMigrationComplete,
}: ProjectStatusDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(status !== null);
  }, [status]);

  const handleClose = () => {
    if (status === "not-found") {
      setOpen(false);
      router.push("/web/dashboard");
    }
  };

  if (status === "not-found") {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-4 flex justify-center">
              <Wrench className="h-12 w-12 text-muted-foreground" />
            </div>
            <DialogTitle className="text-center text-2xl">
              Project Not Found
            </DialogTitle>
            <DialogDescription className="text-center">
              The project "{semanticIdentifier}" doesn't exist or you don't have
              access to it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button onClick={handleClose}>Go to Dashboard</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (status === "migrating") {
    return (
      <Dialog open={open}>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="py-4">
            <div className="mb-4 flex justify-center">
              <div className="relative">
                <Loader className="h-12 w-12 animate-spin text-primary" />
                <Shield className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-primary" />
              </div>
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">
                Security Migration in Progress
              </DialogTitle>
              <DialogDescription className="mt-2 text-center">
                We're upgrading your project with enhanced security features.
                This is a one-time process that ensures your data remains
                protected.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span>Migrating project infrastructure...</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div
                  className="h-2 w-2 animate-pulse rounded-full bg-primary/60"
                  style={{ animationDelay: "150ms" }}
                />
                <span>Updating security protocols...</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div
                  className="h-2 w-2 animate-pulse rounded-full bg-primary/30"
                  style={{ animationDelay: "300ms" }}
                />
                <span>Finalizing configuration...</span>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              This usually takes less than 30 seconds
            </p>

            <Card className="mt-6 border-orange-200 bg-orange-50">
              <CardContent className="p-4">
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
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (status === "maintenance") {
    return (
      <Dialog open={open}>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="py-4">
            <div className="mb-4 flex justify-center">
              <Wrench className="h-12 w-12 text-slate-400" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">
                Down for Maintenance
              </DialogTitle>
              <DialogDescription className="mt-2 text-center">
                We're currently performing scheduled maintenance to improve your
                experience. We'll be back online shortly.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Expected to be back online soon
              </p>
              <div className="flex justify-center space-x-3">
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
