"use client";

import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/vly/components/ui/dropdown-menu";
import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRepositoryValidation } from "@/vly/hooks/use-repository-validation";
import { useToast } from "@/vly/hooks/use-toast";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { getFormattedPriceWithPeriod } from "@/vly/autumn/helpers";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  FileDown,
  GitBranch,
  Github,
  Loader,
  Lock,
  LogOut,
  Pause,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Terminal,
  XCircle,
  Zap,
  Copy,
} from "lucide-react";
import { useEffect, useState } from "react";
import DivergenceResolutionDialog from "./DivergenceResolutionDialog";
import { useFeatureAccess } from "@/vly/hooks/useFeatureAccess";
import { FeatureGate, UpgradePrompt } from "@/vly/components/billing/FeatureGate";

interface GitHubSyncViewProps {
  projectId: Id<"project">;
}

export default function GitHubSyncView({ projectId }: GitHubSyncViewProps) {
  const [repositoryName, setRepositoryName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showDivergenceDialog, setShowDivergenceDialog] = useState(false);
  const [divergenceInfo, setDivergenceInfo] = useState<any>(null);
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [availableBackups] = useState<any>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [showRemoveConfirmDialog, setShowRemoveConfirmDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const user = useSignedInUser();

  // Check if user has GitHub integration feature access
  // This respects the billing_enforcement flag - when disabled, all users have access
  const { hasAccess: hasGitHubAccess } = useFeatureAccess("github_integration");

  // Import environment export actions
  const generateFrontendEnvFile = useAction(
    api.github.envExport.generateFrontendEnvFile,
  );
  const generateBackendEnvScript = useAction(
    api.github.envExport.generateBackendEnvScript,
  );
  const generateSetupScript = useAction(
    api.github.envExport.generateSetupScript,
  );
  const generateBackendEnvCommands = useAction(
    api.github.envExport.generateBackendEnvCommands,
  );

  // Convert project name to valid repository name
  const getValidRepoName = (name: string | undefined) => {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/\s+/g, "-") // Replace spaces with dashes
      .replace(/[^a-z0-9-]/g, "") // Remove invalid characters
      .replace(/-+/g, "-") // Replace multiple dashes with single dash
      .replace(/^-|-$/g, ""); // Remove leading/trailing dashes
  };

  const githubConnection = useQuery(
    api.github.auth.connections.getGitHubConnection,
  );
  const githubConnectionStatus = useQuery(
    api.github.auth.connections.getGitHubConnectionStatus,
  );
  const syncStatus = useQuery(api.github.repositories.getProjectSyncStatus, {
    projectId,
  });

  // Note: Sync status toasts are handled in LeftSidebar to ensure they show across all views
  const project = useQuery(api.project.getProjectById, { projectId });

  // Set repository name when project data loads
  useEffect(() => {
    if (project?.name && !repositoryName) {
      setRepositoryName(getValidRepoName(project.name));
    }
  }, [project?.name, repositoryName]);

  const createRepository = useAction(api.github.repositories.createRepository);
  const setupSync = useMutation(api.github.repositories.setupProjectSync);
  const removeSync = useMutation(api.github.repositories.removeProjectSync);
  const initiateAuth = useAction(api.github.auth.oauth.initiateGitHubAuth);
  const disconnectGitHub = useMutation(
    api.github.auth.connections.disconnectGitHub,
  );
  const triggerManualSync = useAction(api.github.manualSync.triggerManualSync);

  // Repository name validation
  const validation = useRepositoryValidation(repositoryName, 500);

  const getConflictInfo = useAction(api.github.sync.resolution.getConflictInfo);

  const rollbackToBackup = useAction(api.github.sync.rollback.rollbackToBackup);

  const handleCreateRepository = async () => {
    if (!repositoryName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a repository name",
        variant: "destructive",
      });
      return;
    }

    console.log("Starting repository creation process...");
    console.log("Repository name:", repositoryName);
    console.log("Project:", project);
    console.log("GitHub connection:", githubConnection);

    setIsCreating(true);
    try {
      console.log("Calling createRepository mutation...");
      // Create the repository
      const repoResult = await createRepository({
        name: repositoryName,
        description: `Freebuff project: ${project?.name || "Untitled Project"}`,
        private: true,
      });

      console.log("Repository creation result:", repoResult);

      if (repoResult.success) {
        console.log("Repository created successfully, setting up sync...");
        // Set up sync with the new repository
        const syncResult = await setupSync({
          projectId,
          repoOwner: repoResult.owner,
          repoName: repositoryName,
          syncDirection: "bidirectional",
        });

        console.log("Sync setup result:", syncResult);

        if (syncResult.success) {
          toast({
            title: "Success",
            description: "Repository created and sync configured successfully!",
          });
          setRepositoryName("");
        } else {
          toast({
            title: "Error",
            description: syncResult.message,
            variant: "destructive",
          });
        }
      } else {
        console.error("Repository creation failed:", repoResult.message);
        toast({
          title: "Error",
          description: repoResult.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create repository",
          variant: "destructive",
        });
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleManualSync = async (
    syncDirection?: "github_to_project" | "project_to_github",
  ) => {
    alert("Manual sync triggered");
    setIsSyncing(true);
    try {
      const result = await triggerManualSync({
        projectId,
        syncDirection,
      });

      console.log("Manual sync result:", result);

      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
      } else {
        toast({
          title: "Error",
          description: result.message || "Sync failed",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Manual sync error:", err);
      toast({
        title: "Error",
        description: "Failed to trigger manual sync",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemoveSync = async () => {
    setShowRemoveConfirmDialog(false);
    try {
      const result = await removeSync({ projectId });
      if (result.success) {
        toast({
          title: "Success",
          description: "GitHub sync removed successfully",
        });
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove sync",
        variant: "destructive",
      });
    }
  };

  const handleConnectGitHub = async () => {
    console.log("handleConnectGitHub called");
    setIsConnecting(true);
    try {
      console.log("Initiating GitHub auth...");
      // Get the current project URL and preserve existing parameters
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("view", "github");
      const returnUrl = currentUrl.toString();

      console.log("Return URL:", returnUrl);
      const authUrl = await initiateAuth({ returnUrl });
      console.log("Auth URL:", authUrl);
      window.location.href = authUrl;
    } catch (error) {
      console.error("Error in handleConnectGitHub:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to initiate GitHub connection",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    setIsDisconnecting(true);
    try {
      const result = await disconnectGitHub({});
      if (result.success) {
        toast({
          title: "Success",
          description: "GitHub account disconnected successfully",
        });
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error disconnecting GitHub:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect GitHub account",
        variant: "destructive",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleResolveConflicts = async () => {
    console.log("handleResolveConflicts called");
    setIsLoadingConflicts(true);
    try {
      const result = await getConflictInfo({ projectId });
      console.log("getConflictInfo result:", result);

      if (result.hasConflicts) {
        if (result.conflictType === "divergence") {
          // Repository divergence - show divergence resolution dialog
          console.log("Showing divergence dialog for repository divergence");
          console.log(
            "Real divergence data:",
            result.conflictDetails?.divergence,
          );

          // Use real divergence data from the backend
          const realDivergence = result.conflictDetails?.divergence;

          if (realDivergence) {
            const divergenceInfo = {
              isDivergent: realDivergence.isDivergent,
              localCommits: realDivergence.ahead,
              remoteCommits: realDivergence.behind,
              divergenceType: realDivergence.status,
              canFastForward: realDivergence.canFastForward,
            };
            setDivergenceInfo(divergenceInfo);
            setShowDivergenceDialog(true);
          } else {
            // If we can't get divergence details, show a generic error
            toast({
              title: "Error",
              description:
                "Unable to get repository divergence details. Please try again.",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Error",
            description: `Unknown conflict type detected: ${result.conflictType}`,
            variant: "destructive",
          });
        }
      } else {
        if (result.conflictType === "none") {
          // Conflicts were automatically resolved
          toast({
            title: "Success",
            description: "No conflicts found - sync status has been updated",
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to get conflict details",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Failed to get conflict details:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      toast({
        title: "Error",
        description: "Failed to get conflict details",
        variant: "destructive",
      });
    } finally {
      setIsLoadingConflicts(false);
    }
  };

  const handleConflictsResolved = () => {
    // Refresh the page or refetch sync status to show updated state
    window.location.reload();
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
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
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
    <FeatureGate
      featureId="github_integration"
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="w-full max-w-2xl">
            <UpgradePrompt
              featureId="github_integration"
              title="Unlock GitHub Integration with Business Plan"
              message={`GitHub sync is available on Business plan or higher. Upgrade to Business plan (${getFormattedPriceWithPeriod("business")}) to create repositories and keep your projects in sync with GitHub.`}
            />
          </div>
        </div>
      }
    >
      <div className="space-y-6 px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">GitHub Sync</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a GitHub repository for your project and keep it in sync
          </p>
        </div>

        {/* GitHub Connection Status */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <Github className="h-5 w-5 text-muted-foreground" />
              GitHub App Installation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {githubConnectionStatus === undefined ? (
              <div className="flex items-center justify-center py-4">
                <Loader className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Checking GitHub App installation...
                </span>
              </div>
            ) : githubConnectionStatus?.status === "not_connected" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-orange-700">
                    GitHub App not installed
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowConsentDialog(true)}
                  disabled={isConnecting}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isConnecting ? (
                    <>
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    "Install GitHub App"
                  )}
                </Button>
              </div>
            ) : githubConnectionStatus?.status === "user_identified" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-foreground">
                    GitHub account identified:{" "}
                    <span className="text-primary">
                      @{githubConnectionStatus.github_username}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">
                    GitHub App installation required
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowConsentDialog(true)}
                    disabled={isConnecting}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isConnecting ? (
                      <>
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                        Installing...
                      </>
                    ) : (
                      "Install GitHub App"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnectGitHub}
                    disabled={isDisconnecting}
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      <>
                        <LogOut className="mr-2 h-4 w-4" />
                        Disconnect GitHub
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : githubConnectionStatus?.status === "app_installed" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-foreground">
                    GitHub App installed for{" "}
                    <span className="text-primary">
                      @{githubConnectionStatus.github_username}
                    </span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnectGitHub}
                    disabled={isDisconnecting}
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                        Uninstalling...
                      </>
                    ) : (
                      <>
                        <LogOut className="mr-2 h-4 w-4" />
                        Uninstall GitHub App
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Create Repository - Show when connected but no sync */}
        {githubConnectionStatus?.status === "app_installed" && !syncStatus && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-card-foreground">
                Create GitHub Repository
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Create a new GitHub repository for your project and set up
                automatic synchronization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Form Section */}
              <div>
                <Label htmlFor="repository-name">Repository Name</Label>
                <div className="mt-2 space-y-1">
                  <div className="flex max-w-lg items-center gap-2">
                    <Input
                      id="repository-name"
                      placeholder={
                        project?.name
                          ? getValidRepoName(project.name)
                          : "my-crack-project"
                      }
                      value={repositoryName}
                      onChange={(e) => setRepositoryName(e.target.value)}
                      disabled={!hasGitHubAccess}
                      className={`flex-1 ${
                        validation.isValid === false
                          ? "border-red-500 focus:border-red-500"
                          : validation.isValid === true
                            ? "border-green-500 focus:border-green-500"
                            : ""
                      }`}
                    />
                    <Button
                      onClick={handleCreateRepository}
                      disabled={
                        !hasGitHubAccess ||
                        !repositoryName.trim() ||
                        isCreating ||
                        validation.isValidating ||
                        validation.isValid === false
                      }
                    >
                      {isCreating ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Settings className="mr-2 h-4 w-4" />
                          Create & Sync
                        </>
                      )}
                    </Button>
                  </div>
                  {/* Validation feedback */}
                  {repositoryName.trim() && (
                    <div className="flex items-center gap-1 text-xs">
                      {validation.isValidating ? (
                        <>
                          <Loader className="h-3 w-3 animate-spin text-blue-500" />
                          <span className="text-blue-600">
                            Checking availability...
                          </span>
                        </>
                      ) : validation.isValid === true ? (
                        <>
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span className="text-green-600">
                            {validation.message}
                          </span>
                        </>
                      ) : validation.isValid === false ? (
                        <>
                          <XCircle className="h-3 w-3 text-red-500" />
                          <span className="text-red-600">
                            {validation.message}
                          </span>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  This will create a private repository and set up bidirectional
                  sync
                </p>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* What happens next */}
                <div className="rounded-lg border bg-muted/30 p-6">
                  <div className="flex items-start gap-3">
                    <Settings className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                    <div>
                      <p className="mb-3 text-base font-medium text-foreground">
                        What happens next?
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Creates a new private GitHub repository</li>
                        <li>• Sets up webhooks for automatic sync</li>
                        <li>• Pushes your current project files to GitHub</li>
                        <li>• Enables bidirectional synchronization</li>
                        <li>• Keeps both platforms in sync automatically</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* FAQ */}
                <div className="rounded-lg border bg-muted/30 p-6">
                  <div className="flex items-start gap-3">
                    <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                    <div>
                      <p className="mb-3 text-base font-medium text-foreground">
                        Frequently Asked Questions
                      </p>
                      <div className="space-y-4 text-sm">
                        <div>
                          <p className="font-medium text-foreground">
                            Is my code private?
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Yes, all repositories are created as private by
                            default.
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            Can I disconnect later?
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Yes, you can remove the sync at any time. Your
                            GitHub repo will remain.
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            What gets synced?
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            All project files, changes, and updates in both
                            directions automatically.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Area */}
        {syncStatus && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Sync Status */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-card-foreground">
                  Sync Status
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Current synchronization status with GitHub
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Paused Notice - Show when feature is disabled */}
                {!hasGitHubAccess && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-start gap-2">
                      <Pause className="mt-0.5 h-4 w-4 text-orange-600" />
                      <div className="text-sm">
                        <p className="font-medium text-orange-800">
                          Sync Paused
                        </p>
                        <p className="mt-1 text-xs text-orange-700">
                          GitHub Sync is paused because it's not included in
                          your current plan. Upgrade to resume automatic
                          synchronization.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Status
                    </span>
                    {!hasGitHubAccess ? (
                      <Badge className="bg-orange-100 text-orange-800">
                        <Pause className="mr-1 h-4 w-4" />
                        Paused
                      </Badge>
                    ) : (
                      <Badge className={getStatusColor(syncStatus.sync_status)}>
                        {getStatusIcon(syncStatus.sync_status)}
                        <span className="ml-1 capitalize">
                          {syncStatus.sync_status}
                        </span>
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-foreground">
                      <span>Repository:</span>
                      <span className="font-mono text-muted-foreground">
                        {syncStatus.repo_owner}/{syncStatus.repo_name}
                      </span>
                    </div>
                    <div className="flex justify-between text-foreground">
                      <span>Last Sync:</span>
                      <span className="text-muted-foreground">
                        {new Date(syncStatus.last_sync_time).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Primary Action */}
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full"
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

                  {/* Manual Sync Button - Only for godmode users with feature access */}
                  {user?.role === "god" && hasGitHubAccess && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={isSyncing}
                        >
                          {isSyncing ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <GitBranch className="mr-2 h-4 w-4" />
                          )}
                          {isSyncing ? "Syncing..." : "Manual Sync"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-48">
                        <DropdownMenuItem
                          onClick={() => handleManualSync("github_to_project")}
                          disabled={isSyncing}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Pull from GitHub
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleManualSync("project_to_github")}
                          disabled={isSyncing}
                        >
                          <GitBranch className="mr-2 h-4 w-4" />
                          Push to GitHub
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {/* Destructive Action */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setShowRemoveConfirmDialog(true)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Remove Sync
                  </Button>
                </div>

                {/* Conflict Resolution Section */}
                {hasGitHubAccess &&
                  (syncStatus.sync_status === "conflict" ||
                    (syncStatus.sync_status === "error" &&
                      syncStatus.error_message?.includes(
                        "browser_default is not a constructor",
                      ))) && (
                    <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50/50 p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-orange-600" />
                        <div className="text-sm">
                          <p className="font-medium text-orange-800">
                            {syncStatus.error_message?.includes(
                              "browser_default is not a constructor",
                            )
                              ? "Repository Divergence Detected"
                              : "Merge Conflicts Detected"}
                          </p>
                          <p className="mt-1 text-xs text-orange-700">
                            {syncStatus.error_message?.includes(
                              "browser_default is not a constructor",
                            )
                              ? "The repository history has diverged. Choose how to resolve this conflict."
                              : syncStatus.error_message ||
                                "There are conflicts between your local changes and GitHub changes."}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-orange-200 text-orange-600 hover:bg-orange-100"
                              onClick={handleResolveConflicts}
                              disabled={isLoadingConflicts}
                            >
                              {isLoadingConflicts ? (
                                <>
                                  <Loader className="mr-2 h-3 w-3 animate-spin" />
                                  Loading...
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="mr-2 h-3 w-3" />
                                  Resolve Conflicts
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Show Available Backups */}
                {showBackups && availableBackups && (
                  <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
                    <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      Available Backups
                    </h4>

                    {availableBackups.githubBackups?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          GitHub Backup Branches:
                        </p>
                        {availableBackups.githubBackups.map((backup: any) => (
                          <div
                            key={backup.branch}
                            className="flex items-center justify-between rounded border bg-background p-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {backup.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Created: {backup.timestamp}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                setIsRollingBack(true);
                                try {
                                  const result = await rollbackToBackup({
                                    projectId,
                                    backupSource: "github",
                                    githubBranch: backup.branch,
                                  });
                                  if (result.success) {
                                    toast({
                                      title: "Success",
                                      description: result.message,
                                    });
                                    setShowBackups(false);
                                    // Refresh the page to show updated state
                                    window.location.reload();
                                  } else {
                                    toast({
                                      title: "Error",
                                      description: result.message,
                                      variant: "destructive",
                                    });
                                  }
                                } catch {
                                  toast({
                                    title: "Error",
                                    description: "Failed to rollback to backup",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setIsRollingBack(false);
                                }
                              }}
                              disabled={isRollingBack}
                            >
                              {isRollingBack ? (
                                <Loader className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                  Rollback
                                </>
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {availableBackups.localBackups?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Local Backups:
                        </p>
                        {availableBackups.localBackups.map((backup: any) => (
                          <div
                            key={backup.id}
                            className="flex items-center justify-between rounded border bg-background p-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {backup.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Created: {backup.timestamp}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                setIsRollingBack(true);
                                try {
                                  const result = await rollbackToBackup({
                                    projectId,
                                    backupSource: "local",
                                    backupId: backup.id,
                                  });
                                  if (result.success) {
                                    toast({
                                      title: "Success",
                                      description: result.message,
                                    });
                                    setShowBackups(false);
                                    // Refresh the page to show updated state
                                    window.location.reload();
                                  } else {
                                    toast({
                                      title: "Error",
                                      description: result.message,
                                      variant: "destructive",
                                    });
                                  }
                                } catch {
                                  toast({
                                    title: "Error",
                                    description: "Failed to rollback to backup",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setIsRollingBack(false);
                                }
                              }}
                              disabled={isRollingBack}
                            >
                              {isRollingBack ? (
                                <Loader className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                  Rollback
                                </>
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {(!availableBackups.githubBackups ||
                      availableBackups.githubBackups.length === 0) &&
                      (!availableBackups.localBackups ||
                        availableBackups.localBackups.length === 0) && (
                        <p className="text-sm text-muted-foreground">
                          No backups available
                        </p>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Developer Setup - Highlight for new syncs */}
            <Card
              className={`border-border bg-card ${syncStatus._creationTime && Date.now() - syncStatus._creationTime < 300000 ? "ring-2 ring-primary/50" : ""}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-card-foreground">
                      Developer Setup
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Download environment files and setup scripts for local
                      development
                    </CardDescription>
                  </div>
                  {syncStatus._creationTime &&
                    Date.now() - syncStatus._creationTime < 300000 && (
                      <Badge variant="default" className="animate-pulse">
                        New!
                      </Badge>
                    )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {syncStatus._creationTime &&
                  Date.now() - syncStatus._creationTime < 300000 && (
                    <div className="rounded-lg border-l-4 border-primary bg-primary/10 p-4">
                      <div className="flex items-start gap-2">
                        <Zap className="mt-0.5 h-5 w-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium">
                            Quick Start Guide
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Your repository is ready! Download these files to
                            set up your local development environment.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Get your project running locally by downloading the
                    necessary configuration files:
                  </p>

                  {/* Frontend Environment Variables */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={async () => {
                      try {
                        const result = await generateFrontendEnvFile({
                          semanticIdentifier:
                            project?.semantic_identifier || "",
                        });

                        // Create a blob and download
                        const blob = new Blob([result.content], {
                          type: "text/plain",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = result.fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        toast({
                          title: "Downloaded",
                          description:
                            "Frontend environment file (.env.local) downloaded successfully",
                        });
                      } catch (error) {
                        console.error(
                          "Error downloading frontend env file:",
                          error,
                        );
                        toast({
                          title: "Error",
                          description:
                            "Failed to download frontend environment file",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Download .env.local (Frontend)
                  </Button>

                  {/* Backend Environment Options */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Terminal className="mr-2 h-4 w-4" />
                        Backend Environment Setup
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            const result = await generateBackendEnvScript({
                              semanticIdentifier:
                                project?.semantic_identifier || "",
                            });

                            // Create a blob and download
                            const blob = new Blob([result.content], {
                              type: "text/plain",
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = result.fileName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);

                            toast({
                              title: "Downloaded",
                              description:
                                "Backend environment setup script downloaded successfully",
                            });
                          } catch (error) {
                            console.error(
                              "Error downloading backend env script:",
                              error,
                            );
                            toast({
                              title: "Error",
                              description:
                                "Failed to download backend environment script",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        Download Setup Script
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            const commands = await generateBackendEnvCommands({
                              semanticIdentifier:
                                project?.semantic_identifier || "",
                            });

                            // Copy to clipboard with fallback methods
                            try {
                              // Try the modern clipboard API first
                              await navigator.clipboard.writeText(commands);
                            } catch {
                              // Fallback: Create a temporary textarea
                              const textarea =
                                document.createElement("textarea");
                              textarea.value = commands;
                              textarea.style.position = "fixed";
                              textarea.style.left = "-999999px";
                              textarea.style.top = "-999999px";
                              document.body.appendChild(textarea);
                              textarea.focus();
                              textarea.select();

                              try {
                                const successful = document.execCommand("copy");
                                if (!successful) {
                                  throw new Error("Copy command failed");
                                }
                              } finally {
                                document.body.removeChild(textarea);
                              }
                            }

                            toast({
                              title: "Copied!",
                              description:
                                "Backend environment commands copied to clipboard",
                            });
                          } catch (error) {
                            console.error(
                              "Error copying backend env commands:",
                              error,
                            );
                            toast({
                              title: "Error",
                              description:
                                "Failed to copy to clipboard. Please try downloading the script instead.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Commands to Clipboard
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Complete Setup Script */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={async () => {
                      try {
                        const result = await generateSetupScript({
                          semanticIdentifier:
                            project?.semantic_identifier || "",
                        });

                        // Create a blob and download
                        const blob = new Blob([result.content], {
                          type: "text/plain",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = result.fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        toast({
                          title: "Downloaded",
                          description:
                            "Complete setup script downloaded successfully",
                        });
                      } catch (error) {
                        console.error("Error downloading setup script:", error);
                        toast({
                          title: "Error",
                          description: "Failed to download setup script",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Complete Setup Script
                  </Button>
                </div>

                {/* Instructions */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="mb-2 text-sm font-medium">
                    Quick Setup Instructions:
                  </h4>
                  <ol className="space-y-1 text-xs text-muted-foreground">
                    <li>1. Clone the repository from GitHub</li>
                    <li>2. Download all three files above</li>
                    <li>3. Place them in your project root</li>
                    <li>
                      4. Run:{" "}
                      <code className="rounded bg-muted px-1">
                        chmod +x setup.sh && ./setup.sh
                      </code>
                    </li>
                    <li>
                      5. Start developing with{" "}
                      <code className="rounded bg-muted px-1">pnpm dev</code>
                    </li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* Repository Info */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-card-foreground">
                  Repository Details
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Information about your connected GitHub repository
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Repository Info */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Owner</span>
                    <span className="text-sm font-medium text-foreground">
                      {syncStatus.repo_owner}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Repository
                    </span>
                    <span className="font-mono text-sm text-foreground">
                      {syncStatus.repo_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Sync Direction
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      <GitBranch className="mr-1 h-3 w-3" />
                      Bidirectional
                    </Badge>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="border-t pt-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        window.open(
                          `https://github.com/${syncStatus.repo_owner}/${syncStatus.repo_name}`,
                          "_blank",
                        );
                      }}
                    >
                      <ExternalLink className="mr-2 h-3 w-3" />
                      View Repository
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        window.open(
                          `https://github.com/${syncStatus.repo_owner}/${syncStatus.repo_name}/commits`,
                          "_blank",
                        );
                      }}
                    >
                      <Clock className="mr-2 h-3 w-3" />
                      View Commits
                    </Button>
                  </div>
                </div>

                {/* Integration Status */}
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      <span className="text-xs font-medium">
                        Webhooks Active
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      <span className="text-xs font-medium">
                        Auto Deployments
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Consent Dialog */}
        <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Shield className="h-5 w-5 text-primary" />
                {githubConnectionStatus?.status === "user_identified"
                  ? "Install GitHub App"
                  : "Connect GitHub Account"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {githubConnectionStatus?.status === "user_identified"
                  ? "Install the Freebuff Web GitHub App to enable repository creation and sync."
                  : "Connect your GitHub account to enable repository creation and sync."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="space-y-3">
                  {githubConnectionStatus?.status === "user_identified" ? (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="mt-0.5 h-4 w-4 text-green-600" />
                        <div className="text-sm">
                          <p className="font-medium text-green-800">
                            Account Identified:
                          </p>
                          <p className="mt-1 text-xs text-primary">
                            @{githubConnectionStatus.github_username}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Zap className="mt-0.5 h-4 w-4 text-blue-600" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-800">
                            Next Step:
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-blue-700">
                            <li>• Install GitHub App</li>
                            <li>• Grant repository permissions</li>
                            <li>• Enable automatic sync</li>
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <Zap className="mt-0.5 h-4 w-4 text-green-600" />
                        <div className="text-sm">
                          <p className="font-medium text-green-800">
                            What you'll get:
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-green-700">
                            <li>• Create repositories from Freebuff Web</li>
                            <li>• Automatic bidirectional sync</li>
                            <li>• Real-time updates</li>
                            <li>• Full GitHub integration</li>
                          </ul>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex items-start gap-2">
                    <Lock className="mt-0.5 h-4 w-4 text-blue-600" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-800">
                        Security & Privacy:
                      </p>
                      <ul className="mt-1 space-y-1 text-xs text-blue-700">
                        <li>• Read/write access to repositories</li>
                        <li>• No access to private code</li>
                        <li>• Revocable at any time</li>
                        <li>• Secure token storage</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConsentDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowConsentDialog(false);
                  handleConnectGitHub();
                }}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    {githubConnectionStatus?.status === "user_identified"
                      ? "Installing..."
                      : "Connecting..."}
                  </>
                ) : (
                  <>
                    <Github className="mr-2 h-4 w-4" />
                    {githubConnectionStatus?.status === "user_identified"
                      ? "Install GitHub App"
                      : "Connect GitHub"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Divergence Resolution Dialog */}
        <DivergenceResolutionDialog
          projectId={projectId}
          isOpen={showDivergenceDialog}
          onClose={() => setShowDivergenceDialog(false)}
          divergenceInfo={divergenceInfo}
          onResolved={handleConflictsResolved}
        />

        {/* Remove Sync Confirmation Dialog */}
        <Dialog
          open={showRemoveConfirmDialog}
          onOpenChange={setShowRemoveConfirmDialog}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Remove GitHub Sync?
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                This will disconnect your project from the GitHub repository.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-orange-600" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-800">
                      Important Notice
                    </p>
                    <p className="mt-1 text-xs text-orange-700">
                      If you re-enable GitHub sync later, you'll need to create
                      a new repository. The current repository connection and
                      sync history will be permanently lost.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>This action will:</p>
                <ul className="mt-1 space-y-1 text-xs">
                  <li>• Remove the sync connection to GitHub</li>
                  <li>• Stop automatic synchronization</li>
                  <li>• Preserve your existing GitHub repository</li>
                  <li>• Keep your project files in Freebuff Web unchanged</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRemoveConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRemoveSync}>
                Remove Sync
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </FeatureGate>
  );
}
