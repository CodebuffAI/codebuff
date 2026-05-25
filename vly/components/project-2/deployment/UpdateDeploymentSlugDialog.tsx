"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContentNoOverlay,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { Edit, Loader } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface UpdateDeploymentSlugDialogProps {
  deploymentId: Id<"deployments">;
  currentDomain: string;
  onUpdated?: (newDomain: string) => void;
  className?: string;
}

export const UpdateDeploymentSlugDialog = ({
  deploymentId,
  currentDomain,
  onUpdated,
  className,
}: UpdateDeploymentSlugDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [slugError, setSlugError] = useState("");

  const updateSlug = useAction(api.deployment.updateDeploymentSlug);

  // Extract current slug from domain
  const currentSlug = currentDomain.replace(".vly.site", "");

  // Pure validation function - returns validation result without side effects
  const validateSlug = (slug: string): { isValid: boolean; error: string } => {
    const regex = /^[a-z][a-z0-9-]*$/;
    if (!slug) {
      return { isValid: true, error: "" };
    }
    if (slug === currentSlug) {
      return { isValid: false, error: "Slug is the same as current" };
    }
    if (!regex.test(slug)) {
      return {
        isValid: false,
        error:
          "Invalid format. Start with letter, use lowercase letters, numbers, and hyphens only",
      };
    }
    if (slug.length > 63) {
      return { isValid: false, error: "Slug must be 63 characters or less" };
    }
    return { isValid: true, error: "" };
  };

  // Always call useQuery (never conditionally!) but use result only when slug is valid
  // Show placeholder when empty to avoid conditional hook calls
  const slugToCheck = newSlug && validateSlug(newSlug).isValid ? newSlug : "~";
  const checkAvailability = useQuery(api.deployment.checkIfSlugAvailable, {
    slug: slugToCheck,
  });

  const handleSlugChange = (value: string) => {
    const cleanedSlug = value.trim().toLowerCase();
    setNewSlug(cleanedSlug);

    // Validate and set error message
    const validation = validateSlug(cleanedSlug);
    setSlugError(validation.error);
  };

  const handleUpdate = async () => {
    const validation = validateSlug(newSlug);
    if (!validation.isValid) {
      toast.error(validation.error || "Invalid slug format");
      return;
    }

    if (checkAvailability === false) {
      toast.error("Slug is already taken");
      return;
    }

    setIsUpdating(true);
    try {
      const result = await updateSlug({
        deploymentId,
        newSlug,
      });
      toast.success(result.message);
      setIsOpen(false);
      setNewSlug("");
      setSlugError("");
      onUpdated?.(result.newDeploymentDomain);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update deployment";
      toast.error(errorMessage);
      console.error("Update error:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const validation = validateSlug(newSlug);
  const isSlugValid = validation.isValid;
  const isFormValid =
    newSlug && isSlugValid && checkAvailability === true && !isUpdating;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`flex items-center gap-1 ${className}`}
        >
          <Edit className="h-4 w-4" />
          Edit Slug
        </Button>
      </DialogTrigger>
      <DialogContentNoOverlay>
        <DialogHeader>
          <DialogTitle>Update Deployment Slug</DialogTitle>
          <DialogDescription>
            Change your deployment slug to update the domain. Custom domains
            will automatically work with the new slug.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Domain */}
          <div>
            <Label className="text-sm font-medium">Current Domain</Label>
            <div className="mt-1 rounded-md bg-gray-100 px-3 py-2 font-mono text-sm">
              {currentDomain}
            </div>
          </div>

          {/* New Slug Input */}
          <div>
            <Label htmlFor="newSlug" className="text-sm font-medium">
              New Slug
            </Label>
            <div className="mt-1 flex items-center overflow-hidden rounded-md border border-gray-200 bg-white">
              <Input
                id="newSlug"
                placeholder="e.g., my-app-v2"
                value={newSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                disabled={isUpdating}
                className="flex-1 border-0 shadow-none focus:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="px-3 font-mono text-sm text-gray-500">
                .vly.site
              </div>
            </div>
            {slugError && (
              <p className="mt-1 text-xs text-red-500">{slugError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Lowercase letters, numbers, and hyphens. Must start with a letter.
            </p>

            {/* Slug Availability */}
            {newSlug && validation.isValid && newSlug !== currentSlug && (
              <div className="mt-2">
                {checkAvailability === null && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader className="h-3 w-3 animate-spin" />
                    Checking availability...
                  </div>
                )}
                {checkAvailability === true && (
                  <div className="text-sm font-medium text-green-600">
                    ✓ Slug is available
                  </div>
                )}
                {checkAvailability === false && (
                  <div className="text-sm font-medium text-red-600">
                    ✗ Slug is already taken
                  </div>
                )}
              </div>
            )}
          </div>

          {/* New Domain Preview */}
          {newSlug && isSlugValid && (
            <div>
              <Label className="text-sm font-medium">New Domain</Label>
              <div className="mt-1 rounded-md bg-blue-50 px-3 py-2 font-mono text-sm text-blue-900">
                {newSlug}.vly.site
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false);
              setNewSlug("");
              setSlugError("");
            }}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={!isFormValid}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isUpdating ? (
              <div className="flex items-center gap-2">
                <Loader className="h-4 w-4 animate-spin" />
                Updating...
              </div>
            ) : (
              "Update Slug"
            )}
          </Button>
        </DialogFooter>
      </DialogContentNoOverlay>
    </Dialog>
  );
};
