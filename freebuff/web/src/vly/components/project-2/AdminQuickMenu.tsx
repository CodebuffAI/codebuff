"use client";

/**
 * REFACTORING NOTE:
 * This file has been partially refactored into modules. See ./admin-menu/ directory for:
 * - constants.ts: All constant definitions
 * - types.ts: TypeScript interfaces
 * - utils.ts: Utility functions
 * - hooks.ts: Custom React hooks
 * - shared/: Reusable UI components (SectionHeader, PauseStatusBadge, etc.)
 * - user/: User-scoped components (UserSelector, etc.)
 * - system/: System tab component
 * - management/: Management tab component (partial)
 *
 * PERFORMANCE OPTIMIZATIONS APPLIED:
 * 1. Lazy loading tab content with React.lazy and Suspense
 * 2. Using custom hooks from hooks.ts
 * 3. Memoized components to prevent unnecessary re-renders
 * 4. Conditional query loading only when tabs are active
 */

import { useState, useEffect, lazy, Suspense, useTransition } from "react";
import Link from "next/link";
import { useDebounce } from "@/vly/lib/hooks/use-debounce";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { Label } from "@/vly/components/ui/label";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

// Lazy load heavy tab components
const SystemTabContent = lazy(() =>
  import("./admin-menu/system").then((mod) => ({
    default: mod.SystemTabContent,
  })),
);

const MonitoringTabContent = lazy(() =>
  import("./admin-menu/monitoring").then((mod) => ({
    default: mod.MonitoringTabContent,
  })),
);

import {
  ExternalLink,
  User,
  Users,
  FolderOpen,
  Settings,
  FileText,
} from "lucide-react";
import { Badge } from "@/vly/components/ui/badge";

// Modular imports
import { SectionHeader, LoadingState, EmptyState } from "./admin-menu/shared";

import {
  UserSelector,
  UserCreditsTab,
  UserInfoTab,
  UserPauseTab,
  UserProjectsTab,
} from "./admin-menu/user";

import {
  ProjectPauseTab,
  ProjectAccessTab,
  SessionLogsTab,
} from "./admin-menu/project";

// Import custom hooks to reduce state management complexity
import { usePauseManagement } from "./admin-menu/hooks";

interface AdminQuickMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: Id<"project">;
  initialUserId?: Id<"users">;
  initialProjectId?: Id<"project">;
}

export function AdminQuickMenu({
  open,
  onOpenChange,
  projectId,
  initialUserId,
  initialProjectId,
}: AdminQuickMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // Increased debounce from 200ms to 300ms
  const [selectedUser, setSelectedUser] = useState<{
    _id: Id<"users">;
    name: string;
    email: string;
    clerk_id: string;
  } | null>(null);
  const [selectedProjectId, setSelectedProjectId] =
    useState<Id<"project"> | null>(initialProjectId ?? projectId ?? null);
  const [activeUserTab, setActiveUserTab] = useState("credits");
  const [activeProjectTab, setActiveProjectTab] = useState("deployments");
  const [topLevelTab, setTopLevelTab] = useState<
    "management" | "system" | "monitoring"
  >("management");

  // Use transition for tab changes to improve INP
  const [, startTransition] = useTransition();

  // Use custom pause management hook
  const { isPausing, pauseResults, handlePauseUser, handlePauseProject } =
    usePauseManagement();

  // Pause/unpause form states
  const [pauseReason, setPauseReason] = useState<string>("manual_admin");
  const [autoUnpause, setAutoUnpause] = useState(false);

  // Get initial user by ID (for non-project pages)
  const initialUser = useQuery(
    api.admin.getUserById,
    initialUserId ? { userId: initialUserId } : "skip",
  );

  // Get project owner (for project pages)
  const projectOwner = useQuery(
    api.admin.getProjectOwner,
    projectId ? { projectId } : "skip",
  );

  // Search users
  const searchResults = useQuery(
    api.admin.searchUsersByEmail,
    debouncedSearchQuery.length > 0
      ? { searchQuery: debouncedSearchQuery }
      : "skip",
  );

  // Get user's projects (lazy load - only when projects tab is active)
  const userProjects = useQuery(
    api.admin.getUserProjects,
    selectedUser && activeUserTab === "projects"
      ? { userId: selectedUser._id }
      : "skip",
  );

  // Get pause status for selected user (lazy load - only when pause-all tab is active)
  const userPauseStatus = useQuery(
    api.admin.getUserPauseStatus,
    selectedUser && activeUserTab === "pause-all"
      ? { userId: selectedUser._id }
      : "skip",
  ) as any;

  // Get project pause status (lazy load - only when pause-project tab is active)
  const projectPauseStatus = useQuery(
    api.admin.getProjectPauseStatus,
    activeProjectTab === "pause-project" && selectedProjectId
      ? { projectId: selectedProjectId }
      : "skip",
  ) as any;

  // Get project members (lazy load - only when access tab is active)
  const projectMembers = useQuery(
    api.admin.getProjectMembers,
    activeProjectTab === "access" && selectedProjectId
      ? { projectId: selectedProjectId }
      : "skip",
  );

  // Get project deployment details (only loaded when we have a selected project)
  const deploymentDetails = useQuery(
    api.admin.getProjectDeploymentDetails,
    selectedProjectId ? { projectId: selectedProjectId } : "skip",
  );

  // Initialize state when dialog opens
  // Note: setState in effects is necessary here for initialization when props change
  useEffect(() => {
    if (open) {
      // Initialize user if not already selected
      if (!selectedUser && (initialUser || projectOwner)) {
        setSelectedUser(initialUser ?? projectOwner ?? null);
      }
      // Initialize project
      const targetProjectId = initialProjectId ?? projectId ?? null;
      if (targetProjectId !== selectedProjectId) {
        setSelectedProjectId(targetProjectId);
      }
    } else {
      // Reset state when dialog closes
      if (selectedUser) {
        setSelectedUser(null);
      }
      if (selectedProjectId) {
        setSelectedProjectId(null);
      }
      if (searchQuery) {
        setSearchQuery("");
      }
    }
    // Note: selectedUser and selectedProjectId intentionally not in deps to avoid cascading renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUser, projectOwner, initialProjectId, projectId]);

  // Wrapper functions for pause handlers from custom hook
  const onPauseUser = async () => {
    if (!selectedUser) {
      toast.error("Please select a user");
      return;
    }
    await handlePauseUser(
      selectedUser,
      userPauseStatus,
      pauseReason,
      autoUnpause,
    );
  };

  const onPauseProject = async () => {
    if (!selectedProjectId) {
      toast.error("Please select a project");
      return;
    }
    await handlePauseProject(
      selectedProjectId,
      projectPauseStatus,
      pauseReason,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!top-[7.5vh] max-h-[85vh] max-w-[1400px] !translate-y-0 overflow-y-auto overflow-x-hidden"
        style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
      >
        <div className="min-w-0 max-w-full">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Admin Quick Menu
            </DialogTitle>
            <DialogDescription className="text-zinc-600">
              Manage user and project settings, credits, and deployments.
            </DialogDescription>
          </DialogHeader>

          {/* TOP-LEVEL TAB SELECTOR */}
          <Tabs
            value={topLevelTab}
            onValueChange={(value) =>
              startTransition(() => {
                setTopLevelTab(value as "management" | "system" | "monitoring");
              })
            }
            className="w-full min-w-0"
          >
            <TabsList className="grid h-12 w-full min-w-0 grid-cols-3 bg-zinc-100 p-1">
              <TabsTrigger
                value="management"
                className="flex items-center gap-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Users className="h-4 w-4" />
                Management
              </TabsTrigger>
              <TabsTrigger
                value="system"
                className="flex items-center gap-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Settings className="h-4 w-4" />
                System
              </TabsTrigger>
              <TabsTrigger
                value="monitoring"
                className="flex items-center gap-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <FileText className="h-4 w-4" />
                Monitoring
              </TabsTrigger>
            </TabsList>

            {/* MANAGEMENT TAB CONTENT */}
            <TabsContent value="management" className="mt-6">
              {/* SIDE-BY-SIDE LAYOUT */}
              <div className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-2">
                {/* USER SECTION */}
                <div className="space-y-5">
                  <SectionHeader
                    icon={User}
                    title="User Scope"
                    iconColor="text-blue-600"
                    iconBgColor="bg-blue-50"
                    borderColor="border-blue-200"
                  />

                  {/* User Selector */}
                  <UserSelector
                    selectedUser={selectedUser}
                    onSelectUser={(user) => {
                      setSelectedUser(user);
                      setSearchQuery("");
                    }}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    searchResults={searchResults}
                    projectOwner={projectOwner ?? null}
                  />

                  {/* User Tabs */}
                  <Tabs
                    value={activeUserTab}
                    onValueChange={setActiveUserTab}
                    className="w-full"
                  >
                    <TabsList className="grid h-11 w-full grid-cols-4 bg-zinc-100 p-1">
                      <TabsTrigger
                        value="credits"
                        className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                      >
                        Credits
                      </TabsTrigger>
                      <TabsTrigger
                        value="user-info"
                        className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                      >
                        Info
                      </TabsTrigger>
                      <TabsTrigger
                        value="pause-all"
                        className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                      >
                        Pause All
                      </TabsTrigger>
                      <TabsTrigger
                        value="projects"
                        className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                      >
                        Projects
                      </TabsTrigger>
                    </TabsList>

                    {/* CREDITS TAB */}
                    <TabsContent value="credits" className="mt-5 space-y-4">
                      {!selectedUser ? (
                        <EmptyState
                          icon={User}
                          title="No user selected"
                          description="Select a user to view their credit balances"
                        />
                      ) : (
                        <Suspense
                          fallback={
                            <div className="flex min-h-[400px] items-center justify-center">
                              <LoadingState message="Loading credit balances..." />
                            </div>
                          }
                        >
                          <UserCreditsTab
                            selectedUser={selectedUser}
                            onClose={() => onOpenChange(false)}
                          />
                        </Suspense>
                      )}
                    </TabsContent>

                    {/* USER INFO TAB */}
                    <TabsContent value="user-info" className="mt-5 space-y-4">
                      {!selectedUser ? (
                        <EmptyState
                          icon={User}
                          title="No user selected"
                          description="Select a user to view their information"
                        />
                      ) : (
                        <Suspense
                          fallback={
                            <div className="flex min-h-[300px] items-center justify-center">
                              <LoadingState message="Loading user details..." />
                            </div>
                          }
                        >
                          <UserInfoTab selectedUser={selectedUser} />
                        </Suspense>
                      )}
                    </TabsContent>

                    {/* PAUSE ALL TAB */}
                    <TabsContent value="pause-all" className="mt-5 space-y-4">
                      {!selectedUser ? (
                        <EmptyState
                          icon={User}
                          title="No user selected"
                          description="Select a user to manage pause settings"
                        />
                      ) : (
                        <UserPauseTab
                          selectedUser={selectedUser}
                          userPauseStatus={userPauseStatus}
                          pauseReason={pauseReason}
                          setPauseReason={setPauseReason}
                          autoUnpause={autoUnpause}
                          setAutoUnpause={setAutoUnpause}
                          isPausing={isPausing}
                          pauseResults={pauseResults}
                          onPauseUser={onPauseUser}
                        />
                      )}
                    </TabsContent>

                    {/* PROJECTS TAB */}
                    <TabsContent value="projects" className="mt-5 space-y-4">
                      {!selectedUser ? (
                        <EmptyState
                          icon={User}
                          title="No user selected"
                          description="Select a user to view their projects"
                        />
                      ) : (
                        <UserProjectsTab
                          selectedUser={selectedUser}
                          userProjects={userProjects}
                          selectedProjectId={selectedProjectId}
                          currentProjectId={projectId}
                          onSelectProject={setSelectedProjectId}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                {/* PROJECT SECTION */}
                <div className="space-y-5 lg:border-l lg:border-zinc-200 lg:pl-8">
                  <SectionHeader
                    icon={FolderOpen}
                    title="Project Scope"
                    iconColor="text-purple-600"
                    iconBgColor="bg-purple-50"
                    borderColor="border-purple-200"
                  />

                  {/* Project Display */}
                  <div className="grid gap-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                        Selected Project
                      </Label>
                      {selectedProjectId &&
                      projectId &&
                      selectedProjectId === projectId ? (
                        <Badge
                          variant="outline"
                          className="h-5 border-green-500 bg-green-50 px-1.5 py-0 text-[10px] font-medium text-green-700"
                        >
                          Current Page
                        </Badge>
                      ) : selectedProjectId ? (
                        <Badge
                          variant="outline"
                          className="h-5 border-orange-500 bg-orange-50 px-1.5 py-0 text-[10px] font-medium text-orange-700"
                        >
                          Not Current Page
                        </Badge>
                      ) : null}
                    </div>

                    {!selectedProjectId ? (
                      <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-6 shadow-sm">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <FolderOpen className="h-8 w-8 text-zinc-400" />
                          <p className="text-sm font-medium text-zinc-700">
                            No project selected
                          </p>
                          <p className="text-xs text-zinc-500">
                            Select a user and choose from their projects in the
                            Projects tab
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-4 shadow-sm">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-zinc-900">
                                {deploymentDetails?.project.name ||
                                  "Loading..."}
                              </span>
                              {deploymentDetails?.project
                                .semantic_identifier && (
                                <>
                                  <span className="text-zinc-400">•</span>
                                  <Link
                                    href={`/web/project/${deploymentDetails.project.semantic_identifier}`}
                                    target="_blank"
                                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                  >
                                    {
                                      deploymentDetails.project
                                        .semantic_identifier
                                    }
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {deploymentDetails?.project.sandbox_id && (
                                <span className="w-fit rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-500">
                                  {deploymentDetails.project.sandbox_id}
                                </span>
                              )}
                              {deploymentDetails?.project.packageManager && (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-blue-500 bg-blue-50 px-1.5 py-0 text-[10px] font-medium text-blue-700"
                                >
                                  {deploymentDetails.project.packageManager}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {userProjects && userProjects.length > 1 && (
                          <p className="text-xs italic text-zinc-500">
                            💡 Switch between user's projects in the Projects
                            tab
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Project Tabs */}
                  {selectedProjectId ? (
                    <Tabs
                      value={activeProjectTab}
                      onValueChange={setActiveProjectTab}
                      className="w-full"
                    >
                      <TabsList className="grid h-11 w-full grid-cols-4 bg-zinc-100 p-1">
                        <TabsTrigger
                          value="deployments"
                          className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                          Deploy
                        </TabsTrigger>
                        <TabsTrigger
                          value="pause-project"
                          className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                          Pause
                        </TabsTrigger>
                        <TabsTrigger
                          value="access"
                          className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                          Access
                        </TabsTrigger>
                        <TabsTrigger
                          value="sessions"
                          className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                          Sessions
                        </TabsTrigger>
                      </TabsList>

                      {/* PAUSE PROJECT TAB */}
                      <TabsContent
                        value="pause-project"
                        className="mt-5 space-y-4"
                      >
                        <ProjectPauseTab
                          projectPauseStatus={projectPauseStatus}
                          pauseReason={pauseReason}
                          setPauseReason={setPauseReason}
                          isPausing={isPausing}
                          pauseResults={pauseResults}
                          onPauseProject={onPauseProject}
                        />
                      </TabsContent>

                      {/* PROJECT ACCESS TAB */}
                      <TabsContent value="access" className="mt-5 space-y-4">
                        <ProjectAccessTab projectMembers={projectMembers} />

                        {/* TODO: Add member management (add/remove) functionality */}
                        <EmptyState
                          icon={Users}
                          title="Member management coming soon"
                        />
                      </TabsContent>

                      {/* DEPLOYMENTS TAB */}
                      <TabsContent
                        value="deployments"
                        className="mt-5 space-y-4"
                      >
                        {!deploymentDetails ? (
                          <LoadingState message="Loading deployment details..." />
                        ) : !deploymentDetails.hasConvex ? (
                          <EmptyState
                            icon={FolderOpen}
                            title="This project has no Convex deployments"
                          />
                        ) : (
                          <div className="space-y-4">
                            {/* Project Info */}
                            <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-5 shadow-sm">
                              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-50">
                                  <FolderOpen className="h-3.5 w-3.5 text-purple-600" />
                                </div>
                                Project Information
                              </h3>
                              <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between border-b border-zinc-100 py-2">
                                  <span className="font-medium text-zinc-600">
                                    Name
                                  </span>
                                  <span className="font-semibold text-zinc-900">
                                    {deploymentDetails.project.name}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between py-2">
                                  <span className="font-medium text-zinc-600">
                                    Sandbox ID
                                  </span>
                                  <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-900">
                                    {deploymentDetails.project.sandbox_id}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Deployments */}
                            <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-5 shadow-sm">
                              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-50">
                                  <img
                                    src="/convex-color.svg"
                                    alt=""
                                    className="h-3.5 w-3.5"
                                  />
                                </div>
                                Convex Deployments
                              </h3>
                              <div className="space-y-3">
                                {/* Dev Deployment */}
                                <div className="rounded-lg border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md">
                                  <div className="mb-3 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-zinc-900">
                                      Development
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="font-medium"
                                    >
                                      dev
                                    </Badge>
                                  </div>
                                  <div className="space-y-2.5 text-xs">
                                    <div className="flex items-center justify-between py-1.5">
                                      <span className="font-medium text-zinc-600">
                                        Deployment
                                      </span>
                                      <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-zinc-900">
                                        {
                                          deploymentDetails.convex
                                            ?.devDeploymentName
                                        }
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between py-1.5">
                                      <span className="font-medium text-zinc-600">
                                        Dashboard
                                      </span>
                                      <a
                                        href={
                                          deploymentDetails.convex
                                            ?.devDeploymentUrl
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 font-medium text-blue-600 transition-colors hover:text-blue-700"
                                      >
                                        Open
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    </div>
                                  </div>
                                </div>

                                {/* Prod Deployment */}
                                {deploymentDetails.convex?.prodDeploymentName &&
                                  deploymentDetails.convex
                                    ?.prodDeploymentName !==
                                    deploymentDetails.convex
                                      ?.devDeploymentName && (
                                    <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/30 p-4 transition-shadow hover:shadow-md">
                                      <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm font-semibold text-zinc-900">
                                          Production
                                        </span>
                                        <Badge className="bg-blue-500 font-medium hover:bg-blue-600">
                                          prod
                                        </Badge>
                                      </div>
                                      <div className="space-y-2.5 text-xs">
                                        <div className="flex items-center justify-between py-1.5">
                                          <span className="font-medium text-zinc-600">
                                            Deployment
                                          </span>
                                          <span className="rounded bg-white/60 px-2 py-1 font-mono text-zinc-900">
                                            {
                                              deploymentDetails.convex
                                                ?.prodDeploymentName
                                            }
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between py-1.5">
                                          <span className="font-medium text-zinc-600">
                                            Dashboard
                                          </span>
                                          <a
                                            href={
                                              deploymentDetails.convex
                                                ?.prodDeploymentUrl ?? undefined
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 font-medium text-blue-600 transition-colors hover:text-blue-700"
                                          >
                                            Open
                                            <ExternalLink className="h-3.5 w-3.5" />
                                          </a>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        )}
                      </TabsContent>

                      {/* SESSIONS TAB */}
                      <TabsContent value="sessions" className="mt-5 space-y-4">
                        <SessionLogsTab projectId={selectedProjectId} />
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-zinc-50 to-zinc-100/30 p-6 text-center">
                      <p className="text-sm text-zinc-600">
                        Select a project to view deployment, pause, access, and
                        session options
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* SYSTEM TAB CONTENT - Lazy Loaded */}
            <TabsContent value="system" className="mt-6">
              {topLevelTab === "system" && (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <LoadingState message="Loading system controls..." />
                    </div>
                  }
                >
                  <SystemTabContent />
                </Suspense>
              )}
            </TabsContent>

            {/* MONITORING TAB CONTENT - Lazy Loaded */}
            <TabsContent value="monitoring" className="mt-6 min-w-0">
              {topLevelTab === "monitoring" && (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <LoadingState message="Loading monitoring..." />
                    </div>
                  }
                >
                  <MonitoringTabContent />
                </Suspense>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
