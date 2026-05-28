'use client'

import { useSession } from 'next-auth/react'
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useState, useEffect, Suspense, lazy } from "react";
import { SearchInput } from "@/vly/components/ui/search-input";
import { Avatar, AvatarImage, AvatarFallback } from "@/vly/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/vly/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/vly/components/ui/dropdown-menu";
const CreateProjectModal = lazy(
  () => import("@/vly/components/CreateProjectModal"),
);
const ImportProjectsDialog = lazy(
  () => import("@/vly/components/ImportProjectsDialog"),
);
import {
  Loader,
  AlertTriangle,
  Plus,
  Sparkles,
  ArrowUpRight,
  Trash2,
  ChevronDown,
  Download,
} from "lucide-react";
import { useCustomer } from "autumn-js/react";
import { checkProjectWorkspaceQuota } from "@/vly/lib/billing/workspace-quota-utils";
import type { AutumnCustomer } from "@/vly/lib/billing/types";
import { PageLayout } from "@/vly/components/test-landing/PageLayout";

export default function Dashboard() {
  const { data: session, status: sessionStatus } = useSession()
  const userName = session?.user?.name ?? ''
  const userImage = session?.user?.image ?? undefined
  const userBio = ''
  const projects = useQuery(api.project.getUserProjects);
  // Treat both "session loading" and "convex query in flight" as loading,
  // so we never flash the empty state before data has actually arrived.
  const isLoadingProjects = sessionStatus === "loading" || projects === undefined;
  const router = useRouter();
  const { customer } = useCustomer();
  const [deleteProjectId, setDeleteProjectId] = useState<Id<"project"> | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(userName);
  const [profileBio, setProfileBio] = useState("");
  const [sortBy, setSortBy] = useState<"lastViewed" | "alphabetical">(
    "lastViewed",
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isSelectSiteModalOpen, setIsSelectSiteModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] =
    useState<Id<"project"> | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);
  const [isImportProjectsDialogOpen, setIsImportProjectsDialogOpen] =
    useState(false);
  const [loadingProjectId, setLoadingProjectId] =
    useState<Id<"project"> | null>(null);
  const [, setFeaturedProjects] = useState<Id<"project">[]>([]);
  const projectsPerPage = 3;
  const deleteProject = useMutation(api.project.deleteProject);
  const updateLastOpened = useMutation(api.project.updateLastOpened);

  const getProjectImageSrc = (project: any) => {
    if (project.screenshotUrl) {
      return project.screenshotUrl;
    }
    // Check if pretty_preview_url is actually a valid image URL
    if (
      project.pretty_preview_url &&
      project.pretty_preview_url.startsWith("http") &&
      !project.pretty_preview_url.includes("freebuff.dev") && // Exclude freebuff.dev URLs as they're not images
      (project.pretty_preview_url.includes(".jpg") ||
        project.pretty_preview_url.includes(".jpeg") ||
        project.pretty_preview_url.includes(".png") ||
        project.pretty_preview_url.includes(".gif") ||
        project.pretty_preview_url.includes(".webp") ||
        project.pretty_preview_url.startsWith("data:image/"))
    ) {
      return project.pretty_preview_url;
    }
    return null; // Return null to trigger fallback
  };

  const isLegacyProject = (project: any) => {
    // Legacy projects have a sandbox_id without the "daytona:" prefix
    return project.sandbox_id && !project.sandbox_id.startsWith("daytona:");
  };

  // Filter and sort projects
  const filteredProjects =
    projects
      ?.filter(
        (project) =>
          project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.semantic_identifier
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()),
      )
      .sort((a, b) => {
        if (sortBy === "alphabetical") {
          return (a.name || "").localeCompare(b.name || "");
        } else {
          // Sort by last_opened (last viewed)
          const aTime = a.last_opened ?? 0;
          const bTime = b.last_opened ?? 0;
          return bTime - aTime;
        }
      }) || [];

  // Detect mobile screen size
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Apply dashboard-specific body styles
  useEffect(() => {
    document.body.classList.add("dashboard-body");
    document.documentElement.classList.add("dashboard-html");
    return () => {
      document.body.classList.remove("dashboard-body");
      document.documentElement.classList.remove("dashboard-html");
    };
  }, []);

  // Update profile name when user data changes
  useEffect(() => {
    if (userName) {
      // Check if user has a previously saved custom name in localStorage
      const savedName = localStorage.getItem("userProfileName");
      if (savedName && savedName.trim() !== "") {
        // Use a microtask to avoid synchronous setState in effect
        queueMicrotask(() => setProfileName(savedName));
      } else {
        queueMicrotask(() => setProfileName(userName));
      }
    }
  }, [userName]);

  // Update profile bio when user data changes
  useEffect(() => {
    // Check if user has a previously saved custom bio in localStorage
    const savedBio = localStorage.getItem("userProfileBio");
    if (savedBio && savedBio.trim() !== "") {
      // Use a microtask to avoid synchronous setState in effect
      queueMicrotask(() => setProfileBio(savedBio));
    } else {
      queueMicrotask(() => setProfileBio(userBio));
    }
  }, [userBio]);

  // Prevent scroll when search changes
  useEffect(() => {
    const currentScroll = window.scrollY;
    const timer = setTimeout(() => {
      window.scrollTo(0, currentScroll);
    }, 0);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  return (
    <PageLayout
      showHome={true}
      showParallax={false}
      showFooter={!isSearching && !isCreateProjectModalOpen}
      contentClassName="pt-6 sm:pt-[16vh]"
    >
      <div className="w-full max-w-full space-y-6 overflow-x-hidden px-4 sm:space-y-8 md:px-12 lg:px-20">
        {/* Profile and Featured Sites Section - Commented out for now */}
        {/* <div className="flex flex-col items-start justify-start gap-8 self-stretch lg:flex-row">
            Profile Card
            <div className="flex w-full flex-col items-start justify-start gap-7 lg:w-1/3">
              <div className="flex flex-col items-center justify-start gap-3 self-stretch">
                <Avatar
	                    src={userImage}
	                    alt={userName || "Profile"}
                  size="xl"
                  className="h-28 w-28"
                />
                <div className="flex flex-col items-center justify-start self-stretch">
                  <div className="justify-start text-center font-['PP_Cirka'] text-3xl font-normal leading-tight text-black">
                    {profileName || user?.fullName || "User"}
                  </div>
                  <div
                    onClick={() => setIsEditingProfile(true)}
                    className={`cursor-pointer justify-start font-['Geist'] text-base leading-tight ${
                      profileBio && profileBio.trim() !== ""
                        ? "font-normal text-zinc-500"
                        : "font-semibold text-[#7CFF3F]"
                    }`}
                  >
                    {profileBio && profileBio.trim() !== ""
                      ? profileBio
                      : "+ Add Bio"}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 self-stretch">
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[5px] bg-white px-5 py-2 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-colors hover:bg-gray-50"
                  >
                    <div className="justify-start font-['Geist'] text-base font-medium leading-tight text-black">
                      Edit Profile
                    </div>
                  </button>
                  <div className="inline-flex h-10 items-center justify-center gap-2 rounded-[5px] bg-white px-5 py-2 outline outline-1 outline-offset-[-1px] outline-zinc-300">
                    <div className="justify-start font-['Geist'] text-base font-medium leading-tight text-black">
                      Share Profile
                    </div>
                  </div>
                </div>
              </div>
            </div>

            Featured Sites
            <div className="flex w-full flex-col items-start justify-start gap-2 lg:flex-1">
              <div className="flex flex-col items-start justify-start gap-3.5 self-stretch">
                <div className="inline-flex items-center justify-between self-stretch">
                  <div className="justify-start font-['PP_Cirka'] text-3xl font-normal leading-loose text-black">
                    Pinned Sites
                  </div>
                  <div className="flex items-center justify-center gap-2.5">
                    <svg
                      className="h-5 w-5 text-zinc-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="justify-start font-['Geist'] text-base font-semibold leading-tight text-zinc-500">
                      Visible to everyone
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-start gap-4 self-stretch md:flex-row md:gap-8">
                First slot - Add button (or second project when 2 projects)
                {featuredProjects.length < 2 ? (
                  <div
                    className="inline-flex h-64 w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-[5px] border border-dashed border-zinc-500 transition-all duration-200 hover:border-gray-400 hover:bg-gray-200 md:flex-1"
                    onClick={() => setIsSelectSiteModalOpen(true)}
                  >
                    <svg
                      className="h-6 w-6 text-zinc-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                ) : (
                  <div className="relative inline-flex h-64 w-full flex-col items-start justify-start gap-4 md:flex-1">
                    {(() => {
                      const project = projects?.find(
                        (p) => p._id === featuredProjects[1],
                      );
                      if (!project) return null;
                      return (
                        <>
                          <div className="group relative h-52 self-stretch overflow-hidden rounded-[5px] border border-zinc-100">
                            {getProjectImageSrc(project) ? (
                              <img
                                src={getProjectImageSrc(project)}
                                alt={project.name || "Project preview"}
                                className="h-full w-full object-cover transition-transform duration-200"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                <div className="text-center">
                                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/50 backdrop-blur-sm">
                                    <svg
                                      className="h-8 w-8 text-gray-400"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </div>
                                  <div className="text-sm font-medium text-gray-500">
                                    {project.name || "Untitled Project"}
                                  </div>
                                  <div className="mt-1 text-xs text-gray-400">
                                    Preview will appear after next deploy
                                  </div>
                                </div>
                              </div>
                            )}
                            Delete button - only show on hover
                            <button
                              className="absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 backdrop-blur-sm transition-all duration-200 hover:bg-black/70 group-hover:opacity-100"
                              onClick={() =>
                                setFeaturedProjects((prev) =>
                                  prev.filter(
                                    (id) => id !== featuredProjects[1],
                                  ),
                                )
                              }
                            >
                              <svg
                                className="h-4 w-4 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                            <div className="inline-flex w-full items-center justify-between self-stretch">
                              <div className="justify-start font-['Geist'] text-xl font-semibold leading-tight text-black">
                                {project.name || "Untitled Project"}
                              </div>
                              <button
                                className="flex items-center justify-center gap-2.5 rounded-[5px] bg-white px-2 py-1 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-all duration-200 hover:bg-gray-50 hover:outline-gray-400"
                                onClick={() => {
                                  updateLastOpened({
                                    semanticIdentifier:
                                      project.semantic_identifier,
                                  }).catch((error: any) => {
                                    console.error(
                                      "Failed to update last opened timestamp:",
                                      error,
                                    );
                                  });
                                  const url =
                                    project.pretty_preview_url ||
                                    project.preview_url;
                                  if (url) window.open(url, "_blank");
                                }}
                              >
                                <div className="justify-start font-['Geist'] text-base font-normal leading-none text-zinc-500">
                                  Preview
                                </div>
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                Second slot - Lock icon (or first project when 1+ projects)
                {featuredProjects.length === 0 ? (
                  <div className="inline-flex h-64 w-full flex-col items-center justify-center gap-4 rounded-[5px] border border-dashed border-zinc-500 md:flex-1">
                    <svg
                      className="h-6 w-6 text-zinc-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                ) : (
                  <div className="relative inline-flex h-64 w-full flex-col items-start justify-start gap-4 md:flex-1">
                    {(() => {
                      const project = projects?.find(
                        (p) => p._id === featuredProjects[0],
                      );
                      if (!project) return null;
                      return (
                        <>
                          <div className="group relative h-52 self-stretch overflow-hidden rounded-[5px] border border-zinc-100">
                            {getProjectImageSrc(project) ? (
                              <img
                                src={getProjectImageSrc(project)}
                                alt={project.name || "Project preview"}
                                className="h-full w-full object-cover transition-transform duration-200"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                <div className="text-center">
                                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/50 backdrop-blur-sm">
                                    <svg
                                      className="h-8 w-8 text-gray-400"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </div>
                                  <div className="text-sm font-medium text-gray-500">
                                    {project.name || "Untitled Project"}
                                  </div>
                                  <div className="mt-1 text-xs text-gray-400">
                                    Preview will appear after next deploy
                                  </div>
                                </div>
                              </div>
                            )}
                            Delete button - only show on hover
                            <button
                              className="absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 backdrop-blur-sm transition-all duration-200 hover:bg-black/70 group-hover:opacity-100"
                              onClick={() =>
                                setFeaturedProjects((prev) =>
                                  prev.filter(
                                    (id) => id !== featuredProjects[0],
                                  ),
                                )
                              }
                            >
                              <svg
                                className="h-4 w-4 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                            <div className="inline-flex w-full items-center justify-between self-stretch">
                              <div className="justify-start font-['Geist'] text-xl font-semibold leading-tight text-black">
                                {project.name || "Untitled Project"}
                              </div>
                              <button
                                className="flex items-center justify-center gap-2.5 rounded-[5px] bg-white px-2 py-1 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-all duration-200 hover:bg-gray-50 hover:outline-gray-400"
                                onClick={() => {
                                  updateLastOpened({
                                    semanticIdentifier:
                                      project.semantic_identifier,
                                  }).catch((error: any) => {
                                    console.error(
                                      "Failed to update last opened timestamp:",
                                      error,
                                    );
                                  });
                                  const url =
                                    project.pretty_preview_url ||
                                    project.preview_url;
                                  if (url) window.open(url, "_blank");
                                }}
                              >
                                <div className="justify-start font-['Geist'] text-base font-normal leading-none text-zinc-500">
                                  Preview
                                </div>
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div> */}

        {/* My Projects header — borderless, terminal-style toolbar that
            matches the project page's aesthetic. */}
        <div className="flex flex-col items-start justify-start gap-4 self-stretch">
          <div className="flex w-full items-end justify-between gap-4">
            <div>
              <h1 className="font-['PP_Cirka'] text-3xl font-normal leading-none text-foreground sm:text-4xl">
                My Projects
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Pick up where you left off or spin up a new build.
              </p>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                onClick={() => setIsImportProjectsDialogOpen(true)}
                className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Download className="h-4 w-4" />
                <span className="font-['Geist'] text-sm">Import existing</span>
              </button>
              <button
                onClick={() => setIsCreateProjectModalOpen(true)}
                className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground transition-all hover:shadow-[0_0_20px_rgba(124,255,63,0.35)]"
              >
                <Plus className="h-4 w-4" />
                <span className="font-['Geist'] text-sm">New project</span>
              </button>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <SearchInput
                placeholder="Search projects by name…"
                onSearch={(term) => {
                  setSearchTerm(term);
                  setIsSearching(term.length > 0);
                }}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-10 items-center justify-center gap-2 rounded-lg bg-muted/40 px-3 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground">
                  <span className="font-['Geist'] font-medium">
                    {sortBy === "lastViewed"
                      ? "Last viewed"
                      : "Alphabetical"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44 rounded-lg border-0 bg-popover/95 p-1 text-popover-foreground shadow-lg shadow-black/30 backdrop-blur"
              >
                <DropdownMenuItem
                  onClick={() => setSortBy("lastViewed")}
                  className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-foreground/85 focus:bg-muted focus:text-foreground"
                >
                  Last viewed
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("alphabetical")}
                  className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-foreground/85 focus:bg-muted focus:text-foreground"
                >
                  Alphabetical
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setIsImportProjectsDialogOpen(true)}
              className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-foreground sm:hidden"
            >
              <Download className="h-4 w-4" />
              <span className="font-['Geist'] text-sm">Import</span>
            </button>
            <button
              onClick={() => setIsCreateProjectModalOpen(true)}
              className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground transition-all hover:shadow-[0_0_20px_rgba(124,255,63,0.35)] sm:hidden"
            >
              <Plus className="h-4 w-4" />
              <span className="font-['Geist'] text-sm">New project</span>
            </button>
          </div>
        </div>

        {/* Project Grid — borderless cards inspired by the project page
            chat aesthetic. Hover reveals action affordances; the rest of
            the time each card just floats on the surface as a soft tile. */}
        <div className="mt-2 flex min-h-[400px] flex-col items-start justify-start gap-3.5 self-stretch">
          {isLoadingProjects ? (
            <div
              className="grid w-full auto-rows-fr grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
              aria-label="Loading your projects"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-2xl bg-muted/30 p-3"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted/40">
                    <div className="absolute inset-0 animate-pulse bg-muted/30" />
                  </div>
                  <div className="flex flex-col gap-2 px-1 pb-1">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted/40" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProjects && filteredProjects.length > 0 ? (
            <div className="grid w-full auto-rows-fr grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => {
                const isOpening = loadingProjectId === project._id;
                const previewUrl =
                  project.pretty_preview_url || project.preview_url;
                const quotaCheck = checkProjectWorkspaceQuota(
                  project,
                  customer as AutumnCustomer | null | undefined,
                );
                const openProject = () => {
                  if (isOpening) return;
                  setLoadingProjectId(project._id);
                  updateLastOpened({
                    semanticIdentifier: project.semantic_identifier,
                  }).catch((error: any) => {
                    console.error(
                      "Failed to update last opened timestamp:",
                      error,
                    );
                  });
                  router.push(
                    `/web/project/${project.semantic_identifier}`,
                  );
                };
                return (
                  <div
                    key={project._id}
                    role="button"
                    tabIndex={0}
                    onClick={openProject}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openProject();
                      }
                    }}
                    className="group flex cursor-pointer flex-col gap-3 rounded-2xl bg-muted/25 p-3 outline-none ring-0 transition-all duration-200 hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-primary/60"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted/40">
                      {getProjectImageSrc(project) ? (
                        <img
                          src={getProjectImageSrc(project)}
                          alt={project.name || "Project preview"}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/30 to-muted/60">
                          <div className="text-center">
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-background/40 backdrop-blur-sm">
                              <Sparkles className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="text-xs font-medium text-muted-foreground">
                              Preview will appear after next deploy
                            </div>
                          </div>
                        </div>
                      )}

                      {isOpening && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                          <Loader className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      )}

                      {/* Action overlay — Preview + Delete. Always visible
                          on phones/tablets (touch has no hover), reveals on
                          hover on desktop (≥lg) so cards stay clean at rest.
                          Breakpoint matches `useIsMobile` (1024px). */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-gradient-to-t from-background/85 via-background/40 to-transparent p-2 opacity-100 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100">
                        {previewUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateLastOpened({
                                semanticIdentifier:
                                  project.semantic_identifier,
                              }).catch((error: any) => {
                                console.error(
                                  "Failed to update last opened timestamp:",
                                  error,
                                );
                              });
                              window.open(previewUrl, "_blank");
                            }}
                            className="pointer-events-auto flex h-8 items-center gap-1 rounded-md bg-background/85 px-2.5 text-xs font-medium text-foreground/90 backdrop-blur hover:bg-background"
                            aria-label="Open preview in new tab"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteProjectId(project._id);
                          }}
                          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-muted-foreground backdrop-blur transition-colors hover:bg-destructive/15 hover:text-destructive"
                          aria-label="Delete project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 px-1 pb-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-['Geist'] text-base font-semibold leading-tight text-foreground">
                          {project.name || "Untitled Project"}
                        </h3>
                        {isLegacyProject(project) && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                            title="Legacy CodeSandbox project"
                          >
                            Legacy
                          </span>
                        )}
                        {!quotaCheck.allowed && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                            title={
                              quotaCheck.reason ||
                              "Workspace tier exceeds plan"
                            }
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Upgrade
                          </span>
                        )}
                      </div>
                      <p className="font-['Geist'] text-xs text-muted-foreground">
                        Viewed{" "}
                        {project.last_opened
                          ? new Date(project.last_opened).toLocaleDateString()
                          : project._creationTime
                            ? new Date(
                                project._creationTime,
                              ).toLocaleDateString()
                            : "recently"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : searchTerm ? (
            <div className="flex min-h-[320px] w-full items-center justify-center">
              <div className="w-full max-w-2xl rounded-3xl bg-muted/25 px-8 py-10 text-center">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  No match
                </p>
                <h3 className="mt-4 font-['PP_Cirka'] text-3xl font-normal leading-none text-foreground sm:text-4xl">
                  No projects found
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  Nothing matched &quot;{searchTerm}&quot;. Try a different
                  project name or semantic identifier.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[52vh] w-full items-center justify-center">
              <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-muted/25 px-8 py-12 sm:px-12">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 to-transparent" />

                <div className="relative flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Sparkles className="h-6 w-6" />
                  </div>

                  <h3 className="mt-6 font-['PP_Cirka'] text-3xl font-normal leading-none text-foreground sm:text-4xl">
                    Create your first project
                  </h3>

                  <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                    Start with a prompt, add a visual theme or images, and
                    Freebuff will scaffold a working app for you.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {["Prompt-driven", "Theme picker", "Image upload"].map(
                      (feature) => (
                        <span
                          key={feature}
                          className="rounded-full bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground/75"
                        >
                          {feature}
                        </span>
                      ),
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCreateProjectModalOpen(true)}
                    className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-['Geist'] text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_rgba(124,255,63,0.4)]"
                  >
                    <Plus className="h-4 w-4" />
                    Open Composer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Spacer div to prevent scroll jump when filtered project list shrinks */}
        {isSearching && (
          <div className="pointer-events-none h-[2000px] select-none opacity-0" />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteProjectId}
        onOpenChange={() => setDeleteProjectId(null)}
      >
        <AlertDialogContent className="w-[86.5vw] max-w-[1200px] rounded-2xl border-0 bg-card/95 text-foreground backdrop-blur md:max-w-md">
          <AlertDialogHeader className="flex flex-row items-center justify-between">
            <AlertDialogTitle className="font-['PP_Cirka'] text-2xl font-normal leading-tight text-foreground">
              Delete project
            </AlertDialogTitle>
            <button
              onClick={() => setDeleteProjectId(null)}
              className="ml-4 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </AlertDialogHeader>
          <div className="inline-flex w-full flex-col items-start justify-start gap-7 md:w-96">
            <div className="justify-start font-['Geist'] text-base font-normal leading-tight text-muted-foreground">
              Are you sure you want to delete this project? This action cannot
              be undone.
            </div>
            <div className="flex w-full items-center justify-end gap-3">
              <AlertDialogAction
                onClick={async () => {
                  if (deleteProjectId) {
                    try {
                      await deleteProject({ projectId: deleteProjectId });
                      setDeleteProjectId(null);
                    } catch (error) {
                      console.error("Failed to delete project:", error);
                      alert("Failed to delete project. Please try again.");
                    }
                  }
                }}
                className="rounded-lg border-0 bg-destructive/15 text-destructive hover:bg-destructive/25"
              >
                Delete
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Profile Dialog */}
      <AlertDialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
        <AlertDialogContent className="w-[86.5vw] max-w-[1200px] rounded-2xl border-0 bg-card/95 text-foreground backdrop-blur md:max-w-md">
          <AlertDialogHeader className="flex flex-row items-center justify-between">
            <AlertDialogTitle className="flex items-center font-['PP_Cirka'] text-3xl font-normal leading-loose text-foreground">
              Edit Profile
            </AlertDialogTitle>
            <button
              onClick={() => setIsEditingProfile(false)}
              className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </AlertDialogHeader>
          <div className="inline-flex w-full flex-col items-start justify-start gap-7 md:w-96">
            <div className="flex flex-col items-center justify-start gap-7 self-stretch">
              <div className="flex flex-col items-center justify-start gap-7 self-stretch">
                <Avatar className="h-36 w-36">
                  <AvatarImage
	                    src={userImage}
	                    alt={userName || "Profile"}
                  />
                  <AvatarFallback>
	                    {userName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex flex-col items-start justify-start gap-3.5 self-stretch">
                <div className="flex flex-col items-start justify-start gap-[5px] self-stretch">
                  <div className="justify-start self-stretch font-['Geist'] text-base font-semibold leading-none text-foreground">
                    Name
                  </div>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="inline-flex items-center justify-start gap-2.5 self-stretch rounded-lg bg-muted/40 px-3.5 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    placeholder="Enter your name"
                  />
                </div>
                <div className="flex flex-col items-start justify-start gap-[5px] self-stretch">
                  <div className="justify-start self-stretch font-['Geist'] text-base font-semibold leading-none text-foreground">
                    Bio
                  </div>
                  <input
                    type="text"
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    className="inline-flex items-center justify-start gap-2.5 self-stretch rounded-lg bg-muted/40 px-3.5 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    placeholder="Enter your bio"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                if (
                  profileName &&
                  profileName.trim() !== "" &&
	                  profileName !== userName
                ) {
                  localStorage.setItem("userProfileName", profileName.trim());
	                } else if (profileName === userName) {
                  localStorage.removeItem("userProfileName");
                }
                if (
                  profileBio &&
                  profileBio.trim() !== "" &&
	                  profileBio !== userBio
                ) {
                  localStorage.setItem("userProfileBio", profileBio.trim());
	                } else if (profileBio === userBio) {
                  localStorage.removeItem("userProfileBio");
                }
                setIsEditingProfile(false);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 self-stretch rounded-[5px] bg-primary px-5 py-2 font-medium text-primary-foreground transition-all hover:shadow-[0_0_20px_rgba(124,255,63,0.35)]"
            >
              <div className="justify-start font-['Geist'] text-xl leading-tight">
                Save Profile
              </div>
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Select Site Modal */}
      {isSelectSiteModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/50"
            onClick={() => setIsSelectSiteModalOpen(false)}
          />

          {/* Modal */}
          <div className="fixed left-1/2 top-1/2 z-[9999] flex h-[70vh] w-[86.5vw] max-w-[1200px] -translate-x-1/2 -translate-y-1/2 transform flex-col border border-border bg-card text-foreground shadow-2xl shadow-black/60">
            {/* Header with title and close button */}
            <div className="flex items-center justify-between px-7 pb-2 pt-[30px]">
              <div className="justify-start font-['PP_Cirka'] text-3xl font-normal leading-loose text-foreground">
                Select Site
              </div>
              <button
                onClick={() => setIsSelectSiteModalOpen(false)}
                className="ml-4 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content area with fixed padding */}
            <div className="flex min-h-0 flex-1 flex-col px-7 pb-[30px]">
              {/* Search and Filter Section - Fixed */}
              <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                <div className="flex flex-col items-start justify-start gap-3.5 self-stretch">
                  {/* Search Bar */}
                  <div className="inline-flex items-center justify-start gap-7 self-stretch rounded-[90px]">
                    <SearchInput
                      placeholder="Search by project name"
                      onSearch={(term) => {
                        setSearchTerm(term);
                        setIsSearching(term.length > 0);
                      }}
                    />
                  </div>

                  {/* Filter Dropdown */}
                  <div className="inline-flex items-end justify-between self-stretch">
                    <div className="flex h-9 items-center justify-start gap-7">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex h-10 items-center justify-center gap-2 rounded-[5px] border border-border bg-secondary px-3 py-1.5 text-foreground/85 transition-colors hover:border-primary/40 hover:text-foreground">
                            <div className="justify-start font-['Geist'] text-sm font-medium leading-tight">
                              {sortBy === "lastViewed"
                                ? "Last Viewed By Me"
                                : "Alphabetically"}
                            </div>
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuContent
                            className="z-[10000] w-48 border-border bg-popover text-popover-foreground"
                            sideOffset={5}
                            align="start"
                          >
                            <DropdownMenuItem
                              onClick={() => setSortBy("lastViewed")}
                              className="cursor-pointer px-3 py-1.5 text-sm text-foreground/85 focus:bg-accent/15 focus:text-foreground"
                            >
                              Last Viewed By Me
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSortBy("alphabetical")}
                              className="cursor-pointer px-3 py-1.5 text-sm text-foreground/85 focus:bg-accent/15 focus:text-foreground"
                            >
                              Alphabetically
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenuPortal>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Grid and Pagination */}
              <div className="mt-[30px] flex min-h-0 flex-1 flex-col items-end justify-end gap-2 self-stretch">
                <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-2 self-stretch">
                  {/* Project Grid */}
                  <div
                    className="grid min-h-0 w-full flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-3 md:overflow-y-visible"
                    style={{ gridTemplateRows: "minmax(0, 1fr)" }}
                  >
                    {(() => {
                      if (isLoadingProjects) {
                        return (
                          <div className="col-span-1 w-full py-8 text-center text-muted-foreground md:col-span-3">
                            <div className="flex w-full justify-center">
                              <Loader className="mx-auto h-6 w-6 animate-spin text-primary" />
                            </div>
                          </div>
                        );
                      }
                      // Apply sorting to projects in modal
                      const sortedProjects =
                        projects
                          ?.filter(
                            (project) =>
                              project.name
                                ?.toLowerCase()
                                .includes(searchTerm.toLowerCase()) ||
                              project.semantic_identifier
                                ?.toLowerCase()
                                .includes(searchTerm.toLowerCase()),
                          )
                          .sort((a, b) => {
                            if (sortBy === "alphabetical") {
                              return (a.name || "").localeCompare(b.name || "");
                            } else {
                              // Sort by last_opened (last viewed)
                              const aTime = a.last_opened ?? 0;
                              const bTime = b.last_opened ?? 0;
                              return bTime - aTime;
                            }
                          }) || [];

                      // On mobile, show all projects (no pagination), on desktop use pagination
                      const currentProjects = isMobile
                        ? sortedProjects
                        : sortedProjects.slice(
                            (currentPage - 1) * projectsPerPage,
                            currentPage * projectsPerPage,
                          );

                      return currentProjects.length > 0 ? (
                        currentProjects.map((project) => (
                          <div
                            key={project._id}
                            className="inline-flex cursor-pointer flex-col items-start justify-start gap-3"
                            onClick={() =>
                              setSelectedProjectId(
                                selectedProjectId === project._id
                                  ? null
                                  : project._id,
                              )
                            }
                          >
                            <div
                              className={`group relative aspect-[4/3] self-stretch overflow-hidden rounded-[5px] border border-border/60 ${
                                selectedProjectId === project._id
                                  ? "ring-4 ring-primary"
                                  : ""
                              }`}
                            >
                              {getProjectImageSrc(project) ? (
                                <img
                                  src={getProjectImageSrc(project)}
                                  alt={project.name || "Project preview"}
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-card to-secondary">
                                  <div className="text-center">
                                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-background/40 backdrop-blur-sm">
                                      <svg
                                        className="h-6 w-6 text-muted-foreground"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={1.5}
                                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                        />
                                      </svg>
                                    </div>
                                    <div className="text-xs font-medium text-muted-foreground">
                                      {project.name || "Untitled Project"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                              <div className="flex w-full items-center justify-between">
                                <div className="mr-2 flex flex-1 items-center justify-start gap-2 truncate font-['Geist'] text-lg font-semibold leading-tight text-foreground">
                                  <span className="truncate">
                                    {project.name || "Untitled Project"}
                                  </span>
                                  {isLegacyProject(project) && (
                                    <span
                                      className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300"
                                      title="Legacy CodeSandbox project"
                                    >
                                      <svg
                                        className="h-3 w-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        />
                                      </svg>
                                      Legacy
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="flex items-center justify-center gap-1 rounded-[5px] border border-border bg-secondary px-2 py-1 text-xs text-foreground/85 transition-all duration-200 hover:border-primary/40 hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateLastOpened({
                                      semanticIdentifier:
                                        project.semantic_identifier,
                                    }).catch((error: any) => {
                                      console.error(
                                        "Failed to update last opened timestamp:",
                                        error,
                                      );
                                    });
                                    const url =
                                      project.pretty_preview_url ||
                                      project.preview_url;
                                    if (url) window.open(url, "_blank");
                                  }}
                                >
                                  <div className="justify-start font-['Geist'] font-normal leading-none">
                                    Preview
                                  </div>
                                </button>
                              </div>
                              <div className="inline-flex items-center justify-between gap-2 self-stretch">
                                <div className="justify-start font-['Geist'] text-xs font-normal leading-none text-muted-foreground">
                                  Viewed{" "}
                                  {project.last_opened
                                    ? new Date(
                                        project.last_opened,
                                      ).toLocaleDateString()
                                    : new Date().toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-1 w-full py-8 text-center text-muted-foreground md:col-span-3">
                          {searchTerm
                            ? `No projects found matching "${searchTerm}". Try a different search term.`
                            : "No projects available to feature."}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Pagination */}
                  {(() => {
                    // Apply sorting to projects in modal for pagination
                    const sortedProjects =
                      projects
                        ?.filter(
                          (project) =>
                            project.name
                              ?.toLowerCase()
                              .includes(searchTerm.toLowerCase()) ||
                            project.semantic_identifier
                              ?.toLowerCase()
                              .includes(searchTerm.toLowerCase()),
                        )
                        .sort((a, b) => {
                          if (sortBy === "alphabetical") {
                            return (a.name || "").localeCompare(b.name || "");
                          } else {
                            // Sort by last_opened (last viewed)
                            const aTime = a.last_opened ?? 0;
                            const bTime = b.last_opened ?? 0;
                            return bTime - aTime;
                          }
                        }) || [];

                    const totalProjects = sortedProjects.length;
                    const totalPages = Math.ceil(
                      totalProjects / projectsPerPage,
                    );

                    if (totalPages <= 1) return null;

                    // Only show pagination on desktop
                    if (isMobile) return null;

                    return (
                      <div className="mt-[30px] hidden items-center justify-start gap-2 md:inline-flex">
                        <button
                          className={`justify-start font-['Geist'] text-xs font-normal ${currentPage === 1 ? "cursor-not-allowed text-muted-foreground/60" : "cursor-pointer text-muted-foreground hover:text-foreground"}`}
                          onClick={() =>
                            currentPage > 1 && setCurrentPage(currentPage - 1)
                          }
                          disabled={currentPage === 1}
                        >
                          Prev
                        </button>

                        {Array.from(
                          { length: Math.min(totalPages, 5) },
                          (_, i) => {
                            const pageNum = i + 1;
                            const isSelected = pageNum === currentPage;

                            return (
                              <button
                                key={pageNum}
                                className={`inline-flex w-6 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[90px] px-2 py-1 transition-colors ${
                                  isSelected
                                    ? "bg-primary"
                                    : "bg-secondary hover:bg-muted"
                                }`}
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                <div
                                  className={`justify-start self-stretch text-center font-['Geist'] text-xs font-normal ${
                                    isSelected
                                      ? "text-primary-foreground"
                                      : "text-foreground/85"
                                  }`}
                                >
                                  {pageNum}
                                </div>
                              </button>
                            );
                          },
                        )}

                        {totalPages > 5 && (
                          <>
                            <div className="justify-start font-['Geist'] text-xs font-normal text-muted-foreground/60">
                              ...
                            </div>
                            <button
                              className={`inline-flex w-6 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[90px] px-2 py-1 transition-colors ${
                                currentPage === totalPages
                                  ? "bg-primary"
                                  : "bg-secondary hover:bg-muted"
                              }`}
                              onClick={() => setCurrentPage(totalPages)}
                            >
                              <div
                                className={`justify-start self-stretch text-center font-['Geist'] text-xs font-normal ${
                                  currentPage === totalPages
                                    ? "text-primary-foreground"
                                    : "text-foreground/85"
                                }`}
                              >
                                {totalPages}
                              </div>
                            </button>
                          </>
                        )}

                        <button
                          className={`justify-start font-['Geist'] text-xs font-normal ${currentPage === totalPages ? "cursor-not-allowed text-muted-foreground/60" : "cursor-pointer text-muted-foreground hover:text-foreground"}`}
                          onClick={() =>
                            currentPage < totalPages &&
                            setCurrentPage(currentPage + 1)
                          }
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Footer Button */}
                <button
                  className={`inline-flex items-center justify-center gap-2 rounded-[5px] px-5 py-2 transition-all duration-200 ${
                    selectedProjectId
                      ? "cursor-pointer bg-primary text-primary-foreground hover:shadow-[0_0_20px_rgba(124,255,63,0.35)]"
                      : "cursor-not-allowed bg-muted text-muted-foreground"
                  }`}
                  onClick={() => {
                    if (selectedProjectId) {
                      setFeaturedProjects((prev) => {
                        if (prev.includes(selectedProjectId)) {
                          return prev;
                        }
                        if (prev.length === 0) {
                          return [selectedProjectId];
                        } else if (prev.length === 1) {
                          return [...prev, selectedProjectId];
                        }
                        return prev;
                      });
                      setSelectedProjectId(null);
                      setIsSelectSiteModalOpen(false);
                    }
                  }}
                  disabled={!selectedProjectId}
                >
                  <div className="justify-start font-['Geist'] text-xl font-medium leading-tight">
                    Post
                  </div>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create Project Modal */}
      <Suspense fallback={<div />}>
        <CreateProjectModal
          isOpen={isCreateProjectModalOpen}
          onClose={() => setIsCreateProjectModalOpen(false)}
        />
      </Suspense>

      {/* Import Projects Dialog */}
      <Suspense fallback={<div />}>
        <ImportProjectsDialog
          isOpen={isImportProjectsDialogOpen}
          onClose={() => setIsImportProjectsDialogOpen(false)}
        />
      </Suspense>
    </PageLayout>
  );
}
