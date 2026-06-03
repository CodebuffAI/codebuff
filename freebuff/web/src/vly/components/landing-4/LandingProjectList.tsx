import { api } from "@/convex/_generated/api";
import { SignedIn } from "@/vly/components/auth/AuthComponents";
import { useQuery, useMutation } from "convex/react";
import { Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getExternalPreviewUrl } from "@/vly/lib/project-preview-url";

// Clean project item component with drop shadow borders
const ProjectItem = React.memo(
  ({
    project,
    isNarrow: _isNarrow,
    updateLastOpened,
  }: {
    project: any;
    isNarrow: boolean;
    updateLastOpened: any;
  }) => {
    const router = useRouter();

    const handleEditSite = useCallback(() => {
      // Update last opened timestamp when edit site is clicked
      updateLastOpened({
        semanticIdentifier: project.semantic_identifier,
      }).catch((error: any) => {
        console.error("Failed to update last opened timestamp:", error);
        // Silently fail - this is not critical functionality
      });

      router.push(`/web/project/${project.semantic_identifier}`);
    }, [project.semantic_identifier, updateLastOpened, router]);

    return (
      <div
        className="hover-scale-width relative h-24 w-full rounded-[20px] border-2 border-white bg-white/40 backdrop-blur-sm md:w-[49%]"
        style={{
          transform: "translate3d(0, 0, 0)", // Force GPU layer without will-change
          backfaceVisibility: "hidden" as const,
          contain: "layout style paint", // Rendering isolation
        }}
      >
        <div className="flex h-24 w-full items-center justify-between rounded-[20px] px-8 py-6">
          {/* Project name and date */}
          <div className="flex items-center justify-start gap-[3vw]">
            <div className="flex h-14 flex-col justify-between">
              <div className="font-['Geist'] text-sm font-medium leading-tight text-gray-900">
                {project.name || "Untitled Project"}
              </div>
              <div className="font-['Geist'] text-xs font-normal leading-tight text-gray-500">
                Last opened{" "}
                {project.last_opened
                  ? new Date(project.last_opened).toLocaleDateString()
                  : "Never opened"}
              </div>
            </div>
          </div>
          {/* Action buttons with clean styling */}
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleEditSite}
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 font-['Geist'] text-xs font-medium text-gray-700 transition-all duration-150 hover:border-gray-300 hover:bg-gray-100"
            >
              Edit Site
            </button>
            <button
              onClick={() => {
                const url = getExternalPreviewUrl(project) ?? "";
                if (url) {
                  window.open(url, "_blank");
                } else {
                  router.push(`/web/project/${project.semantic_identifier}`);
                }
              }}
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 font-['Geist'] text-xs font-medium text-gray-700 transition-all duration-150 hover:border-gray-300 hover:bg-gray-100"
            >
              Preview Site
            </button>
          </div>
        </div>
      </div>
    );
  },
);

ProjectItem.displayName = "ProjectItem";

export function LandingProjectList() {
  const projects = useQuery(api.project.getUserProjects);
  const updateLastOpened = useMutation(api.project.updateLastOpened);
  const [showAll, setShowAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6); // Start with 6 projects
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const router = useRouter();

  // Move all useMemo and useCallback hooks to the top level to ensure consistent hook order
  const displayed = useMemo(() => {
    if (!projects) return [];
    if (!showAll) return projects.slice(0, 2);
    return projects.slice(0, visibleCount);
  }, [projects, showAll, visibleCount]);

  const chunkArray = useCallback(<T,>(arr: T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }, []);

  const projectRows = useMemo(
    () => chunkArray(displayed, 2),
    [displayed, chunkArray],
  );

  const loadMore = useCallback(() => {
    if (!projects) return;
    setVisibleCount((prev) => Math.min(prev + 6, projects.length));
  }, [projects]);

  const toggleShowAll = useCallback(() => {
    if (!projects) return;
    setShowAll((prev) => {
      if (!prev) {
        // When showing all, start with 6 projects
        setVisibleCount(Math.min(6, projects.length));
      } else {
        // When hiding, reset to 2
        setVisibleCount(6);
      }
      return !prev;
    });
  }, [projects]);

  useEffect(() => {
    function checkWidth() {
      if (containerRef.current) {
        setIsNarrow(containerRef.current.offsetWidth < 660); // 2*320 + gap
      }
    }
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  if (projects === undefined || projects === null) {
    return (
      <section className="mx-auto flex w-full justify-center pt-4 transition-all duration-300">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="w-full py-4 text-center">
        <div className="font-sans text-sm text-gray-500">No projects yet</div>
      </section>
    );
  }

  const hasMore = projects.length > 2;
  const hasMoreToLoad = showAll && visibleCount < projects.length;
  const remaining = showAll
    ? projects.length - visibleCount
    : projects.length - 2;

  return (
    <SignedIn>
      <section className="w-full text-left transition-all duration-300">
        <div
          ref={containerRef}
          className="mb-8 flex w-full flex-col gap-y-6 px-4"
        >
          {projectRows.map((row: typeof displayed, rowIdx: number) => (
            <div
              key={rowIdx}
              className="flex w-full flex-col gap-y-4 md:flex-row md:gap-x-4 md:gap-y-0"
            >
              {row.map((project: any) => (
                <ProjectItem
                  key={project._id}
                  project={project}
                  isNarrow={isNarrow}
                  updateLastOpened={updateLastOpened}
                />
              ))}
            </div>
          ))}
        </div>
        {hasMore && (
          <div className="mb-8 mt-8 flex w-full flex-col items-center gap-4 px-4">
            {!showAll && (
              <button
                onClick={toggleShowAll}
                className="rounded-[8px] border border-white/80 bg-white/60 px-4 py-2.5 font-['Geist'] text-sm font-medium text-zinc-700 shadow-sm transition-all duration-200 hover:bg-white/80"
              >
                Show {projects.length - 2} More Projects
              </button>
            )}
            {showAll && (
              <>
                {hasMoreToLoad && (
                  <button
                    onClick={loadMore}
                    className="mb-2 rounded-[8px] border border-white/80 bg-white/60 px-4 py-2.5 font-['Geist'] text-sm font-medium text-zinc-700 shadow-sm transition-all duration-200 hover:bg-white/80"
                  >
                    Load {Math.min(6, remaining)} More ({remaining} remaining)
                  </button>
                )}
                <button
                  onClick={toggleShowAll}
                  className="rounded-[8px] border border-white/60 bg-white/40 px-4 py-2.5 font-['Geist'] text-sm font-medium text-zinc-600 shadow-sm transition-all duration-200 hover:bg-white/60"
                >
                  Show Less
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </SignedIn>
  );
}
