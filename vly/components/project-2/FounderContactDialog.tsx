import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Phone, Copy, Check, Shield } from "lucide-react";
import { toast } from "sonner";

interface FounderContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FounderContactDialog({
  open,
  onOpenChange,
}: FounderContactDialogProps) {
  const [copied, setCopied] = useState(false);
  const phoneNumber = "(206) 569-8127";

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(phoneNumber);
      setCopied(true);
      toast.success("Phone number copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy phone number");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg font-semibold">
              Contact the Founder
            </DialogTitle>
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800 shadow-sm">
              <Shield className="h-3 w-3" />
              Priority
            </span>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Phone number display */}
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 shadow-md">
                  <Phone className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-amber-700">
                    Founder's Direct Line
                  </p>
                  <p className="text-xl font-bold tracking-wide text-amber-900">
                    {phoneNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCopyNumber}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-300 bg-white/80 text-amber-700 transition-all hover:bg-amber-100 hover:shadow-sm"
                aria-label="Copy phone number"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Preferred method notice */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-center text-sm font-medium text-blue-800">
              📱 Preferred method: <span className="underline">Text first</span>
            </p>
          </div>

          {/* What you can reach out for */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-700">
              Reach out for:
            </p>
            <ul className="space-y-1 text-xs text-gray-600">
              <li>• Request a dedicated Slack channel</li>
              <li>• Enterprise or bulk deals</li>
              <li>• Hire a developer</li>
              <li>• Custom feature requests</li>
              <li>• Any other inquiries</li>
            </ul>
          </div>

          {/* Info text */}
          <div className="rounded-lg border border-purple-200/60 bg-purple-50/50 p-3 text-center">
            <p className="text-xs leading-relaxed text-purple-700">
              💜 As a Priority member, you have direct access to the founder.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
