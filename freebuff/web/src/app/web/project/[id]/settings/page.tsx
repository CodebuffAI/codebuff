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
  LifeBuoy,
  Users as UsersIcon,
  CreditCard,
  Server,
  Database,
  KeyRound,
  Github,
  Loader,
} from "lucide-react";
import { api } from "@/convex/_generated/api";

const AppAndSupportView = lazy(
  () => import("@/vly/components/project-2/AppAndSupportView"),
);
const HireDevelopersView = lazy(
  () => import("@/vly/components/project-2/HireDevelopersView"),
);
const Monitoring = lazy(() => import("@/vly/components/project-2/Monitoring"));
const BackendManagement = lazy(
  () => import("@/vly/components/project-2/BackendManagement"),
);
const EnvVarsView = lazy(() => import("@/vly/components/project-2/EnvVarsView"));
const DatabaseView = lazy(() => import("@/vly/components/project-2/DatabaseView"));
const GitHubSyncView = lazy(() => import("@/vly/components/project-2/GitHubSyncView"));

type Section =
  | "general"
  | "usage"
  | "support"
  | "hire"
  | "billing"
  | "backend"
  | "database"
  | "env"
  | "github";

const SECTIONS: {
  id: Section;
  group: string;
  label: string;
  Icon: typeof SettingsIcon;
}[] = [
  { id: "general", group: "Project", label: "General", Icon: SettingsIcon },
  { id: "usage", group: "Project", label: "Usage", Icon: Activity },
  { id: "billing", group: "Project", label: "Plans & credits", Icon: CreditCard },
  { id: "support", group: "Help", label: "App & support", Icon: LifeBuoy },
  { id: "hire", group: "Help", label: "Hire developers", Icon: UsersIcon },
  { id: "backend", group: "Infrastructure", label: "Backend", Icon: Server },
  { id: "database", group: "Infrastructure", label: "Database", Icon: Database },
  { id: "env", group: "Infrastructure", label: "Environment vars", Icon: KeyRound },
  { id: "github", group: "Infrastructure", label: "GitHub sync", Icon: Github },
];

function isSection(value: string | null): value is Section {
  return (
    value === "general" ||
    value === "usage" ||
    value === "support" ||
    value === "hire" ||
    value === "billing" ||
    value === "backend" ||
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
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
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

  const groups = Array.from(new Set(SECTIONS.map((s) => s.group)));

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-border/60 bg-card/40">
        <button
          onClick={goBack}
          className="m-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </button>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
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
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Detail ─────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">
              {SECTIONS.find((s) => s.id === section)?.label ?? "Settings"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
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
            {section === "general" && <GeneralSection project={project} />}
            {section === "usage" && <Monitoring project={project} />}
            {section === "billing" && <BillingPlaceholder />}
            {section === "support" && <AppAndSupportView project={project} />}
            {section === "hire" && <HireDevelopersView />}
            {section === "backend" && <BackendManagement project={project} />}
            {section === "database" && <DatabaseView project={project} />}
            {section === "env" && <EnvVarsView project={project} />}
            {section === "github" && <GitHubSyncView projectId={project._id} />}
          </Suspense>
        </div>
      </main>
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
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}

function BillingPlaceholder() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="text-sm text-foreground/90">
        Plans &amp; credits live on the main dashboard.
      </p>
      <a
        href="/web/dashboard"
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Open dashboard
      </a>
    </div>
  );
}
