"use client";
import React, { useState } from "react";
import { FunctionReturnType } from "convex/server";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Database, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { FeaturePaywallDialog } from "@/components/billing/FeaturePaywallDialog";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface ExportDevToProdDataProps {
  project: FunctionReturnType<typeof api.project.getProjectData> | undefined;
}

export default function ExportDevToProdData({
  project,
}: ExportDevToProdDataProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [isReplacing, setIsReplacing] = useState(false);
  const { hasAccess } = useFeatureAccess("data_transfer");
  const exportDevToProdDataAction = useAction(
    api.codesandbox.management.ExportDevToProdData,
  );

  const handleExport = async () => {
    if (!project?.semantic_identifier) {
      toast.error("Project not found");
      return;
    }

    // Check if user has access to data transfer
    if (!hasAccess) {
      setShowDialog(false);
      setShowPaywall(true);
      return;
    }

    // if (confirmationText !== "MERGE DEV INTO PROD") {
    //   toast.error('Please type "MERGE DEV INTO PROD" to confirm');
    //   return;
    // }
    if (confirmationText !== "Replace PROD with DEV") {
      toast.error('Please type "Replace PROD with DEV" to confirm');
      return;
    }

    setIsReplacing(true);

    try {
      const result = await exportDevToProdDataAction({
        semanticIdentifier: project.semantic_identifier,
        confirmationText: confirmationText,
      });

      if (result) {
        toast.success(
          "Production database successfully replaced with dev data!",
        );
        setShowDialog(false);
        setConfirmationText("");
      } else {
        toast.error("Database replacement failed");
      }
    } catch (error) {
      console.error("Database export error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to export database",
      );
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <>
      <FeaturePaywallDialog
        featureId="data_transfer"
        requiredPlan="Scale"
        message="Data Transfer (Dev ↔ Prod) is available on Scale plan and above. Upgrade to unlock the ability to transfer data between your development and production environments."
        title="Unlock Data Transfer"
        open={showPaywall}
        onOpenChange={setShowPaywall}
      />

      {/* Compact inline button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (!hasAccess) {
            setShowPaywall(true);
          } else {
            setShowDialog(true);
          }
        }}
        className="h-8 gap-1.5 border-red-200 bg-red-50/50 text-xs text-red-700 hover:bg-red-100 hover:text-red-800"
      >
        <Database className="h-3 w-3" />
        <span>Transfer</span>
        {!hasAccess && (
          <span className="ml-0.5 rounded-full border border-indigo-200 bg-indigo-100 px-1 py-0 text-[9px] font-medium text-indigo-700">
            Scale
          </span>
        )}
      </Button>

      {/* Export Confirmation Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Replace Prod with Dev Data
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p className="font-semibold text-foreground">
                ⚠️ WARNING: This will replace the production database with the
                dev database.
              </p>
              <p>This will:</p>
              <ul className="ml-4 list-disc space-y-1 text-sm">
                <li>Export your current dev database</li>
                <li>
                  <strong className="text-red-600">
                    Replace the production database with the dev database
                  </strong>
                </li>
                <li>Delete the existing production database</li>
              </ul>
              <p className="pt-2 text-sm font-medium">
                Type{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  Replace PROD with DEV
                </code>{" "}
                to confirm:
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Type confirmation text here"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              disabled={isReplacing}
              className="font-mono"
            />
            {confirmationText &&
              confirmationText !== "Replace PROD with DEV" && (
                <p className="text-xs text-red-600">
                  Confirmation text does not match. Please type exactly: Replace
                  PROD with DEV
                </p>
              )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDialog(false);
                setConfirmationText("");
              }}
              disabled={isReplacing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleExport}
              disabled={
                isReplacing || confirmationText !== "Replace PROD with DEV"
              }
            >
              {isReplacing ? (
                <>
                  <span className="mr-2">Replacing...</span>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Replace Prod with Dev Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
