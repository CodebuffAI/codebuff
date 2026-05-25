"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Loader2 } from "lucide-react";

type RolloutStrategy =
  | "disabled"
  | "god_only"
  | "beta"
  | "percentage"
  | "enabled";

const strategyLabels: Record<RolloutStrategy, string> = {
  disabled: "Disabled",
  god_only: "God Only",
  beta: "God + Beta Users",
  percentage: "Percentage Rollout",
  enabled: "Enabled for All",
};

const strategyDescriptions: Record<RolloutStrategy, string> = {
  disabled: "Feature is off for everyone",
  god_only: "Only users with god role can access",
  beta: "God role and users marked as beta testers",
  percentage: "God + Beta + X% of other users (deterministic)",
  enabled: "Feature is on for everyone",
};

export function FeatureFlagsManager() {
  const flags = useQuery(api.featureFlags.getAllFlags);
  const setFlag = useMutation(api.featureFlags.setFlag);

  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagStrategy, setNewFlagStrategy] =
    useState<RolloutStrategy>("disabled");
  const [newFlagPercentage, setNewFlagPercentage] = useState(10);
  const [newFlagDescription, setNewFlagDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateFlag = async (
    key: string,
    strategy: RolloutStrategy,
    percentage?: number,
    description?: string,
  ) => {
    try {
      setIsSaving(true);
      await setFlag({
        key,
        rollout_strategy: strategy,
        rollout_percentage: strategy === "percentage" ? percentage : undefined,
        description,
      });
    } catch (error) {
      console.error("Error updating flag:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFlag = async () => {
    if (!newFlagKey.trim()) {
      alert("Please enter a flag key");
      return;
    }

    try {
      setIsSaving(true);
      await setFlag({
        key: newFlagKey.trim(),
        rollout_strategy: newFlagStrategy,
        rollout_percentage:
          newFlagStrategy === "percentage" ? newFlagPercentage : undefined,
        description: newFlagDescription.trim() || undefined,
      });
      // Reset form
      setNewFlagKey("");
      setNewFlagStrategy("disabled");
      setNewFlagPercentage(10);
      setNewFlagDescription("");
    } catch (error) {
      console.error("Error creating flag:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (flags === undefined) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create New Flag */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Feature Flag</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-flag-key">Flag Key</Label>
              <Input
                id="new-flag-key"
                value={newFlagKey}
                onChange={(e) => setNewFlagKey(e.target.value)}
                placeholder="e.g., new_feature_enabled"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-flag-strategy">Rollout Strategy</Label>
              <Select
                value={newFlagStrategy}
                onValueChange={(value) =>
                  setNewFlagStrategy(value as RolloutStrategy)
                }
              >
                <SelectTrigger id="new-flag-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(strategyLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {newFlagStrategy === "percentage" && (
            <div className="space-y-2">
              <Label>Rollout Percentage: {newFlagPercentage}%</Label>
              <Slider
                value={[newFlagPercentage]}
                onValueChange={([value]) => setNewFlagPercentage(value)}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                {strategyDescriptions[newFlagStrategy]}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-flag-description">Description (optional)</Label>
            <Input
              id="new-flag-description"
              value={newFlagDescription}
              onChange={(e) => setNewFlagDescription(e.target.value)}
              placeholder="What does this flag control?"
            />
          </div>

          <Button onClick={handleCreateFlag} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Flag"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Flags */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Feature Flags ({flags.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <p className="text-muted-foreground">
              No feature flags configured yet.
            </p>
          ) : (
            <div className="space-y-4">
              {flags.map((flag) => (
                <FlagRow
                  key={flag._id}
                  flag={flag}
                  onUpdate={handleUpdateFlag}
                  isSaving={isSaving}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface FlagRowProps {
  flag: {
    _id: string;
    key: string;
    rollout_strategy: RolloutStrategy;
    rollout_percentage?: number;
    description?: string;
  };
  onUpdate: (
    key: string,
    strategy: RolloutStrategy,
    percentage?: number,
    description?: string,
  ) => Promise<void>;
  isSaving: boolean;
}

function FlagRow({ flag, onUpdate, isSaving }: FlagRowProps) {
  const [strategy, setStrategy] = useState<RolloutStrategy>(
    flag.rollout_strategy,
  );
  const [percentage, setPercentage] = useState(flag.rollout_percentage || 10);
  const [description, setDescription] = useState(flag.description || "");
  const [isEditing, setIsEditing] = useState(false);

  const hasChanges =
    strategy !== flag.rollout_strategy ||
    (strategy === "percentage" && percentage !== flag.rollout_percentage) ||
    description !== (flag.description || "");

  const handleSave = async () => {
    await onUpdate(flag.key, strategy, percentage, description);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setStrategy(flag.rollout_strategy);
    setPercentage(flag.rollout_percentage || 10);
    setDescription(flag.description || "");
    setIsEditing(false);
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-mono font-semibold">{flag.key}</h3>
          {flag.description && !isEditing && (
            <p className="text-sm text-muted-foreground">{flag.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this flag control?"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Rollout Strategy</Label>
        <Select
          value={strategy}
          onValueChange={(value) => {
            setStrategy(value as RolloutStrategy);
            if (!isEditing) setIsEditing(true);
          }}
          disabled={isSaving}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(strategyLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {strategyDescriptions[strategy]}
        </p>
      </div>

      {strategy === "percentage" && (
        <div className="space-y-2">
          <Label>Rollout Percentage: {percentage}%</Label>
          <Slider
            value={[percentage]}
            onValueChange={([value]) => {
              setPercentage(value);
              if (!isEditing) setIsEditing(true);
            }}
            min={0}
            max={100}
            step={5}
            className="w-full"
            disabled={isSaving}
          />
        </div>
      )}

      {isEditing && hasChanges && (
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            size="sm"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
