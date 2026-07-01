"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Textarea } from "@/vly/components/ui/textarea";
import { Label } from "@/vly/components/ui/label";
import {
  FreebuffModelSelector,
} from "@/vly/components/project-2/FreebuffModelSelector";
import { DEFAULT_FREEBUFF_MODEL_ID } from "@codebuff/common/constants/freebuff-models";
import { CronScheduleInput } from "./CronScheduleInput";

export function AutomationDialog({
  open,
  onOpenChange,
  projectId,
  automation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: Id<"project">;
  automation?: Doc<"automation"> | null;
}) {
  const isEditing = Boolean(automation);
  const createAutomation = useMutation(api.automations.createAutomation);
  const updateAutomation = useMutation(api.automations.updateAutomation);

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  // Empty for a new automation — CronScheduleInput seeds a local-9am default
  // and emits its cronspec. Editing passes the stored UTC spec to be parsed.
  const [cronSpec, setCronSpec] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_FREEBUFF_MODEL_ID);
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the dialog opens (for create) or the target
  // automation changes (for edit).
  useEffect(() => {
    if (!open) return;
    setName(automation?.name ?? "");
    setPrompt(automation?.prompt ?? "");
    setCronSpec(automation?.cron_spec ?? "");
    setModel(automation?.freebuff_model ?? DEFAULT_FREEBUFF_MODEL_ID);
  }, [open, automation]);

  const canSave = name.trim() && prompt.trim() && cronSpec.trim() && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (automation) {
        await updateAutomation({
          automationId: automation._id,
          name: name.trim(),
          prompt: prompt.trim(),
          cronSpec: cronSpec.trim(),
          freebuffModel: model,
        });
        toast.success("Automation updated");
      } else {
        await createAutomation({
          projectId,
          name: name.trim(),
          prompt: prompt.trim(),
          cronSpec: cronSpec.trim(),
          freebuffModel: model,
        });
        toast.success("Automation created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save automation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit automation" : "New automation"}
          </DialogTitle>
          <DialogDescription>
            Run a prompt against this project on a schedule. Each run starts a
            fresh agent thread.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily changelog update"
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Summarize yesterday's commits and update CHANGELOG.md."
              rows={4}
            />
          </div>

          <CronScheduleInput value={cronSpec} onChange={setCronSpec} />

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <FreebuffModelSelector
              selectedModelId={model}
              onModelChange={setModel}
              compact
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEditing ? "Save changes" : "Create automation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
