"use client";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/vly/lib/utils";
import { useAction } from "convex/react";
import { Loader } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function BackendLogs({
  projectId,
  deploymentType,
}: {
  projectId: Id<"project">;
  deploymentType: "dev" | "prod";
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [deploymentDetails, setDeploymentDetails] = useState<{
    deploymentName: string;
    adminKey: string;
  }>();

  const [authenticated, setAuthenticated] = useState(false);

  const deploymentUrl = `https://${deploymentDetails?.deploymentName}.convex.cloud`;

  const getConvexDeploymentNameAndAdminKey = useAction(
    api.database.convex.getConvexDeploymentNameAndAdminKey,
  );

  useEffect(() => {
    const getDeploymentUrl = async () => {
      setDeploymentDetails(undefined);
      setAuthenticated(false);

      let deploymentDetails: {
        deploymentName: string;
        adminKey: string;
      };

      if (deploymentType === "dev") {
        deploymentDetails = await getConvexDeploymentNameAndAdminKey({
          projectId: projectId,
          type: "dev",
        });
      } else {
        deploymentDetails = await getConvexDeploymentNameAndAdminKey({
          projectId: projectId,
          type: "prod",
        });
      }

      setDeploymentDetails(deploymentDetails);
    };
    getDeploymentUrl();
  }, [projectId, deploymentType]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "dashboard-credentials-request") {
        return;
      }

      if (!deploymentUrl || !deploymentDetails) {
        return;
      }

      const iframe = iframeRef.current;

      if (!iframe) {
        throw new Error("iframe ref not found");
      }

      iframe.contentWindow?.postMessage(
        {
          type: "dashboard-credentials",
          adminKey: deploymentDetails.adminKey,
          deploymentUrl,
          deploymentName: deploymentDetails.deploymentName,
          visiblePages: ["logs"],
        },
        "*",
      );

      setTimeout(() => {
        setAuthenticated(true);
      }, 500);
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, [deploymentUrl, deploymentDetails]);

  return (
    <div className="m-0 flex h-full w-full flex-grow flex-col p-0">
      {!deploymentDetails && (
        <div className="m-0 flex h-full w-full flex-col items-center justify-center p-0">
          <div className="relative">
            <Loader className="h-6 w-6 animate-spin" />
          </div>
          <p className="">Connecting to Logs...</p>
        </div>
      )}
      {deploymentDetails && (
        <iframe
          ref={iframeRef}
          className={cn(
            "h-screen min-h-0 w-full min-w-0 flex-grow border-0",
            !authenticated && "hidden",
          )}
          src={"https://web/dashboard-embedded.convex.dev/logs"}
        />
      )}
    </div>
  );
}
