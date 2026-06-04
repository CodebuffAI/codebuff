"use client";

import { memo, useEffect, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Textarea } from "@/vly/components/ui/textarea";
import { Label } from "@/vly/components/ui/label";
import { ScrollArea } from "@/vly/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/vly/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import { Eye, EyeOff, Loader, Pencil, Plus, Trash2 } from "lucide-react";
import { FunctionReturnType } from "convex/server";
import { toast } from "sonner";

interface EnvVars {
  frontend: Record<string, string>;
  backend: Record<string, string>;
}

interface EnvVarsViewProps {
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>;
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

const EnvVarListView = memo(function EnvVarListView({
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
    <ScrollArea className="h-full">
      <div className="space-y-2 p-4">
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

function EnvVarsView({ project }: EnvVarsViewProps) {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const getEnvVars = useAction(api.codesandbox.envVars.getEnvVars);
  const updateEnvVars = useAction(api.codesandbox.envVars.setEnvVars);
  const removeEnvVar = useAction(api.codesandbox.envVars.deleteEnvVar);
  const currentUser = useQuery(api.users.viewer);
  const isGodMode = currentUser?.role === "god";

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [envVars, setCurrentEnvVars] = useState<EnvVars>({
    frontend: {},
    backend: {},
  });
  const [activeTab, setActiveTab] = useState<"frontend" | "backend">("backend");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [editingType, setEditingType] = useState<"frontend" | "backend">(
    "backend",
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState("");
  const [deletingType, setDeletingType] = useState<"frontend" | "backend">(
    "backend",
  );

  useEffect(() => {
    if (project && isAuthenticated && currentUser !== undefined) {
      setIsLoading(true);
      getEnvVars({ semanticIdentifier: project.semantic_identifier })
        .then((vars) => setCurrentEnvVars(filterProtectedKeys(vars, isGodMode)))
        .finally(() => setIsLoading(false));
    }
  }, [project, getEnvVars, isAuthenticated, currentUser, isGodMode]);

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
        semanticIdentifier: project.semantic_identifier,
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
        semanticIdentifier: project.semantic_identifier,
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
        semanticIdentifier: project.semantic_identifier,
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

  if (isAuthLoading || isLoading || currentUser === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="flex h-full w-full flex-col p-4">
          <div className="flex w-full flex-col items-center gap-4">
            <div className="relative">
              <Loader className="h-6 w-6 animate-spin" />
            </div>
            <p>Loading API Keys...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col p-4">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "frontend" | "backend")}
        className="flex-grow"
      >
        <TabsList className="w-full">
          <TabsTrigger value="frontend">Frontend</TabsTrigger>
          <TabsTrigger value="backend">Backend</TabsTrigger>
        </TabsList>
        <TabsContent value="frontend" className="h-[calc(100%-40px)]">
          <EnvVarListView
            vars={envVars.frontend}
            onEdit={openEdit}
            onDelete={openDelete}
            onAdd={openAdd}
            isSaving={isSaving}
          />
        </TabsContent>
        <TabsContent value="backend" className="h-[calc(100%-40px)]">
          <EnvVarListView
            vars={envVars.backend}
            onEdit={openEdit}
            onDelete={openDelete}
            onAdd={openAdd}
            isSaving={isSaving}
          />
        </TabsContent>
      </Tabs>

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
              <Label htmlFor="add-env-key">Key</Label>
              <Input
                id="add-env-key"
                placeholder="VARIABLE_NAME"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-env-value">Value</Label>
              <Textarea
                id="add-env-value"
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
              <Label htmlFor="edit-env-value">Value</Label>
              <Textarea
                id="edit-env-value"
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
    </div>
  );
}

export default EnvVarsView;
