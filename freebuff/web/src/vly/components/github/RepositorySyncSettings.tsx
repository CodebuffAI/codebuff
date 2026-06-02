"use client";

import { useState, useEffect } from "react";
import { Button } from "@/vly/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/vly/components/ui/select";
import { Badge } from "@/vly/components/ui/badge";
import { Label } from "@/vly/components/ui/label";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/vly/hooks/use-toast";
import {
  Github,
  RefreshCw,
  Settings,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader,
  Search,
  Zap,
} from "lucide-react";

interface RepositorySyncSettingsProps {
  projectId: Id<"project">;
}

export function RepositorySyncSettings({
  projectId,
}: RepositorySyncSettingsProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [repositories, setRepositories] = useState<any[]>([]);
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);

  const { toast } = useToast();

  const syncStatus = useQuery(api.github.repositories.getProjectSyncStatus, {
    projectId,
  });
  const githubConnection = useQuery(
    api.github.auth.connections.getGitHubConnection,
  );
  const listRepositories = useAction(
    api.github.repositories.listUserRepositories,
  );
  const setupSync = useMutation(api.github.repositories.setupProjectSync);
  const removeSync = useMutation(api.github.repositories.removeProjectSync);

  // Load repositories when GitHub connection is available
  const loadRepositories = async () => {
    if (!githubConnection) return;

    setIsLoadingRepositories(true);
    try {
      const repos = await listRepositories({});
      setRepositories(repos);
    } catch (error) {
      console.error("Failed to load repositories:", error);
      toast({
        title: "Error",
        description: "Failed to load repositories",
        variant: "destructive",
      });
    } finally {
      setIsLoadingRepositories(false);
    }
  };

  // Load repositories when GitHub connection is available
  useEffect(() => {
    if (
      githubConnection &&
      repositories.length === 0 &&
      !isLoadingRepositories
    ) {
      loadRepositories();
    }
  }, [githubConnection]);

  const handleSetupSync = async () => {
    if (!selectedRepository) {
      toast({
        title: "Error",
        description: "Please select a repository",
        variant: "destructive",
      });
      return;
    }

    const [repoOwner, repoName] = selectedRepository.split("/");

    setIsSettingUp(true);
    try {
      const result = await setupSync({
        projectId,
        repoOwner,
        repoName,
        syncDirection: "bidirectional",
      });

      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
        setSelectedRepository("");
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to setup sync",
        variant: "destructive",
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleRemoveSync = async () => {
    try {
      const result = await removeSync({ projectId });
      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to remove sync",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "synced":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "pending":
        return <Loader className="h-4 w-4 animate-spin text-yellow-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "conflict":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <XCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "synced":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "error":
        return "bg-red-100 text-red-800";
      case "conflict":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Github className="h-5 w-5" />
          GitHub Sync Settings
        </CardTitle>
        <CardDescription>
          Configure GitHub repository synchronization for this project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Beta Notice */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <Zap className="h-3 w-3 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-blue-900">
                Free During Beta
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                GitHub Sync is currently free while in beta. This will become a
                paid feature in the future.
              </p>
            </div>
          </div>
        </div>

        {syncStatus ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Sync Status</span>
              <Badge className={getStatusColor(syncStatus.sync_status)}>
                {getStatusIcon(syncStatus.sync_status)}
                <span className="ml-1 capitalize">
                  {syncStatus.sync_status}
                </span>
              </Badge>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Repository:</span>
                <span className="font-mono">
                  {syncStatus.repo_owner}/{syncStatus.repo_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Direction:</span>
                <span>Bidirectional</span>
              </div>
              <div className="flex justify-between">
                <span>Last Sync:</span>
                <span>
                  {new Date(syncStatus.last_sync_time).toLocaleString()}
                </span>
              </div>
              {syncStatus.error_message && (
                <div className="text-xs text-red-600">
                  Error: {syncStatus.error_message}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // TODO: Implement manual sync
                  toast({
                    title: "Info",
                    description: "Manual sync feature coming soon",
                  });
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(
                    `https://github.com/${syncStatus.repo_owner}/${syncStatus.repo_name}`,
                    "_blank",
                  );
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on GitHub
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveSync}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Remove Sync
              </Button>
            </div>
          </div>
        ) : githubConnection === undefined ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="mr-2 h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Checking GitHub connection...
            </span>
          </div>
        ) : !githubConnection ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">
                  GitHub Account Not Connected
                </span>
              </div>
              <p className="mt-2 text-sm text-orange-700">
                You need to connect your GitHub account before you can set up
                repository synchronization.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              No GitHub sync configured for this project. Set up sync to keep
              your project in sync with a GitHub repository.
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repository-select">Select Repository</Label>
                {isLoadingRepositories ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      Loading repositories...
                    </span>
                  </div>
                ) : repositories.length > 0 ? (
                  <Select
                    value={selectedRepository}
                    onValueChange={setSelectedRepository}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a repository..." />
                    </SelectTrigger>
                    <SelectContent>
                      {repositories.map((repo) => (
                        <SelectItem key={repo.full_name} value={repo.full_name}>
                          <div className="flex w-full items-center justify-between">
                            <span className="font-mono">{repo.full_name}</span>
                            <Badge
                              variant={repo.private ? "secondary" : "outline"}
                              className="ml-2 text-xs"
                            >
                              {repo.private ? "Private" : "Public"}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">
                        No repositories found
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Make sure you have repositories in your GitHub account.
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={handleSetupSync}
                disabled={isSettingUp || !selectedRepository}
                className="w-full"
              >
                {isSettingUp ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Setting up sync...
                  </>
                ) : (
                  <>
                    <Settings className="mr-2 h-4 w-4" />
                    Setup GitHub Sync
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
