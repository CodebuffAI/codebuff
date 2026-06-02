"use client";

import { useState, Suspense, useTransition } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Label } from "@/vly/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import { Badge } from "@/vly/components/ui/badge";
import { User, FolderOpen, ExternalLink, Users } from "lucide-react";

import { SectionHeader, LoadingState, EmptyState } from "../shared";
import {
  UserSelector,
  UserCreditsTab,
  UserInfoTab,
  UserPauseTab,
  UserProjectsTab,
} from "../user";
import { ProjectPauseTab, ProjectAccessTab } from "../project";
import { UserInfo } from "../types";
import { usePauseManagement } from "../hooks";

interface ManagementTabContentProps {
  projectId: Id<"project">;
  projectOwner: UserInfo | null | undefined;
  selectedUser: UserInfo | null;
  onSelectUser: (user: UserInfo | null) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: any;
  onClose: () => void;
}

export function ManagementTabContent({
  projectId,
  projectOwner,
  selectedUser,
  onSelectUser,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  onClose,
}: ManagementTabContentProps) {
  const [activeUserTab, setActiveUserTab] = useState("credits");
  const [activeProjectTab, setActiveProjectTab] = useState("deployments");
  const [selectedProjectId, setSelectedProjectId] =
    useState<Id<"project">>(projectId);

  // Use transitions for tab changes to improve INP
  const [isPendingUserTab, startUserTabTransition] = useTransition();
  const [isPendingProjectTab, startProjectTabTransition] = useTransition();

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
    activeProjectTab === "pause-project"
      ? { projectId: selectedProjectId }
      : "skip",
  ) as any;

  // Get project members (lazy load - only when access tab is active)
  const projectMembers = useQuery(
    api.admin.getProjectMembers,
    activeProjectTab === "access" ? { projectId: selectedProjectId } : "skip",
  );

  // Get project deployment details (always loaded since we need basic project info for display)
  const deploymentDetails = useQuery(api.admin.getProjectDeploymentDetails, {
    projectId: selectedProjectId,
  });

  // Pause/unpause states and handlers
  const [pauseReason, setPauseReason] = useState<string>("manual_admin");
  const [autoUnpause, setAutoUnpause] = useState(false);

  // Use pause management hook
  const {
    isPausing,
    pauseResults,
    handlePauseUser: pauseUser,
    handlePauseProject: pauseProject,
  } = usePauseManagement();

  // Wrapper functions to match expected signatures
  const handlePauseUser = async () => {
    if (!selectedUser) return;
    await pauseUser(selectedUser, userPauseStatus, pauseReason, autoUnpause);
  };

  const handlePauseProject = async () => {
    if (!selectedProjectId) return;
    await pauseProject(selectedProjectId, projectPauseStatus, pauseReason);
  };

  return (
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
          onSelectUser={onSelectUser}
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          searchResults={searchResults}
          projectOwner={projectOwner ?? null}
        />

        {/* User Tabs */}
        <Tabs
          value={activeUserTab}
          onValueChange={(value) =>
            startUserTabTransition(() => {
              setActiveUserTab(value);
            })
          }
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
            {selectedUser && activeUserTab === "credits" && (
              <Suspense
                fallback={
                  <div className="flex min-h-[400px] items-center justify-center">
                    <LoadingState message="Loading credit balances..." />
                  </div>
                }
              >
                <UserCreditsTab selectedUser={selectedUser} onClose={onClose} />
              </Suspense>
            )}
          </TabsContent>

          {/* USER INFO TAB */}
          <TabsContent value="user-info" className="mt-5 space-y-4">
            {selectedUser && activeUserTab === "user-info" && (
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
            {selectedUser && activeUserTab === "pause-all" && (
              <UserPauseTab
                selectedUser={selectedUser}
                userPauseStatus={userPauseStatus}
                pauseReason={pauseReason}
                setPauseReason={setPauseReason}
                autoUnpause={autoUnpause}
                setAutoUnpause={setAutoUnpause}
                isPausing={isPausing}
                pauseResults={pauseResults}
                onPauseUser={handlePauseUser}
              />
            )}
          </TabsContent>

          {/* PROJECTS TAB */}
          <TabsContent value="projects" className="mt-5 space-y-4">
            {selectedUser && activeUserTab === "projects" && (
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
            {selectedProjectId === projectId ? (
              <Badge
                variant="outline"
                className="h-5 border-green-500 bg-green-50 px-1.5 py-0 text-[10px] font-medium text-green-700"
              >
                Current Page
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-5 border-orange-500 bg-orange-50 px-1.5 py-0 text-[10px] font-medium text-orange-700"
              >
                Not Current Page
              </Badge>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-4 shadow-sm">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900">
                  {deploymentDetails?.project.name || "Loading..."}
                </span>
                {deploymentDetails?.project.semantic_identifier && (
                  <>
                    <span className="text-zinc-400">•</span>
                    <Link
                      href={`/web/project/${deploymentDetails.project.semantic_identifier}`}
                      target="_blank"
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {deploymentDetails.project.semantic_identifier}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </>
                )}
              </div>
              {deploymentDetails?.project.sandbox_id && (
                <span className="w-fit rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-500">
                  {deploymentDetails.project.sandbox_id}
                </span>
              )}
            </div>
          </div>
          {userProjects && userProjects.length > 1 && (
            <p className="text-xs italic text-zinc-500">
              💡 Switch between user's projects in the Projects tab
            </p>
          )}
        </div>

        {/* Project Tabs */}
        <Tabs
          value={activeProjectTab}
          onValueChange={(value) =>
            startProjectTabTransition(() => {
              setActiveProjectTab(value);
            })
          }
          className="w-full"
        >
          <TabsList className="grid h-11 w-full grid-cols-3 bg-zinc-100 p-1">
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
          </TabsList>

          {/* PAUSE PROJECT TAB */}
          <TabsContent value="pause-project" className="mt-5 space-y-4">
            {activeProjectTab === "pause-project" && (
              <ProjectPauseTab
                projectPauseStatus={projectPauseStatus}
                pauseReason={pauseReason}
                setPauseReason={setPauseReason}
                isPausing={isPausing}
                pauseResults={pauseResults}
                onPauseProject={handlePauseProject}
              />
            )}
          </TabsContent>

          {/* PROJECT ACCESS TAB */}
          <TabsContent value="access" className="mt-5 space-y-4">
            {activeProjectTab === "access" && (
              <>
                <ProjectAccessTab projectMembers={projectMembers} />
                <EmptyState
                  icon={Users}
                  title="Member management coming soon"
                />
              </>
            )}
          </TabsContent>

          {/* DEPLOYMENTS TAB */}
          <TabsContent value="deployments" className="mt-5 space-y-4">
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
                      <span className="font-medium text-zinc-600">Name</span>
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
                        <Badge variant="secondary" className="font-medium">
                          dev
                        </Badge>
                      </div>
                      <div className="space-y-2.5 text-xs">
                        <div className="flex items-center justify-between py-1.5">
                          <span className="font-medium text-zinc-600">
                            Deployment
                          </span>
                          <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-zinc-900">
                            {deploymentDetails.convex?.devDeploymentName}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1.5">
                          <span className="font-medium text-zinc-600">
                            Dashboard
                          </span>
                          <a
                            href={deploymentDetails.convex?.devDeploymentUrl}
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
                      deploymentDetails.convex?.prodDeploymentName !==
                        deploymentDetails.convex?.devDeploymentName && (
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
                                {deploymentDetails.convex?.prodDeploymentName}
                              </span>
                            </div>
                            <div className="flex items-center justify-between py-1.5">
                              <span className="font-medium text-zinc-600">
                                Dashboard
                              </span>
                              <a
                                href={
                                  deploymentDetails.convex?.prodDeploymentUrl ??
                                  undefined
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
        </Tabs>
      </div>
    </div>
  );
}
