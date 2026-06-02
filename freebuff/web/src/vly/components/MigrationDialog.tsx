"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/vly/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/vly/components/ui/dialog";
import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";
import { Loader2 } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

export function MigrationDialog() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const migrationAction = useAction(api.migrations.migrateDeployKeysPublic);

  const [formData, setFormData] = useState({
    projectId: "",
    semanticIdentifier: "",
    sandboxId: "",
    convexUrl: "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Validate required fields
      if (
        !formData.projectId ||
        !formData.semanticIdentifier ||
        !formData.sandboxId
      ) {
        setError("Please fill in all required fields");
        setIsLoading(false);
        return;
      }

      await migrationAction({
        project: {
          _id: formData.projectId as Id<"project">,
          _creationTime: "",
          semantic_identifier: formData.semanticIdentifier,
          sandbox_id: formData.sandboxId,
          convex_url: formData.convexUrl || undefined,
        },
      });

      // Reset form and close dialog on success
      setFormData({
        projectId: "",
        semanticIdentifier: "",
        sandboxId: "",
        convexUrl: "",
      });
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred during migration",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Run Migration
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Migration Tool</DialogTitle>
          <DialogDescription>
            Enter the project details to run a deployment key migration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="project-id" className="text-sm font-medium">
              Project ID *
            </Label>
            <Input
              id="project-id"
              placeholder="Enter project ID"
              value={formData.projectId}
              onChange={(e) => handleInputChange(e, "projectId")}
              disabled={isLoading}
              className="mt-1"
            />
          </div>

          <div>
            <Label
              htmlFor="semantic-identifier"
              className="text-sm font-medium"
            >
              Semantic Identifier *
            </Label>
            <Input
              id="semantic-identifier"
              placeholder="Enter semantic identifier"
              value={formData.semanticIdentifier}
              onChange={(e) => handleInputChange(e, "semanticIdentifier")}
              disabled={isLoading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="sandbox-id" className="text-sm font-medium">
              Sandbox ID *
            </Label>
            <Input
              id="sandbox-id"
              placeholder="Enter sandbox ID"
              value={formData.sandboxId}
              onChange={(e) => handleInputChange(e, "sandboxId")}
              disabled={isLoading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="convex-url" className="text-sm font-medium">
              Convex URL
            </Label>
            <Input
              id="convex-url"
              placeholder="https://your-deployment.convex.cloud (optional)"
              value={formData.convexUrl}
              onChange={(e) => handleInputChange(e, "convexUrl")}
              disabled={isLoading}
              className="mt-1"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Migrating..." : "Run Migration"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
