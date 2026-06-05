"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/vly/components/ui/dialog";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { AlertTriangle, Crown, FolderX, Users, Trash2 } from "lucide-react";
import { cn } from "@/vly/lib/utils";

export type DowngradeCancelAction = "downgrade" | "cancel";

interface DowngradeCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: DowngradeCancelAction;
  onConfirm: () => void;
  targetPlanName?: string;
}

export function DowngradeCancelDialog({
  open,
  onOpenChange,
  action,
  onConfirm,
  targetPlanName,
}: DowngradeCancelDialogProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [confirmationText, setConfirmationText] = useState("");

  // Fetch user's projects
  const projects = useQuery(api.project.getUserProjects);

  // Handle dialog open/close with state reset
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // Reset state when opening
      setCurrentSlide(0);
      setConfirmationText("");
    }
    onOpenChange(newOpen);
  };

  const isCancel = action === "cancel";
  const requiredText = isCancel
    ? "DISABLE MY PROJECTS"
    : "DOWNGRADE MY PROJECTS";
  const isConfirmationValid = confirmationText === requiredText;

  const handleKeepDeal = () => {
    onOpenChange(false);
  };

  const handleContinue = () => {
    if (currentSlide < 2) {
      setCurrentSlide(currentSlide + 1);
    } else if (isConfirmationValid) {
      onConfirm();
      onOpenChange(false);
    }
  };

  const getContinueButtonText = () => {
    switch (currentSlide) {
      case 0:
        return "I understand I will lose my 50% discount forever, continue";
      case 1:
        return isCancel
          ? "I understand my projects will be disabled, continue"
          : "I understand I may lose features, continue";
      case 2:
        return isCancel ? "Cancel My Plan" : "Downgrade My Plan";
      default:
        return "Continue";
    }
  };

  const renderSlide = () => {
    switch (currentSlide) {
      case 0:
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-zinc-900">
                You're on an Early Bird 50% Discount!
              </h3>
              <p className="mt-1 text-xs text-zinc-600">
                You're enjoying{" "}
                <span className="font-semibold text-green-600">50% off</span> as
                an early supporter.
                {isCancel ? " If you cancel" : " If you downgrade"}, you may{" "}
                <span className="font-semibold text-red-600">
                  lose this discount forever
                </span>
                .
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div className="text-xs text-amber-800">
                  <p className="font-medium">We're not making a profit</p>
                  <p className="mt-0.5 text-amber-700">
                    Your subscription covers infrastructure costs. We're losing
                    money on early pricing—every subscription matters.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-2 text-center">
              <p className="text-[10px] text-purple-700">
                💜 Meet the founders on{" "}
                <a
                  href="https://discord.gg/yXG3w7wxfs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-purple-900"
                >
                  Discord
                </a>
              </p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <FolderX className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-zinc-900">
                {isCancel
                  ? "Your Projects Will Be Affected"
                  : "You May Lose Features"}
              </h3>
              <p className="mt-1 text-xs text-zinc-600">
                {isCancel
                  ? "Your projects may be disabled. You'll lose:"
                  : `Downgrading${targetPlanName ? ` to ${targetPlanName}` : ""} means losing:`}
              </p>
            </div>
            <div className="space-y-1">
              {isCancel ? (
                <>
                  <FeatureLossItem text="Live deployments & domains" />
                  <FeatureLossItem text="Project workspaces" />
                  <FeatureLossItem text="AI agent credits" />
                  <FeatureLossItem text="GitHub sync" />
                </>
              ) : (
                <>
                  <FeatureLossItem text="Reduced AI credits" />
                  <FeatureLossItem text="Smaller workspaces" />
                  <FeatureLossItem text="Fewer team slots" />
                </>
              )}
            </div>

            {/* Warning about member and project removal on downgrade */}
            {!isCancel && (
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <div className="flex items-start gap-2">
                    <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="text-xs text-amber-800">
                      <p className="font-medium">
                        Members over the count will be removed from projects
                      </p>
                      <p className="mt-0.5 text-amber-700">
                        Most recently added members will be removed first to
                        comply with your new plan's limits.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                  <div className="flex items-start gap-2">
                    <Trash2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                    <div className="text-xs text-red-800">
                      <p className="font-medium">
                        Projects over the project count limit will be terminated
                      </p>
                      <p className="mt-0.5 text-red-700">
                        Excess projects will be disabled and may lose data.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {projects && projects.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                <p className="mb-1 text-[10px] font-medium text-zinc-700">
                  Affected projects ({projects.length}):
                </p>
                <div className="max-h-16 space-y-0.5 overflow-y-auto">
                  {projects.slice(0, 4).map((project) => (
                    <div
                      key={project._id}
                      className="flex items-center gap-1.5 text-[10px] text-zinc-600"
                    >
                      <div className="h-1 w-1 rounded-full bg-zinc-400" />
                      <span className="truncate">
                        {project.name || "Untitled"}
                      </span>
                    </div>
                  ))}
                  {projects.length > 4 && (
                    <p className="text-[10px] text-zinc-500">
                      +{projects.length - 4} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-zinc-900">
                Confirm {isCancel ? "Cancellation" : "Downgrade"}
              </h3>
              <p className="mt-1 text-xs text-zinc-600">
                Type{" "}
                <span className="font-mono text-[10px] font-semibold text-red-600">
                  {requiredText}
                </span>{" "}
                to confirm:
              </p>
            </div>
            <div className="space-y-1">
              <Input
                value={confirmationText}
                onChange={(e) =>
                  setConfirmationText(e.target.value.toUpperCase())
                }
                placeholder={requiredText}
                className={cn(
                  "h-8 text-center font-mono text-xs",
                  confirmationText === requiredText &&
                    "border-green-500 bg-green-50",
                )}
              />
              {confirmationText && confirmationText !== requiredText && (
                <p className="text-center text-[10px] text-red-500">
                  Doesn't match: {requiredText}
                </p>
              )}
            </div>
            {projects && projects.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                <p className="mb-1 text-[10px] font-medium text-red-700">
                  Affected projects:
                </p>
                <div className="max-h-16 space-y-0.5 overflow-y-auto">
                  {projects.slice(0, 4).map((project) => (
                    <div
                      key={project._id}
                      className="flex items-center gap-1.5 text-[10px] text-red-600"
                    >
                      <div className="h-1 w-1 rounded-full bg-red-400" />
                      <span className="truncate">
                        {project.name || "Untitled"}
                      </span>
                    </div>
                  ))}
                  {projects.length > 4 && (
                    <p className="text-[10px] text-red-500">
                      +{projects.length - 4} more
                    </p>
                  )}
                </div>
              </div>
            )}
            {/* Suggestion to downgrade instead of cancel */}
            {isCancel && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center">
                <p className="text-[10px] text-green-700">
                  💡{" "}
                  <span className="font-medium">
                    Want to keep your projects AND 50% off?
                  </span>{" "}
                  Downgrade to our Hobby tier instead—your projects stay
                  unaffected for just $3.99/month.
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-center text-sm">
            {isCancel ? "Cancel Your Plan" : "Downgrade Your Plan"}
          </DialogTitle>
          <DialogDescription className="text-center text-xs">
            Step {currentSlide + 1} of 3
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((step) => (
            <div
              key={step}
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                step === currentSlide
                  ? "bg-purple-600"
                  : step < currentSlide
                    ? "bg-purple-300"
                    : "bg-zinc-200",
              )}
            />
          ))}
        </div>

        {/* Slide content */}
        <div className="py-2">{renderSlide()}</div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5 pt-2">
          <Button
            onClick={handleKeepDeal}
            className="h-10 w-full border border-purple-300 bg-[rgb(233,213,255)] text-sm text-purple-700 hover:bg-purple-200"
          >
            Keep My Deal
          </Button>
          <Button
            variant="ghost"
            onClick={handleContinue}
            disabled={currentSlide === 2 && !isConfirmationValid}
            className="h-8 w-full text-[10px] text-zinc-500 hover:text-zinc-700"
          >
            {getContinueButtonText()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeatureLossItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-red-100 bg-red-50/50 px-2 py-1">
      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-red-100">
        <span className="text-[10px] text-red-600">✕</span>
      </div>
      <span className="text-xs text-zinc-700">{text}</span>
    </div>
  );
}
