"use client";

import { useState, useCallback, memo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/vly/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@/vly/components/ui/dialog";
import { Textarea } from "@/vly/components/ui/textarea";
import { Label } from "@/vly/components/ui/label";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import { FeaturePaywallDialog } from "@/vly/components/billing/FeaturePaywallDialog";
import { useFeatureAccess } from "@/vly/hooks/useFeatureAccess";

// ============================================================================
// TYPES
// ============================================================================

interface AddPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: Doc<"ui_preset"> | null;
  semanticIdentifier: string;
}

interface SendMessageResult {
  success: boolean;
  error?: { kind: string; message?: string };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PLACEHOLDER_THEME =
  'e.g., "Apply this theme to my entire app" or "Only use the color palette for the dashboard"';
const PLACEHOLDER_COMPONENT =
  'e.g., "Add this to my hero section" or "Use this as the main navigation"';

const MAX_INPUT_LENGTH = 5000;

// ============================================================================
// VALIDATION
// ============================================================================

function validatePreset(
  preset: Doc<"ui_preset"> | null,
): preset is Doc<"ui_preset"> {
  return preset !== null && Boolean(preset._id && preset.title && preset.code);
}

function validateSemanticIdentifier(identifier: string): boolean {
  return Boolean(identifier?.trim());
}

function sanitizeInput(input: string): string {
  return input.trim().slice(0, MAX_INPUT_LENGTH);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Builds the full message to send to AI from user input and preset data.
 */
function buildAIMessage(preset: Doc<"ui_preset">, userInput: string): string {
  const parts: string[] = [];
  const sanitizedInput = sanitizeInput(userInput);

  if (sanitizedInput) {
    parts.push(`User Instructions: ${sanitizedInput}`);
  }

  const presetType = preset.category === "theme" ? "Theme" : "Component";
  parts.push(`## ${presetType}: ${preset.title}`);

  if (preset.category === "component") {
    parts.push(
      `### Implementation Instructions:\n${preset.prompt}\n\nComponent Code:\n${preset.code}`,
    );
  } else {
    parts.push(`### Implementation Instructions:\n${preset.prompt}`);
  }

  return parts.join("\n\n");
}

/**
 * Dispatches navigation event to switch to chat view.
 */
function navigateToChat(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("navigateToChat", { detail: { from: "uiPresets" } }),
    );
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AddPresetDialog = memo(function AddPresetDialog({
  open,
  onOpenChange,
  preset,
  semanticIdentifier,
}: AddPresetDialogProps) {
  const [userInput, setUserInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const { hasAccess } = useFeatureAccess("ui_components_library");

  const sendMessage = useMutation(
    api.coding_agent.trigger.saveMessageAndStartWorkflow,
  );

  const resetState = useCallback(() => {
    setUserInput("");
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const handleAdd = useCallback(async () => {
    if (!validatePreset(preset)) {
      toast.error("Invalid preset", {
        description: "Please select a valid preset with all required fields",
      });
      return;
    }

    if (!validateSemanticIdentifier(semanticIdentifier)) {
      toast.error("Invalid project", {
        description: "Project identifier is required",
      });
      return;
    }

    // Check if user has access to UI components library
    if (!hasAccess) {
      setShowPaywall(true);
      return;
    }

    setIsSending(true);

    try {
      const fullMessage = buildAIMessage(preset, userInput);

      if (!fullMessage) {
        throw new Error("Failed to build message");
      }

      const result = (await sendMessage({
        projectSemanticIdentifier: semanticIdentifier.trim(),
        message: fullMessage,
        images: [],
      })) as SendMessageResult;

      if (!result) {
        throw new Error("No response from server");
      }

      if (result.success) {
        const presetType = preset.category === "theme" ? "Theme" : "Component";
        toast.success(`${presetType} sent to AI!`, {
          description: "Switching to chat...",
        });

        resetState();
        onOpenChange(false);
        navigateToChat();
      } else {
        const errorMessage = result.error?.message || "Please try again";
        toast.error("Failed to send message", { description: errorMessage });
      }
    } catch (error) {
      console.error("[AddPresetDialog] Failed to send message:", error);

      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error("Failed to send message", { description: errorMessage });
    } finally {
      setIsSending(false);
    }
  }, [
    preset,
    semanticIdentifier,
    userInput,
    sendMessage,
    resetState,
    onOpenChange,
    hasAccess,
  ]);

  // Early return for null preset
  if (!preset) {
    return null;
  }

  const isTheme = preset.category === "theme";
  const presetType = isTheme ? "theme" : "component";

  return (
    <>
      <FeaturePaywallDialog
        featureId="ui_components_library"
        requiredPlan="Scale"
        message="UI Components & Templates library is available on Scale plan and above. Upgrade to unlock access to our curated collection of components and themes."
        title="Unlock UI Components Library"
        open={showPaywall}
        onOpenChange={setShowPaywall}
      />

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add &quot;{preset.title}&quot; to Project</DialogTitle>
            <DialogDescription>
              Optionally describe how you&apos;d like to use this {presetType}{" "}
              in your project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-instructions">
                How would you like to use this? (optional)
              </Label>
              <Textarea
                id="user-instructions"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={
                  isTheme ? PLACEHOLDER_THEME : PLACEHOLDER_COMPONENT
                }
                className="min-h-[100px] resize-none"
                disabled={isSending}
                maxLength={MAX_INPUT_LENGTH}
              />
              <p className="text-xs text-gray-500">
                This helps the AI understand exactly what you want to achieve.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send to AI
                  {!hasAccess && (
                    <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-100 px-1.5 py-0 text-[10px] font-medium text-indigo-700">
                      Scale
                    </span>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
