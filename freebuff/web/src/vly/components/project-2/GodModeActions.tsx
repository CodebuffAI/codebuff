import { Button } from "@/vly/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { ArrowRight, Download, FileEdit, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function GodModeActions({
  isExpanded = true,
  layout = "vertical",
  project,
}: {
  isExpanded?: boolean;
  layout?: "vertical" | "horizontal";
  project: Doc<"project">;
}) {
  const convexInstance = useQuery(api.project.getConvexInstance, {
    projectId: project._id,
  });

  const getDownloadUrl = useAction(
    api.codesandbox.export.getCodebaseDownloadUrl,
  );

  const migrateToDaytona = useAction(api.codesandbox.export.migrateToDaytona);

  const [downloading, setDownloading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const isHorizontal = layout === "horizontal";
  const actionButtonClass = isHorizontal
    ? "h-8 w-auto justify-start border-emerald-500/35 bg-zinc-900/80 px-2.5 text-left text-emerald-100 hover:bg-emerald-500/15 hover:border-emerald-400/50"
    : "h-auto w-full justify-start border-emerald-500/35 bg-zinc-900/80 py-1.5 text-left text-emerald-100 hover:bg-emerald-500/15 hover:border-emerald-400/50";

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getDownloadUrl({
        semanticIdentifier: project.semantic_identifier,
      });
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name || "project"}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert("Failed to download code");
    } finally {
      setDownloading(false);
    }
  };

  const getSandboxUrl = (sandbox_id: string) => {
    if (sandbox_id.startsWith("daytona:")) {
      const daytonaSandboxId = sandbox_id.split(":")[1];
      return `https://22222-${daytonaSandboxId}.proxy.daytona.works`;
    }
    return `https://codesandbox.io/p/devbox/${sandbox_id}`;
  };

  const handleOpenAdminPanel = () => {
    // Trigger CMD/Ctrl + K to open the global admin panel
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  return (
    <div
      className={`relative rounded-md border border-emerald-500/35 bg-gradient-to-br from-zinc-950 to-zinc-900 shadow-sm shadow-black/30 ${
        isHorizontal ? "flex items-center gap-1.5 p-1.5" : "p-2"
      } ${
        isExpanded ? "mb-3" : "mb-0"
      }`}
    >
      {/* Header */}
      <div className={`${isHorizontal ? "mb-0 mr-1" : "mb-2"} flex items-center gap-1.5`}>
        <span className="text-sm">😎</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">
          God Mode
        </span>
      </div>

      {/* Actions */}
      <div
        className={
          isHorizontal
            ? "flex flex-row items-center gap-1 overflow-x-auto"
            : "flex flex-col gap-1.5"
        }
      >
        <Button
          onClick={handleOpenAdminPanel}
          variant="outline"
          className={actionButtonClass}
        >
          <Settings className="mr-2 h-3.5 w-3.5 min-w-3.5 text-emerald-300" />
          <div className={isHorizontal ? "flex items-center" : "flex flex-1 items-center justify-between"}>
            <span className="text-[11px] font-medium text-emerald-100">
              {isHorizontal ? "Admin" : "Admin Actions"}
            </span>
            {!isHorizontal && (
              <span className="text-[9px] font-medium text-emerald-300/70">⌘K</span>
            )}
          </div>
        </Button>

        <Link
          href={getSandboxUrl(project.sandbox_id)}
          target="_blank"
          className={isHorizontal ? "w-auto" : "w-full"}
        >
          <Button
            variant="outline"
            className={actionButtonClass}
          >
            <FileEdit className="mr-2 h-3.5 w-3.5 min-w-3.5 text-emerald-300" />
            <span className="text-[11px] font-medium text-emerald-100">
              {isHorizontal ? "Sandbox" : "Open Sandbox"}
            </span>
          </Button>
        </Link>

        {convexInstance?.devDeploymentName && (
          <Link
            href={`https://dashboard.convex.dev/d/${convexInstance.devDeploymentName}/`}
            target="_blank"
            className={isHorizontal ? "w-auto" : "w-full"}
          >
            <Button
              variant="outline"
              className={actionButtonClass}
            >
              <img
                src="/convex-color.svg"
                alt="Convex"
                className="mr-2 h-3.5 w-3.5 min-w-3.5"
              />
              <span className="text-[11px] font-medium text-emerald-100">
                {isHorizontal ? "Convex" : "Convex Dashboard"}
              </span>
            </Button>
          </Link>
        )}

        <Button
          onClick={handleDownload}
          disabled={downloading}
          variant="outline"
          className={actionButtonClass}
        >
          <Download className="mr-2 h-3.5 w-3.5 min-w-3.5 text-emerald-300" />
          <span className="text-[11px] font-medium text-emerald-100">
            {downloading
              ? "Downloading..."
              : isHorizontal
                ? "Download"
                : "Download Code"}
          </span>
        </Button>

        {!project.sandbox_id?.startsWith("daytona:") && (
          <Button
            onClick={async () => {
              setMigrating(true);
              try {
                alert("migrating to daytona");
                const result = await migrateToDaytona({
                  projectId: project._id,
                });
                console.log(`migrated to daytona: ${result.daytonaSandboxId}`);
                alert("Migration successful");
                window.location.reload();
              } catch (err) {
                console.error(err);
                alert("Failed to migrate to Daytona");
              } finally {
                setMigrating(false);
              }
            }}
            disabled={migrating}
            variant="outline"
            className={actionButtonClass}
          >
            <ArrowRight className="mr-2 h-3.5 w-3.5 min-w-3.5 text-emerald-300" />
            <span className="text-[11px] font-medium text-emerald-100">
              {migrating
                ? "Migrating..."
                : isHorizontal
                  ? "Migrate"
                  : "Migrate to Daytona"}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
