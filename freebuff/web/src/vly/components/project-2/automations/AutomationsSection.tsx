"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Clock, Pencil, Play, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/vly/components/ui/button";
import { Badge } from "@/vly/components/ui/badge";
import { Switch } from "@/vly/components/ui/switch";
import { AutomationDialog } from "./AutomationDialog";
import { describeCron } from "./CronScheduleInput";

type Automation = Doc<"automation">;

const STATUS_LABEL: Record<string, string> = {
  success: "Last run: success",
  skipped: "Last run: skipped",
  rate_limited: "Last run: rate limited",
  quota_exceeded: "Last run: quota exceeded",
  paused: "Last run: paused",
  error: "Last run: error",
};

function statusVariant(
  status: string | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "error") return "destructive";
  if (status === "success") return "secondary";
  if (!status) return "outline";
  return "outline";
}

function AutomationCard({
  automation,
  onEdit,
}: {
  automation: Automation;
  onEdit: (automation: Automation) => void;
}) {
  const toggleAutomation = useMutation(api.automations.toggleAutomation);
  const deleteAutomation = useMutation(api.automations.deleteAutomation);
  const runAutomationNow = useMutation(api.automations.runAutomationNow);
  const [running, setRunning] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    try {
      await toggleAutomation({ automationId: automation._id, enabled });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const result = await runAutomationNow({ automationId: automation._id });
      if (result.success) {
        toast.success("Automation run started");
      } else {
        toast.error(`Could not run: ${result.error ?? result.status}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run");
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete automation "${automation.name}"?`)) return;
    try {
      await deleteAutomation({ automationId: automation._id });
      toast.success("Automation deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card/40 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {automation.name}
          </p>
          {automation.last_run_status && (
            <Badge variant={statusVariant(automation.last_run_status)}>
              {STATUS_LABEL[automation.last_run_status] ??
                automation.last_run_status}
            </Badge>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {describeCron(automation.cron_spec, automation.cron_timezone)}
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
          {automation.prompt}
        </p>
        {automation.last_run_at && (
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            Last run {new Date(automation.last_run_at).toLocaleString()}
            {automation.last_run_error ? ` — ${automation.last_run_error}` : ""}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <Switch
          checked={automation.enabled}
          onCheckedChange={handleToggle}
          aria-label="Enable automation"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRunNow}
          disabled={running}
          title="Run now"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(automation)}
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          title="Delete"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export function AutomationsSection({ projectId }: { projectId: Id<"project"> }) {
  const automations = useQuery(api.automations.listAutomations, { projectId });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (automation: Automation) => {
    setEditing(automation);
    setDialogOpen(true);
  };

  return (
    <section className="mb-5 rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Automations</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Scheduled agent runs (UTC). Each run starts a fresh thread and may
            overlap with your interactive work.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New automation
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {automations === undefined ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : automations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No automations yet. Create one to run a prompt on a schedule.
          </p>
        ) : (
          automations.map((automation: Automation) => (
            <AutomationCard
              key={automation._id}
              automation={automation}
              onEdit={openEdit}
            />
          ))
        )}
      </div>

      <AutomationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        automation={editing}
      />
    </section>
  );
}
