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
import { CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "starter_plan_acknowledged";

interface StarterUpgradeAckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

export function StarterUpgradeAckDialog({
  open,
  onOpenChange,
  onContinue,
}: StarterUpgradeAckDialogProps) {
  const [isChecked, setIsChecked] = useState(false);

  const handleContinue = () => {
    if (isChecked) {
      // Save acknowledgment to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, "true");
      }
      onContinue();
      onOpenChange(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // Reset checkbox when dialog opens
      setIsChecked(false);
    }
    onOpenChange(newOpen);
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
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Thanks for upgrading to Starter
          </DialogTitle>
          <DialogDescription className="text-sm">
            Please acknowledge the following before you continue:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            <p className="font-medium">About the Starter plan:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Starter is the cheapest tier and includes only $4 worth of AI
                tokens (~4M tokens).
              </li>
              <li>
                You may use up all 4M tokens quickly due to this minimal
                quantity.
              </li>
              <li>
                We recommend upgrading to a higher tier (Hobby or Business) for
                more tokens when you need them.
              </li>
            </ul>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="starter-ack-checkbox"
              checked={isChecked}
              onCheckedChange={(checked) => setIsChecked(checked === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="starter-ack-checkbox"
              className="cursor-pointer text-sm leading-relaxed text-zinc-700"
            >
              I understand that I may use up credits quickly in this plan
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
