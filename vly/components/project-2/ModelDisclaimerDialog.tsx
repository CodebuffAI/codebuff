"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";

const STORAGE_KEY = "vly_model_disclaimer_acknowledged";

interface ModelDisclaimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAcknowledge: () => void;
  modelName: "Claude Code" | "Gemini CLI" | "Codex";
}

export function ModelDisclaimerDialog({
  open,
  onOpenChange,
  onAcknowledge,
  modelName: _modelName,
}: ModelDisclaimerDialogProps) {
  const [isChecked, setIsChecked] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // Reset checkbox when dialog opens
      setIsChecked(false);
    }
    onOpenChange(newOpen);
  };

  const handleContinue = () => {
    if (isChecked) {
      // Store acknowledgment in localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, "true");
      }
      onAcknowledge();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Important Notice
          </DialogTitle>
          <DialogDescription className="text-sm">
            Before using Claude Code, Gemini CLI, or Codex, please acknowledge:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Important:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                vly.ai did not create these models (Claude Code, Gemini CLI,
                Codex)
              </li>
              <li>We do not control their output or any mistakes they make</li>
              <li>You are responsible for all costs they incur</li>
            </ul>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="disclaimer-checkbox"
              checked={isChecked}
              onCheckedChange={(checked) => setIsChecked(checked === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="disclaimer-checkbox"
              className="cursor-pointer text-sm leading-relaxed text-zinc-700"
            >
              I understand that vly.ai is not responsible for the output of
              these models
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleContinue} disabled={!isChecked}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Check if the user has already acknowledged the model disclaimer
 */
export function hasAcknowledgedDisclaimer(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}
