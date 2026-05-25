"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { Eye, EyeOff, Key, Loader, Pencil, Plus, Trash2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { toast } from "sonner";

interface EnvVars {
  frontend: Record<string, string>;
  backend: Record<string, string>;
}

interface EnvVarsDialogProps {
  identifier: string;
  buttonClassName?: string;
  buttonVariant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  buttonSize?: "default" | "sm" | "lg" | "icon";
  showTextLabel?: boolean;
}

const PROTECTED_KEYS = ["JWKS", "JWT_PRIVATE_KEY"];

const filterProtectedKeys = (envVars: EnvVars, isGodMode: boolean): EnvVars => {
  if (isGodMode) return envVars;
  return {
    frontend: Object.fromEntries(
      Object.entries(envVars.frontend).filter(
        ([key]) => !PROTECTED_KEYS.includes(key),
      ),
    ),
    backend: Object.fromEntries(
      Object.entries(envVars.backend).filter(
        ([key]) => !PROTECTED_KEYS.includes(key),
      ),
    ),
  };
};

const EnvVarRow = memo(function EnvVarRow({
  varKey,
  value,
  onEdit,
  onDelete,
  isSaving,
}: {
  varKey: string;
  value: string;
  onEdit: () => void;
  onDelete: () => void;
  isSaving: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex w-full items-start gap-2 rounded-md border px-3 py-2">
      <span className="shrink-0 pt-0.5 font-mono text-sm font-medium">
        {varKey}
      </span>
      <span
        className={`min-w-0 flex-1 font-mono text-sm text-muted-foreground ${
          revealed ? "whitespace-pre-wrap break-all" : "truncate"
        }`}
      >
        {revealed ? value : "••••••••"}
      </span>
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setRevealed(!revealed)}
          disabled={isSaving}
        >
          {revealed ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
          disabled={isSaving}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={isSaving}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});

const DialogEnvVarList = memo(function DialogEnvVarList({
  vars,
  onEdit,
  onDelete,
  onAdd,
  isSaving,
}: {
  vars: Record<string, string>;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
  onAdd: () => void;
  isSaving: boolean;
}) {
  const entries = Object.entries(vars);
  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-2">
        {entries.length === 0 && (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No variables set
          </div>
        )}
        {entries.map(([key, value]) => (
          <EnvVarRow
            key={key}
            varKey={key}
            value={value}
            onEdit={() => onEdit(key)}
            onDelete={() => onDelete(key)}
            isSaving={isSaving}
          />
        ))}
        <Button
          variant="outline"
          className="w-full"
          onClick={onAdd}
          disabled={isSaving}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Variable
        </Button>
      </div>
    </ScrollArea>
  );
});

interface EnvVarEditorProps {
  envVarKeys: string[];
  envVars: Record<string, string>;
  envVarDescriptions: Record<string, string>;
  onChange: (key: string, value: string) => void;
  isSaving?: boolean;
  onSave: () => void;
}

export function EnvVarEditor({
  envVarKeys,
  envVars,
  envVarDescriptions,
  onChange,
  isSaving = false,
  onSave,
}: EnvVarEditorProps) {
  return (
    <div className="space-y-4">
      {envVarKeys.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No API keys required for this integration.
        </div>
      ) : (
        envVarKeys.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-1 border-0 bg-transparent p-0"
          >
            <div className="flex w-full items-center gap-2">
              <span className="min-w-[120px] rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
                {key}
              </span>
              <input
                className="flex-1 rounded border bg-background px-2 py-1 font-mono text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={envVars[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder="Variable value"
                style={{ minWidth: 0 }}
              />
            </div>
            {envVarDescriptions[key] && (
              <span className="text-white-500 mb-1 pl-[2px] text-sm">
                {envVarDescriptions[key]}
              </span>
            )}
          </div>
        ))
      )}
      <div className="mt-4 flex justify-start gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={isSaving || envVarKeys.length === 0}
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export function EnvVarsDialog({
  identifier,
  buttonClassName = "",
  buttonVariant = "outline",
  buttonSize = "default",
  showTextLabel = true,
}: EnvVarsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const getEnvVars = useAction(api.codesandbox.envVars.getEnvVars);
  const updateEnvVars = useAction(api.codesandbox.envVars.setEnvVars);
  const removeEnvVar = useAction(api.codesandbox.envVars.deleteEnvVar);
  const currentUser = useQuery(api.users.viewer);
  const isGodMode = currentUser?.role === "god";
  const [envVars, setCurrentEnvVars] = useState<EnvVars>({
    frontend: {},
    backend: {},
  });
  const [activeTab, setActiveTab] = useState<"frontend" | "backend">(
    "frontend",
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [editingType, setEditingType] = useState<"frontend" | "backend">(
    "frontend",
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState("");
  const [deletingType, setDeletingType] = useState<"frontend" | "backend">(
    "frontend",
  );

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getEnvVars({ semanticIdentifier: identifier })
        .then((vars) => {
          setCurrentEnvVars(filterProtectedKeys(vars, isGodMode));
        })
        .finally(() => setIsLoading(false));
    }
  }, [identifier, isOpen, isGodMode, getEnvVars]);

  const handleAdd = async () => {
    const trimmedKey = newKey.trim();
    if (!trimmedKey) return;
    if (envVars[activeTab][trimmedKey] !== undefined) {
      toast.error(`Variable "${trimmedKey}" already exists. Use edit instead.`);
      return;
    }
    setIsSaving(true);
    try {
      await updateEnvVars({
        semanticIdentifier: identifier,
        envVars: {
          frontend: activeTab === "frontend" ? { [trimmedKey]: newValue } : {},
          backend: activeTab === "backend" ? { [trimmedKey]: newValue } : {},
        },
      });
      setCurrentEnvVars({
        ...envVars,
        [activeTab]: { ...envVars[activeTab], [trimmedKey]: newValue },
      });
      toast.success(`Added ${trimmedKey}`);
      setAddDialogOpen(false);
      setNewKey("");
      setNewValue("");
    } catch (error) {
      toast.error(
        `Failed to add variable: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async () => {
    setIsSaving(true);
    try {
      await updateEnvVars({
        semanticIdentifier: identifier,
        envVars: {
          frontend:
            editingType === "frontend" ? { [editingKey]: editingValue } : {},
          backend:
            editingType === "backend" ? { [editingKey]: editingValue } : {},
        },
      });
      setCurrentEnvVars({
        ...envVars,
        [editingType]: { ...envVars[editingType], [editingKey]: editingValue },
      });
      toast.success(`Updated ${editingKey}`);
      setEditDialogOpen(false);
    } catch (error) {
      toast.error(
        `Failed to update variable: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const keyToDelete = deletingKey;
    const type = deletingType;
    setIsSaving(true);
    try {
      await removeEnvVar({
        semanticIdentifier: identifier,
        key: keyToDelete,
        type,
      });
      const newTypeVars = { ...envVars[type] };
      delete newTypeVars[keyToDelete];
      setCurrentEnvVars({ ...envVars, [type]: newTypeVars });
      toast.success(`Deleted ${keyToDelete}`);
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(
        `Failed to delete variable: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openAdd = () => {
    setNewKey("");
    setNewValue("");
    setAddDialogOpen(true);
  };

  const openEdit = (key: string) => {
    setEditingKey(key);
    setEditingValue(envVars[activeTab][key]);
    setEditingType(activeTab);
    setEditDialogOpen(true);
  };

  const openDelete = (key: string) => {
    setDeletingKey(key);
    setDeletingType(activeTab);
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant={buttonVariant}
            size={buttonSize}
            className={buttonClassName}
          >
            <Key className="h-5 w-5 min-w-5" />
            <span
              className={`whitespace-nowrap text-xs text-muted-foreground transition-all duration-700 ${
                showTextLabel
                  ? "max-w-32 opacity-100"
                  : "max-w-0 overflow-hidden opacity-0"
              }`}
            >
              Keys
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Keys</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="flex h-[400px] items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader className="h-8 w-8 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Loading API keys…
                </p>
              </div>
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "frontend" | "backend")}
              className="w-full"
            >
              <TabsList className="w-full">
                <TabsTrigger value="frontend" className="flex-1">
                  Frontend
                </TabsTrigger>
                <TabsTrigger value="backend" className="flex-1">
                  Backend
                </TabsTrigger>
              </TabsList>
              <TabsContent value="frontend">
                <DialogEnvVarList
                  vars={envVars.frontend}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onAdd={openAdd}
                  isSaving={isSaving}
                />
              </TabsContent>
              <TabsContent value="backend">
                <DialogEnvVarList
                  vars={envVars.backend}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onAdd={openAdd}
                  isSaving={isSaving}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Variable Dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          if (!isSaving) setAddDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {activeTab === "frontend" ? "Frontend" : "Backend"} Variable
            </DialogTitle>
            <DialogDescription>
              Add a new environment variable. Values can be multiline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialog-add-env-key">Key</Label>
              <Input
                id="dialog-add-env-key"
                placeholder="VARIABLE_NAME"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog-add-env-value">Value</Label>
              <Textarea
                id="dialog-add-env-value"
                placeholder="Variable value…"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={isSaving || !newKey.trim()}>
              {isSaving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Variable Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!isSaving) setEditDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Variable</DialogTitle>
            <DialogDescription>
              Update the value for this environment variable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Key</Label>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {editingKey}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog-edit-env-value">Value</Label>
              <Textarea
                id="dialog-edit-env-value"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isSaving}>
              {isSaving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isSaving) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variable</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-mono font-semibold">{deletingKey}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSaving}
            >
              {isSaving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
