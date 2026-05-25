import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { ArrowRight, Download, FileEdit, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function GodModeActions({
  isExpanded: _isExpanded,
  project,
}: {
  isExpanded: boolean;
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
    <div className="relative mb-3 rounded-md border border-amber-400/40 bg-gradient-to-br from-amber-50/50 to-yellow-50/30 p-2 shadow-sm">
      {/* Header */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-sm">😎</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900">
          God Mode
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <Button
          onClick={handleOpenAdminPanel}
          variant="outline"
          className="h-auto w-full justify-start border-zinc-300 bg-white py-1.5 text-left hover:border-amber-400 hover:bg-amber-50"
        >
          <Settings className="mr-2 h-3.5 w-3.5 min-w-3.5 text-zinc-700" />
          <div className="flex flex-1 items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-800">
              Admin Actions
            </span>
            <span className="text-[9px] font-medium text-zinc-500">⌘K</span>
          </div>
        </Button>

        <Link
          href={getSandboxUrl(project.sandbox_id)}
          target="_blank"
          className="w-full"
        >
          <Button
            variant="outline"
            className="h-auto w-full justify-start border-zinc-300 bg-white py-1.5 text-left hover:border-amber-400 hover:bg-amber-50"
          >
            <FileEdit className="mr-2 h-3.5 w-3.5 min-w-3.5 text-zinc-700" />
            <span className="text-[11px] font-medium text-zinc-800">
              Open Sandbox
            </span>
          </Button>
        </Link>

        {convexInstance?.devDeploymentName && (
          <Link
            href={`https://dashboard.convex.dev/d/${convexInstance.devDeploymentName}/`}
            target="_blank"
            className="w-full"
          >
            <Button
              variant="outline"
              className="h-auto w-full justify-start border-zinc-300 bg-white py-1.5 text-left hover:border-amber-400 hover:bg-amber-50"
            >
              <img
                src="/convex-color.svg"
                alt="Convex"
                className="mr-2 h-3.5 w-3.5 min-w-3.5"
              />
              <span className="text-[11px] font-medium text-zinc-800">
                Convex Dashboard
              </span>
            </Button>
          </Link>
        )}

        <Button
          onClick={handleDownload}
          disabled={downloading}
          variant="outline"
          className="h-auto w-full justify-start border-zinc-300 bg-white py-1.5 text-left hover:border-amber-400 hover:bg-amber-50"
        >
          <Download className="mr-2 h-3.5 w-3.5 min-w-3.5 text-zinc-700" />
          <span className="text-[11px] font-medium text-zinc-800">
            {downloading ? "Downloading..." : "Download Code"}
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
            className="h-auto w-full justify-start border-zinc-300 bg-white py-1.5 text-left hover:border-amber-400 hover:bg-amber-50"
          >
            <ArrowRight className="mr-2 h-3.5 w-3.5 min-w-3.5 text-zinc-700" />
            <span className="text-[11px] font-medium text-zinc-800">
              {migrating ? "Migrating..." : "Migrate to Daytona"}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
