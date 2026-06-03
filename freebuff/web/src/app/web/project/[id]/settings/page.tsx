"use client";

import { Suspense, lazy } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Activity,
  Server,
  Database,
  KeyRound,
  Github,
  Rocket,
  MessageCircle,
  Loader,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { TopBar } from "@/vly/components/project-2/TopBar";

const Monitoring = lazy(() => import("@/vly/components/project-2/Monitoring"));
const BackendManagement = lazy(
  () => import("@/vly/components/project-2/BackendManagement"),
);
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
  | "backend"
  | "database"
  | "env"
  | "github"
  | "deployments";

const SECTIONS: {
  id: Section;
  group: string;
  label: string;
  Icon: typeof SettingsIcon;
}[] = [
  { id: "general", group: "Project", label: "General", Icon: SettingsIcon },
  { id: "usage", group: "Project", label: "Usage", Icon: Activity },
  { id: "backend", group: "Infrastructure", label: "Backend", Icon: Server },
  { id: "deployments", group: "Infrastructure", label: "Deployments", Icon: Rocket },
  { id: "database", group: "Infrastructure", label: "Database", Icon: Database },
  { id: "env", group: "Infrastructure", label: "Environment vars", Icon: KeyRound },
  { id: "github", group: "Infrastructure", label: "GitHub sync", Icon: Github },
];

const EXTERNAL_LINKS = [
  {
    group: "Help",
    label: "Discord",
    href: "https://discord.gg/yXG3w7wxfs",
    Icon: MessageCircle,
  },
];

function isSection(value: string | null): value is Section {
  return (
    value === "general" ||
    value === "usage" ||
    value === "backend" ||
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

  const navGroups = Array.from(
    new Set([
      ...SECTIONS.map((s) => s.group),
      ...EXTERNAL_LINKS.map((link) => link.group),
    ]),
  );
  const fullWindowSection = section === "backend" || section === "database";

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      {/* ── Top-level navigation — same as project page so the user is
            never "lost" inside the settings flow. ─────────────────────── */}
      <div className="relative z-50 flex-shrink-0">
        <TopBar project={project} />
      </div>

      {/* Mobile-only section selector. On small screens the sidebar
          collapses into a horizontally scrollable chip strip so there's
          always a one-tap path to any settings group without sacrificing
          the iframe-style "no horizontal page scroll" rule. */}
      <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={goBack}
          className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full bg-muted/50 px-3 text-xs font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to project"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Project
        </button>
        <div className="h-5 w-px flex-shrink-0 bg-border/60" aria-hidden />
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = section === id;
          return (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/30 text-foreground/85 hover:bg-muted hover:text-foreground"
              }`}
              aria-pressed={isActive}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
        {EXTERNAL_LINKS.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full bg-muted/30 px-3 text-xs font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Desktop sidebar ────────────────────────────────────────── */}
        <aside className="hidden h-full w-64 flex-shrink-0 flex-col bg-card/30 lg:flex">
          <button
            onClick={goBack}
            className="m-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </button>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {navGroups.map((group) => (
              <div key={group} className="mb-5">
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {group}
                </p>
                <div className="flex flex-col gap-0.5">
                  {SECTIONS.filter((s) => s.group === group).map(
                    ({ id, label, Icon }) => {
                      const isActive = section === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setSection(id)}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "bg-primary/15 text-primary"
                              : "text-foreground/85 hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      );
                    },
                  )}
                  {EXTERNAL_LINKS.filter((link) => link.group === group).map(
                    ({ label, href, Icon }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </a>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Detail ─────────────────────────────────────────────────── */}
        <main className="min-w-0 flex-1 overflow-hidden">
          <div
            className={
              fullWindowSection
                ? "flex h-full w-full flex-col px-4 py-4 sm:px-6"
                : "mx-auto flex h-full w-full max-w-4xl flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8"
            }
          >
            <header className="mb-5 sm:mb-6">
              <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                {SECTIONS.find((s) => s.id === section)?.label ?? "Settings"}
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {project.name || project.semantic_identifier}
              </p>
            </header>

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
                    ? "min-h-0 flex-1"
                    : "min-h-0"
                }
              >
                {section === "general" && <GeneralSection project={project} />}
                {section === "usage" && <Monitoring project={project} />}
                {section === "backend" && <BackendManagement project={project} />}
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
    <div className="space-y-4">
      <Field label="Project name" value={project.name ?? "—"} />
      <Field label="Identifier" value={project.semantic_identifier ?? "—"} />
      <Field
        label="Preview URL"
        value={project.pretty_preview_url ?? project.preview_url ?? "—"}
      />
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
    <div className="rounded-xl bg-card/60 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}
