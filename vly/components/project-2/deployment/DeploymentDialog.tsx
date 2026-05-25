import { Id } from "!/_generated/dataModel";
import { DeployManager } from "./DeployManager";
import { DomainManager } from "./DomainManager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export function DeploymentDialog({
  isOpen,
  onOpenChange,
  projectId,
  className,
  onDeployTriggered,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  className?: string;
  onDeployTriggered?: () => void;
}) {
  const [activeTab, setActiveTab] = useState("deployments");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={`compact-dialog-text light max-h-[80vh] min-w-[30vw] ${className}`}
      >
        <DialogHeader className="p-4">
          <DialogTitle className="text-base">Manage Deployments</DialogTitle>
          <Badge className="mt-2 w-fit">
            If deployments are stuck, report it in our &nbsp;
            <a
              href="https://discord.gg/2gSmB9DxJW"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline hover:text-red-300"
            >
              Discord
            </a>
          </Badge>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col p-4 pt-0"
        >
          <TabsList className="w-full">
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
          </TabsList>
          <TabsContent
            value="deployments"
            className="max-h-[50vh] overflow-y-auto"
          >
            <DeployManager
              projectId={projectId}
              onSwitchToDomains={() => setActiveTab("domains")}
              onDeployTriggered={onDeployTriggered}
            />
          </TabsContent>
          <TabsContent value="domains" className="max-h-[50vh] overflow-y-auto">
            <DomainManager projectId={projectId as Id<"project">} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
