"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/vly/components/ui/dialog";

import { Button } from "@/vly/components/ui/button";
import { usePaywall } from "@/vly/lib/billing-disabled-react";
import { getPaywallContent } from "@/vly/lib/autumn/paywall-content";
import { cn } from "@/vly/lib/utils";

export interface PaywallDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  featureId: string;
  entityId?: string;
}

export default function PaywallDialog(params?: PaywallDialogProps) {
  const { data: preview } = usePaywall({
    featureId: params?.featureId,
    entityId: params?.entityId,
  });

  if (!params || !preview) {
    return <></>;
  }

  const { open, setOpen } = params;
  const { title, message } = getPaywallContent(preview);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 pt-4 text-sm text-foreground">
        <DialogTitle className={cn("px-6 text-xl font-bold")}>
          {title}
        </DialogTitle>
        <div className="my-2 px-6">{message}</div>
        <DialogFooter className="mt-4 flex flex-col justify-between gap-x-4 border-t bg-secondary py-2 pl-6 pr-3 sm:flex-row">
          <Button
            size="sm"
            className="min-w-20 font-medium shadow transition"
            onClick={async () => {
              setOpen(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
