import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { DeployManager } from "./DeployManager";
import { DomainManager } from "./DomainManager";
import {
  Dialog,
  DialogContent,
} from "@/vly/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/vly/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/vly/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import { useState } from "react";
import { useIsMobile } from "@/vly/hooks/use-mobile";
import { cn } from "@/vly/lib/utils";

export function DeploymentDialog({
  isOpen,
  onOpenChange,
  projectId,
  onDeployTriggered,
  settingsHref,
  trigger,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  className?: string;
  onDeployTriggered?: () => void;
  settingsHref?: string;
  trigger?: ReactNode;
}) {
  const isMobile = useIsMobile();

  if (trigger) {
    if (isMobile) {
      return (
        <Drawer open={isOpen} onOpenChange={onOpenChange}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent className="max-h-[88dvh] border-border bg-background text-foreground">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Manage deployments</DrawerTitle>
            </DrawerHeader>
            <DeploymentPanel
              projectId={projectId}
              onDeployTriggered={onDeployTriggered}
              settingsHref={settingsHref}
              onClose={() => onOpenChange(false)}
              variant="drawer"
            />
          </DrawerContent>
        </Drawer>
      );
    }

    return (
      <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={10}
          collisionPadding={12}
          className="w-[min(92vw,620px)] overflow-hidden rounded-lg border-border bg-background p-0 text-foreground shadow-xl shadow-black/40"
        >
          <DeploymentPanel
            projectId={projectId}
            onDeployTriggered={onDeployTriggered}
            settingsHref={settingsHref}
            onClose={() => onOpenChange(false)}
            variant="popover"
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[86vh] w-[min(92vw,620px)] overflow-hidden rounded-lg border-border bg-background p-0 text-foreground"
      >
        <DeploymentPanel
          projectId={projectId}
          onDeployTriggered={onDeployTriggered}
          settingsHref={settingsHref}
          onClose={() => onOpenChange(false)}
          variant="popover"
        />
      </DialogContent>
    </Dialog>
  );
}

export function DeploymentSettingsPanel({
  projectId,
}: {
  projectId: Id<"project">;
}) {
  return <DeploymentPanel projectId={projectId} variant="settings" />;
}

function DeploymentPanel({
  projectId,
  onDeployTriggered,
  settingsHref,
  onClose,
  variant,
}: {
  projectId: string;
  onDeployTriggered?: () => void;
  settingsHref?: string;
  onClose?: () => void;
  variant: "popover" | "drawer" | "settings";
}) {
  const [activeTab, setActiveTab] = useState("deployments");
  const isSettings = variant === "settings";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-background text-foreground",
        isSettings ? "h-full w-full" : "max-h-[78vh]",
        variant === "drawer" && "max-h-[82dvh]",
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Manage deployments
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            If a deployment is stuck, report it in{" "}
            <a
              href="https://discord.gg/yXG3w7wxfs"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Discord
            </a>
            .
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {settingsHref && !isSettings && (
            <a
              href={settingsHref}
              className="hidden rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground/85 transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            >
              Full settings
            </a>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close deployments"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {settingsHref && !isSettings && (
        <div className="border-b border-border/60 px-4 py-2 sm:hidden">
          <a
            href={settingsHref}
            className="inline-flex rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
          >
            Open full deployment settings
          </a>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5"
      >
        <TabsList className="grid w-full grid-cols-2 rounded-md bg-muted/45 p-1">
          <TabsTrigger
            value="deployments"
            className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground"
          >
            Deployments
          </TabsTrigger>
          <TabsTrigger
            value="domains"
            className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground"
          >
            Domains
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="deployments"
          className={cn(
            "flex min-h-0 flex-col overflow-hidden pt-4",
            isSettings ? "flex-1" : "max-h-[55vh]",
          )}
        >
          <DeployManager
            projectId={projectId}
            onSwitchToDomains={() => setActiveTab("domains")}
            onDeployTriggered={onDeployTriggered}
          />
        </TabsContent>
        <TabsContent
          value="domains"
          className={cn(
            "min-h-0 overflow-y-auto pt-4",
            isSettings ? "flex-1" : "max-h-[55vh]",
          )}
        >
          <DomainManager projectId={projectId as Id<"project">} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
