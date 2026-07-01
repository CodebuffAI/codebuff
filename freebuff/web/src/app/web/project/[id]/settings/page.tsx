"use client";

import { Suspense, lazy } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowLeft, Loader } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { TopBar } from "@/vly/components/project-2/TopBar";
import { getDirectPreviewUrl } from "@/vly/lib/project-preview-url";

const Monitoring = lazy(() => import("@/vly/components/project-2/Monitoring"));
const EnvVarsView = lazy(() => import("@/vly/components/project-2/EnvVarsView"));
const DatabaseView = lazy(() => import("@/vly/components/project-2/DatabaseView"));
const GitHubSyncView = lazy(() => import("@/vly/components/project-2/GitHubSyncView"));
const DeploymentSettingsPanel = lazy(() =>
  import("@/vly/components/project-2/deployment/DeploymentDialog").then((m) => ({
    default: m.DeploymentSettingsPanel,
  })),
);

type Section =
  | "general"
  | "usage"
  | "database"
  | "env"
  | "github"
  | "deployments";

const SECTIONS: {
  id: Section;
  group: string;
  label: string;
}[] = [
  { id: "general", group: "Project", label: "General" },
  { id: "usage", group: "Project", label: "Usage" },
  { id: "deployments", group: "Infrastructure", label: "Deployments" },
  { id: "database", group: "Infrastructure", label: "Database" },
  { id: "env", group: "Infrastructure", label: "Environment vars" },
  { id: "github", group: "Infrastructure", label: "GitHub sync" },
];

const SECTION_GROUPS = ["Project", "Infrastructure"] as const;

const EXTERNAL_LINKS = [
  {
    label: "Discord",
    href: "https://discord.gg/yXG3w7wxfs",
  },
];

function isSection(value: string | null): value is Section {
  return (
    value === "general" ||
    value === "usage" ||
    value === "deployments" ||
    value === "database" ||
    value === "env" ||
    value === "github"
  );
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const semanticIdentifier = typeof params.id === "string" ? params.id : "";

  const project = useQuery(api.project.getProjectData, { semanticIdentifier });

  const sectionParam = searchParams.get("section");
  const section: Section = isSection(sectionParam) ? sectionParam : "general";

  const setSection = (next: Section) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", next);
    router.replace(`/web/project/${semanticIdentifier}/settings?${params.toString()}`);
  };

  const goBack = () => {
    router.push(`/web/project/${semanticIdentifier}`);
  };

  if (project === undefined) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl bg-card/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Project not found or you don&apos;t have access.
          </p>
          <button
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            onClick={() => router.push("/web/dashboard")}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const fullWindowSection = section !== "general";
  const activeLabel = SECTIONS.find((s) => s.id === section)?.label ?? "Settings";

  const navButton = (id: Section, label: string) => (
    <button
      key={id}
      onClick={() => setSection(id)}
      className={cn(
        "rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
        section === id
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
      aria-pressed={section === id}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      {/* ── Top-level navigation — same as project page so the user is
            never "lost" inside the settings flow. ─────────────────────── */}
      <div className="relative z-50 flex-shrink-0">
        <TopBar project={project} />
      </div>

      {/* Mobile section switcher */}
      <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-border/60 px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={goBack}
          className="flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to project"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Project
        </button>
        <div className="h-4 w-px flex-shrink-0 bg-border/60" aria-hidden />
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={cn(
              "flex-shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors",
              section === id
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-border/60 px-3 py-4 md:flex">
          <button
            type="button"
            onClick={goBack}
            className="mb-4 flex items-center gap-1.5 px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to project
          </button>
          {SECTION_GROUPS.map((group) => (
            <div key={group} className="mb-4">
              <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {group}
              </p>
              <div className="flex flex-col gap-0.5">
                {SECTIONS.filter((s) => s.group === group).map((s) =>
                  navButton(s.id, s.label),
                )}
              </div>
            </div>
          ))}
          <div>
            <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Help
            </p>
            <div className="flex flex-col gap-0.5">
              {EXTERNAL_LINKS.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            className={
              fullWindowSection
                ? "flex h-full w-full flex-col overflow-hidden p-3 sm:p-4"
                : "mx-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto px-5 py-8 sm:px-8 sm:py-10"
            }
          >
            {!fullWindowSection && (
              <header className="mb-6">
                <h1 className="text-[15px] font-medium text-foreground">
                  {activeLabel}
                </h1>
                <p className="mt-1 truncate text-[13px] text-muted-foreground">
                  {project.name || project.semantic_identifier}
                </p>
              </header>
            )}

            <Suspense
              fallback={
                <div className="flex h-40 w-full items-center justify-center">
                  <Loader className="h-5 w-5 animate-spin text-primary" />
                </div>
              }
            >
              <div
                className={
                  fullWindowSection
                    ? "min-h-0 flex-1 overflow-y-auto"
                    : "min-h-0"
                }
              >
                {section === "general" && <GeneralSection project={project} />}
                {section === "usage" && <Monitoring project={project} />}
                {section === "deployments" && (
                  <DeploymentSettingsPanel projectId={project._id} />
                )}
                {section === "database" && <DatabaseView project={project} />}
                {section === "env" && <EnvVarsView project={project} />}
                {section === "github" && <GitHubSyncView projectId={project._id} />}
              </div>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

function GeneralSection({
  project,
}: {
  project: NonNullable<
    ReturnType<typeof useQuery<typeof api.project.getProjectData>>
  >;
}) {
  return (
    <div>
      <Field label="Project name" value={project.name ?? "—"} />
      <Field label="Identifier" value={project.semantic_identifier ?? "—"} />
      <Field label="Preview URL" value={getDirectPreviewUrl(project) ?? "—"} />
      <Field
        label="Created"
        value={
          project._creationTime
            ? new Date(project._creationTime).toLocaleString()
            : "—"
        }
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border/60 py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <p className="text-[13px] font-medium text-foreground">{label}</p>
      <p className="break-all text-[13px] text-muted-foreground sm:text-right">
        {value}
      </p>
    </div>
  );
}
