"use client";

import { useSession } from "next-auth/react";
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
import { Loader, AlertTriangle, Plus, Sparkles } from "lucide-react";
import { PausedDeploymentBanner } from "@/vly/components/common/paused-deployment-banner";
import { checkProjectWorkspaceQuota } from "@/vly/lib/billing/workspace-quota-utils";
import type { AutumnCustomer } from "@/vly/lib/billing/types";
import { PageLayout } from "@/vly/components/test-landing/PageLayout";

export default function Dashboard() {
  const { data: session } = useSession();
  const user = session?.user;
  const projects = useQuery(api.project.getUserProjects);
  const router = useRouter();
  const customer = null as AutumnCustomer | null;
  const [deleteProjectId, setDeleteProjectId] = useState<Id<"project"> | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || "");
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
      !project.pretty_preview_url.includes("vly.sh") && // Exclude vly.sh URLs as they're not images
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
    if (user?.name) {
      // Check if user has a previously saved custom name in localStorage
      const savedName = localStorage.getItem("userProfileName");
      if (savedName && savedName.trim() !== "") {
        // Use a microtask to avoid synchronous setState in effect
        queueMicrotask(() => setProfileName(savedName));
      } else {
        queueMicrotask(() => setProfileName(user.name ?? ""));
      }
    }
  }, [user?.name]);

  // Update profile bio when user data changes
  useEffect(() => {
    // Check if user has a previously saved custom bio in localStorage
    const savedBio = localStorage.getItem("userProfileBio");
    if (savedBio && savedBio.trim() !== "") {
      // Use a microtask to avoid synchronous setState in effect
      queueMicrotask(() => setProfileBio(savedBio));
    } else {
      queueMicrotask(() =>
        setProfileBio((({} as any) as any)?.bio || ""),
      );
    }
  }, [user?.name, ({} as any)]);

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
      contentClassName="pt-[16vh]"
    >
      <div className="w-full space-y-8 px-4 md:px-20">
        <PausedDeploymentBanner />
        {/* Profile and Featured Sites Section - Commented out for now */}
        {/* <div className="flex flex-col items-start justify-start gap-8 self-stretch lg:flex-row">
            Profile Card
            <div className="flex w-full flex-col items-start justify-start gap-7 lg:w-1/3">
              <div className="flex flex-col items-center justify-start gap-3 self-stretch">
                <Avatar
                  src={user?.image}
                  alt={user?.name || "Profile"}
                  size="xl"
                  className="h-28 w-28"
                />
                <div className="flex flex-col items-center justify-start self-stretch">
                  <div className="justify-start text-center font-['PP_Cirka'] text-3xl font-normal leading-tight text-black">
                    {profileName || user?.name || "User"}
                  </div>
                  <div
                    onClick={() => setIsEditingProfile(true)}
                    className={`cursor-pointer justify-start font-['Geist'] text-base leading-tight ${
                      profileBio && profileBio.trim() !== ""
                        ? "font-normal text-zinc-500"
                        : "font-semibold text-[#A37FBC]"
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

        {/* My Projects Section */}
        <div className="flex flex-col items-start justify-start gap-2 self-stretch">
          <div className="justify-start self-stretch font-['PP_Cirka'] text-3xl font-normal leading-loose text-black">
            My Projects
          </div>
          <div className="flex flex-col items-start justify-start gap-3.5 self-stretch">
            <div className="inline-flex items-center justify-start gap-7 self-stretch rounded-[90px]">
              <SearchInput
                placeholder="Search by project name"
                onSearch={(term) => {
                  setSearchTerm(term);
                  setIsSearching(term.length > 0);
                }}
              />
            </div>
            <div className="inline-flex items-end justify-between self-stretch">
              <div className="flex h-9 items-center justify-start gap-7">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center gap-2 rounded-[5px] bg-white px-3 py-2 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-colors hover:bg-gray-50">
                      <div className="justify-start font-['Geist'] text-sm font-medium leading-tight text-zinc-500">
                        {sortBy === "lastViewed"
                          ? "Last Viewed By Me"
                          : "Alphabetically"}
                      </div>
                      <svg
                        className="h-4 w-4 text-zinc-500"
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
                  <DropdownMenuContent className="w-48">
                    <DropdownMenuItem
                      onClick={() => setSortBy("lastViewed")}
                      className="cursor-pointer px-3 py-1.5 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                    >
                      Last Viewed By Me
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortBy("alphabetical")}
                      className="cursor-pointer px-3 py-1.5 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                    >
                      Alphabetically
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <button
                onClick={() => setIsCreateProjectModalOpen(true)}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-[5px] bg-[#E1DFF6] px-3 py-2 outline outline-1 outline-offset-[-1px] outline-[#CCB8DA] transition-colors hover:bg-[#D4D1F0]"
              >
                <div className="justify-start font-['Geist'] text-sm font-medium leading-tight text-[#040404]">
                  Create Project
                </div>
                <svg
                  className="h-5 w-5 text-[#040404]"
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
              </button>
            </div>
          </div>
        </div>

        {/* Project Grid */}
        <div className="mt-[20px] flex min-h-[400px] flex-col items-start justify-start gap-3.5 self-stretch">
          {projects === undefined ? (
            <div className="flex w-full items-center justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : filteredProjects && filteredProjects.length > 0 ? (
            <div className="grid w-full auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
              {filteredProjects.map((project) => (
                <div
                  key={project._id}
                  className="inline-flex flex-col items-start justify-start gap-4"
                >
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
                  </div>
                  <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                    <div className="inline-flex w-full items-center justify-between self-stretch">
                      <div className="flex items-center justify-start gap-2 font-['Geist'] text-xl font-semibold leading-tight text-black">
                        {project.name || "Untitled Project"}
                        {isLegacyProject(project) && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
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
                        {(() => {
                          const quotaCheck = checkProjectWorkspaceQuota(
                            project,
                            customer as AutumnCustomer | null | undefined,
                          );
                          return (
                            !quotaCheck.allowed && (
                              <span
                                className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                                title={
                                  quotaCheck.reason ||
                                  "Workspace tier exceeds plan"
                                }
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Plan Upgrade Required
                              </span>
                            )
                          );
                        })()}
                      </div>
                      {/* Action Buttons */}
                      <div className="inline-flex items-start justify-end gap-1">
                        <button
                          className="flex items-center justify-center gap-2.5 rounded-[5px] bg-white px-2 py-1 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-all duration-200 hover:bg-gray-100"
                          onClick={() => {
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
                          }}
                          disabled={loadingProjectId === project._id}
                        >
                          <div className="justify-start font-['Geist'] text-sm font-medium leading-tight text-zinc-500">
                            Edit
                          </div>
                          {loadingProjectId === project._id && (
                            <Loader className="h-4 w-4 animate-spin text-zinc-500" />
                          )}
                        </button>
                        <button
                          className="flex items-center justify-center gap-2.5 rounded-[5px] bg-white px-2 py-1 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-all duration-200 hover:bg-gray-100"
                          onClick={() => {
                            updateLastOpened({
                              semanticIdentifier: project.semantic_identifier,
                            }).catch((error: any) => {
                              console.error(
                                "Failed to update last opened timestamp:",
                                error,
                              );
                            });
                            const url =
                              project.pretty_preview_url || project.preview_url;
                            if (url) window.open(url, "_blank");
                          }}
                        >
                          <div className="justify-start font-['Geist'] text-sm font-medium leading-tight text-zinc-500">
                            Preview
                          </div>
                        </button>
                        <button
                          className="flex items-center justify-center gap-2.5 rounded-[5px] bg-white px-2 py-1 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-all duration-200 hover:bg-red-50 hover:outline-red-300"
                          onClick={() => setDeleteProjectId(project._id)}
                        >
                          <svg
                            className="h-4 w-4 text-zinc-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="inline-flex items-center justify-between self-stretch">
                      <div className="justify-start font-['Geist'] text-sm font-medium leading-tight text-zinc-500">
                        Viewed{" "}
                        {project._creationTime
                          ? new Date(project._creationTime).toLocaleDateString()
                          : "recently"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : searchTerm ? (
            <div className="flex min-h-[320px] w-full items-center justify-center">
              <div className="w-full max-w-2xl rounded-[28px] border border-black/10 bg-white/70 px-8 py-10 text-center shadow-[0_20px_60px_rgba(21,21,18,0.08)]">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-400">
                  No Match
                </p>
                <h3 className="mt-4 font-['PP_Cirka'] text-4xl font-normal leading-none text-black">
                  No projects found
                </h3>
                <p className="mt-4 text-base leading-7 text-zinc-500">
                  Nothing matched &quot;{searchTerm}&quot;. Try a different
                  project name or semantic identifier.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[52vh] w-full items-center justify-center">
              <div className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-black/10 bg-white/75 px-8 py-10 shadow-[0_24px_80px_rgba(21,21,18,0.1)] sm:px-12 sm:py-12">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#e7e1f3] to-transparent" />

                <div className="relative flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E1DFF6] text-[#6B5B95]">
                    <Sparkles className="h-7 w-7" />
                  </div>

                  <h3 className="mt-6 font-['PP_Cirka'] text-4xl font-normal leading-none text-black sm:text-5xl">
                    Create your first project
                  </h3>

                  <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-500">
                    Start with the same prompt composer from the landing page,
                    then add a visual theme or images before generating your
                    app.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    {["Prompt-driven", "Theme picker", "Image upload"].map(
                      (feature) => (
                        <span
                          key={feature}
                          className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-500"
                        >
                          {feature}
                        </span>
                      ),
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCreateProjectModalOpen(true)}
                    className="mt-8 inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#E1DFF6] px-5 py-3 font-['Geist'] text-sm font-semibold text-black outline outline-1 outline-offset-[-1px] outline-[#CCB8DA] transition-colors hover:bg-[#D4D1F0]"
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
        <AlertDialogContent className="w-[86.5vw] max-w-[1200px] !rounded-none md:max-w-md">
          <AlertDialogHeader className="flex flex-row items-center justify-between">
            <AlertDialogTitle className="font-['PP_Cirka'] text-3xl font-normal leading-loose text-black">
              Delete Project
            </AlertDialogTitle>
            <button
              onClick={() => setDeleteProjectId(null)}
              className="ml-4 flex h-10 w-10 items-center justify-center text-[#7F7F88] transition-colors hover:text-[#6B6B73]"
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
            <div className="justify-start font-['Geist'] text-base font-normal leading-tight text-zinc-600">
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
                className="border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:outline-red-300"
              >
                Delete
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Profile Dialog */}
      <AlertDialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
        <AlertDialogContent className="w-[86.5vw] max-w-[1200px] !rounded-none md:max-w-md">
          <AlertDialogHeader className="flex flex-row items-center justify-between">
            <AlertDialogTitle className="flex items-center font-['PP_Cirka'] text-3xl font-normal leading-loose text-black">
              Edit Profile
            </AlertDialogTitle>
            <button
              onClick={() => setIsEditingProfile(false)}
              className="flex h-10 w-10 items-center justify-center text-[#7F7F88] transition-colors hover:text-[#6B6B73]"
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
                    src={user?.image ?? undefined}
                    alt={user?.name || "Profile"}
                  />
                  <AvatarFallback>
                    {user?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex flex-col items-start justify-start gap-3.5 self-stretch">
                <div className="flex flex-col items-start justify-start gap-[5px] self-stretch">
                  <div className="justify-start self-stretch font-['Geist'] text-base font-semibold leading-none text-black">
                    Name
                  </div>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="inline-flex items-center justify-start gap-2.5 self-stretch rounded-[5px] bg-white px-3.5 py-2 outline outline-1 outline-offset-[-1px] outline-zinc-300"
                    placeholder="Enter your name"
                  />
                </div>
                <div className="flex flex-col items-start justify-start gap-[5px] self-stretch">
                  <div className="justify-start self-stretch font-['Geist'] text-base font-semibold leading-none text-black">
                    Bio
                  </div>
                  <input
                    type="text"
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    className="inline-flex items-center justify-start gap-2.5 self-stretch rounded-[5px] bg-white px-3.5 py-2 outline outline-1 outline-offset-[-1px] outline-zinc-300"
                    placeholder="Enter your bio"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                // Save profile name to localStorage if it's different from the original
                if (
                  profileName &&
                  profileName.trim() !== "" &&
                  profileName !== user?.name
                ) {
                  localStorage.setItem("userProfileName", profileName.trim());
                } else if (profileName === user?.name) {
                  // If user reverted to original name, remove from localStorage
                  localStorage.removeItem("userProfileName");
                }
                // Save bio changes to localStorage if it's different from the original
                if (
                  profileBio &&
                  profileBio.trim() !== "" &&
                  profileBio !== (({} as any) as any)?.bio
                ) {
                  localStorage.setItem("userProfileBio", profileBio.trim());
                } else if (profileBio === (({} as any) as any)?.bio) {
                  // If user reverted to original bio, remove from localStorage
                  localStorage.removeItem("userProfileBio");
                }
                setIsEditingProfile(false);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 self-stretch rounded-[5px] bg-slate-200 px-5 py-2 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-colors hover:bg-slate-300"
            >
              <div className="justify-start font-['Geist'] text-xl font-medium leading-tight text-black">
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
          <div className="fixed left-1/2 top-1/2 z-[9999] flex h-[70vh] w-[86.5vw] max-w-[1200px] -translate-x-1/2 -translate-y-1/2 transform flex-col bg-white shadow-[0px_0px_4px_0px_rgba(0,0,0,0.25)]">
            {/* Header with title and close button */}
            <div className="flex items-center justify-between px-7 pb-2 pt-[30px]">
              <div className="justify-start font-['PP_Cirka'] text-3xl font-normal leading-loose text-black">
                Select Site
              </div>
              <button
                onClick={() => setIsSelectSiteModalOpen(false)}
                className="ml-4 flex h-10 w-10 items-center justify-center text-[#7F7F88] transition-colors hover:text-[#6B6B73]"
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
                          <button className="flex h-10 items-center justify-center gap-2 rounded-[5px] bg-white px-3 py-1.5 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-colors hover:bg-gray-50">
                            <div className="justify-start font-['Geist'] text-sm font-medium leading-tight text-zinc-500">
                              {sortBy === "lastViewed"
                                ? "Last Viewed By Me"
                                : "Alphabetically"}
                            </div>
                            <svg
                              className="h-4 w-4 text-zinc-500"
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
                            className="z-[10000] w-48"
                            sideOffset={5}
                            align="start"
                          >
                            <DropdownMenuItem
                              onClick={() => setSortBy("lastViewed")}
                              className="cursor-pointer px-3 py-1.5 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                            >
                              Last Viewed By Me
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSortBy("alphabetical")}
                              className="cursor-pointer px-3 py-1.5 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
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
                      if (projects === undefined) {
                        return (
                          <div className="col-span-1 w-full py-8 text-center text-zinc-500 md:col-span-3">
                            <div className="flex w-full justify-center">
                              <Loader className="mx-auto h-6 w-6 animate-spin text-zinc-500" />
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
                              className={`group relative aspect-[4/3] self-stretch overflow-hidden rounded-[5px] border border-zinc-100 ${
                                selectedProjectId === project._id
                                  ? "ring-4 ring-[#CCB8DA]"
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
                                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                  <div className="text-center">
                                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-white/50 backdrop-blur-sm">
                                      <svg
                                        className="h-6 w-6 text-gray-400"
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
                                    <div className="text-xs font-medium text-gray-500">
                                      {project.name || "Untitled Project"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-start justify-start gap-2 self-stretch">
                              <div className="flex w-full items-center justify-between">
                                <div className="mr-2 flex flex-1 items-center justify-start gap-2 truncate font-['Geist'] text-lg font-semibold leading-tight text-black">
                                  <span className="truncate">
                                    {project.name || "Untitled Project"}
                                  </span>
                                  {isLegacyProject(project) && (
                                    <span
                                      className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
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
                                  className="flex items-center justify-center gap-1 rounded-[5px] bg-white px-2 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-all duration-200 hover:bg-gray-50"
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
                                  <div className="justify-start font-['Geist'] font-normal leading-none text-zinc-500">
                                    Preview
                                  </div>
                                </button>
                              </div>
                              <div className="inline-flex items-center justify-between gap-2 self-stretch">
                                <div className="justify-start font-['Geist'] text-xs font-normal leading-none text-zinc-500">
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
                        <div className="col-span-1 w-full py-8 text-center text-zinc-500 md:col-span-3">
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
                          className={`justify-start font-['Geist'] text-xs font-normal ${currentPage === 1 ? "cursor-not-allowed text-zinc-300" : "cursor-pointer text-zinc-500 hover:text-zinc-700"}`}
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
                                    ? "bg-[#CCB8DA]"
                                    : "bg-zinc-100 hover:bg-zinc-200"
                                }`}
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                <div
                                  className={`justify-start self-stretch text-center font-['Geist'] text-xs font-normal ${
                                    isSelected ? "text-white" : "text-black"
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
                            <div className="justify-start font-['Geist'] text-xs font-normal text-zinc-300">
                              ...
                            </div>
                            <button
                              className={`inline-flex w-6 flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[90px] px-2 py-1 transition-colors ${
                                currentPage === totalPages
                                  ? "bg-[#CCB8DA]"
                                  : "bg-zinc-100 hover:bg-zinc-200"
                              }`}
                              onClick={() => setCurrentPage(totalPages)}
                            >
                              <div
                                className={`justify-start self-stretch text-center font-['Geist'] text-xs font-normal ${
                                  currentPage === totalPages
                                    ? "text-white"
                                    : "text-black"
                                }`}
                              >
                                {totalPages}
                              </div>
                            </button>
                          </>
                        )}

                        <button
                          className={`justify-start font-['Geist'] text-xs font-normal ${currentPage === totalPages ? "cursor-not-allowed text-zinc-300" : "cursor-pointer text-zinc-500 hover:text-zinc-700"}`}
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
                      ? "cursor-pointer bg-slate-200 outline outline-2 outline-zinc-300 hover:bg-slate-300"
                      : "cursor-not-allowed bg-zinc-100"
                  }`}
                  onClick={() => {
                    if (selectedProjectId) {
                      setFeaturedProjects((prev) => {
                        if (prev.includes(selectedProjectId)) {
                          return prev;
                        }
                        // If no projects, add as first project (will go to second slot)
                        // If one project exists, add as second project (will go to second slot, pushing first to first slot)
                        if (prev.length === 0) {
                          return [selectedProjectId];
                        } else if (prev.length === 1) {
                          return [...prev, selectedProjectId];
                        }
                        return prev; // Already have 2 projects
                      });
                      setSelectedProjectId(null);
                      setIsSelectSiteModalOpen(false);
                    }
                  }}
                  disabled={!selectedProjectId}
                >
                  <div
                    className={`justify-start font-['Geist'] text-xl font-medium leading-tight ${
                      selectedProjectId ? "text-black" : "text-zinc-500"
                    }`}
                  >
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
    </PageLayout>
  );
}
