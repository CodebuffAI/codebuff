"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Globe2,
  FileCog,
  Rocket,
  Bot,
  GitBranch,
  Github,
  Loader,
  Loader2,
  Play,
  Square,
  Save,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CloudTopBar } from "@/vly/components/project-2/cloud/CloudTopBar";
import { ConnectedRepoEnvPanel } from "@/vly/components/project-2/ConnectedRepoEnvPanel";
import { CliAgentConfigurationPanel } from "@/vly/components/project-2/agent-chat/CliAgentConfigurationPanel";
import {
  FreebuffModelSelector,
  FREEBUFF_MODEL_STORAGE_KEY,
  resolveVisibleFreebuffModel,
} from "@/vly/components/project-2/FreebuffModelSelector";
import { CloudBranchSwitcher } from "@/vly/components/project-2/cloud/CloudBranchSwitcher";
import { DEFAULT_FREEBUFF_MODEL_ID } from "@codebuff/common/constants/freebuff-models";
import { toast } from "sonner";

type Section = "general" | "preview" | "env" | "deploys" | "agent" | "git";

const SECTIONS: { id: Section; label: string; Icon: typeof SettingsIcon }[] = [
  { id: "general", label: "General", Icon: SettingsIcon },
  { id: "preview", label: "Preview", Icon: Globe2 },
  { id: "env", label: "Environment", Icon: FileCog },
  { id: "deploys", label: "Deploys", Icon: Rocket },
  { id: "agent", label: "Agent", Icon: Bot },
  { id: "git", label: "Git", Icon: GitBranch },
];

function isSection(value: string | null): value is Section {
  return (
    value === "general" ||
    value === "preview" ||
    value === "env" ||
    value === "deploys" ||
    value === "agent" ||
    value === "git"
  );
}

export default function CloudProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const semanticIdentifier = typeof params.id === "string" ? params.id : "";

  const project = useQuery(api.project.getProjectData, { semanticIdentifier });

  const sectionParam = searchParams.get("section");
  const section: Section = isSection(sectionParam) ? sectionParam : "general";

  const setSection = (next: Section) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("section", next);
    router.replace(`/cloud/project/${semanticIdentifier}/settings?${sp.toString()}`);
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
            onClick={() => router.push("/cloud")}
          >
            Back to Cloud
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="relative z-50 flex-shrink-0">
        <CloudTopBar project={project} />
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-[#181818] px-3 py-2">
        <button
          type="button"
          onClick={() => router.push(`/cloud/project/${semanticIdentifier}`)}
          className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full bg-muted/50 px-3 text-xs font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Workspace
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
              {SECTIONS.find((s) => s.id === section)?.label ?? "Settings"}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {project.repo_full_name ||
                project.name ||
                project.semantic_identifier}
            </p>
          </header>

          {section === "general" && <GeneralSection project={project} />}
          {section === "preview" && (
            <PreviewSection
              semanticIdentifier={semanticIdentifier}
              project={project}
            />
          )}
          {section === "env" && (
            <SettingsCard
              title="Environment variables"
              description="Edit config files (e.g. .env) inside the repo. For interactive auth, use the in-app Terminal or VS Code."
            >
              <div className="h-[460px] overflow-hidden rounded-lg border border-border">
                <ConnectedRepoEnvPanel semanticIdentifier={semanticIdentifier} />
              </div>
            </SettingsCard>
          )}
          {section === "deploys" && (
            <DeploysSection
              semanticIdentifier={semanticIdentifier}
              project={project}
            />
          )}
          {section === "agent" && (
            <AgentSection semanticIdentifier={semanticIdentifier} />
          )}
          {section === "git" && (
            <GitSection
              semanticIdentifier={semanticIdentifier}
              project={project}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type ProjectData = NonNullable<
  ReturnType<typeof useQuery<typeof api.project.getProjectData>>
>;

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-border bg-card/60 p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function GeneralSection({ project }: { project: ProjectData }) {
  return (
    <SettingsCard title="Project">
      <div className="space-y-3">
        <Field label="Repository" value={project.repo_full_name ?? "—"} />
        <Field label="Identifier" value={project.semantic_identifier ?? "—"} />
        <Field label="Current branch" value={project.current_branch ?? "—"} />
        <Field
          label="Created"
          value={
            project._creationTime
              ? new Date(project._creationTime).toLocaleString()
              : "—"
          }
        />
      </div>
    </SettingsCard>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-sm text-foreground">
        {value}
      </p>
    </div>
  );
}

function PreviewSection({
  semanticIdentifier,
  project,
}: {
  semanticIdentifier: string;
  project: ProjectData;
}) {
  const rc = project.runtime_config;
  const setRuntimeConfig = useAction(api.cloud.preview.setRuntimeConfig);
  const startPreview = useAction(api.cloud.preview.startPreview);
  const stopPreview = useAction(api.cloud.preview.stopPreview);

  const [previewCommand, setPreviewCommand] = useState(
    rc?.preview_command ?? "",
  );
  const [previewPort, setPreviewPort] = useState(
    rc?.preview_port ? String(rc.preview_port) : "",
  );
  const [buildCommand, setBuildCommand] = useState(rc?.build_command ?? "");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await setRuntimeConfig({
        semanticIdentifier,
        previewCommand: previewCommand.trim() || undefined,
        previewPort: previewPort ? Number(previewPort) : undefined,
        buildCommand: buildCommand.trim() || undefined,
      });
      toast.success("Saved preview configuration");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsCard
        title="Dev server (preview)"
        description="Override the dev command and port the agent detected. The preview never auto-starts — start it when you need it and stop it to free sandbox resources."
      >
        <div className="space-y-3">
          <LabeledInput
            label="Preview command"
            value={previewCommand}
            onChange={setPreviewCommand}
            placeholder="bun run dev --host 0.0.0.0 --port 5173"
          />
          <LabeledInput
            label="Preview port"
            value={previewPort}
            onChange={setPreviewPort}
            placeholder="5173"
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy("start");
                try {
                  const r = await startPreview({ semanticIdentifier });
                  r.running ? toast.success(r.message) : toast.error(r.message);
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {busy === "start" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 text-primary" />
              )}
              Start
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy("stop");
                try {
                  const r = await stopPreview({ semanticIdentifier });
                  toast.success(r.message);
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {busy === "stop" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4 text-red-400" />
              )}
              Stop
            </button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Build command"
        description="The production build command used when publishing."
      >
        <div className="space-y-3">
          <LabeledInput
            label="Build command"
            value={buildCommand}
            onChange={setBuildCommand}
            placeholder="bun run build"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </SettingsCard>
    </>
  );
}

function DeploysSection({
  semanticIdentifier,
  project,
}: {
  semanticIdentifier: string;
  project: ProjectData;
}) {
  const triggerPublish = useAction(
    (api as any).cloud.publish.triggerConnectedRepoPublish,
  );
  const [publishing, setPublishing] = useState(false);

  return (
    <SettingsCard
      title="Deploys"
      description="Publish a production build of your project. The build uses the configured build command."
    >
      <div className="space-y-3">
        <Field
          label="Build command"
          value={project.runtime_config?.build_command ?? "not set"}
        />
        <button
          type="button"
          onClick={async () => {
            setPublishing(true);
            try {
              await triggerPublish({ semanticIdentifier });
              toast.success("Publish queued");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to publish");
            } finally {
              setPublishing(false);
            }
          }}
          disabled={publishing}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          Publish now
        </button>
      </div>
    </SettingsCard>
  );
}

function AgentSection({ semanticIdentifier }: { semanticIdentifier: string }) {
  const [defaultModel, setDefaultModel] = useState<string>(
    DEFAULT_FREEBUFF_MODEL_ID,
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FREEBUFF_MODEL_STORAGE_KEY);
      if (stored) setDefaultModel(resolveVisibleFreebuffModel(stored));
    } catch {
      // ignore
    }
  }, []);

  const onModelChange = useCallback((modelId: string) => {
    setDefaultModel(modelId);
    try {
      localStorage.setItem(FREEBUFF_MODEL_STORAGE_KEY, modelId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <>
      <SettingsCard
        title="Default model"
        description="New projects use the free Freebuff MiniMax model by default. Change the model used for new chat threads."
      >
        <FreebuffModelSelector
          selectedModelId={defaultModel}
          onModelChange={onModelChange}
        />
      </SettingsCard>

      <SettingsCard
        title="AI credentials"
        description="Connect Claude Code or Codex with OAuth, or bring your own API keys (BYOK) to run premium models."
      >
        <CliAgentConfigurationPanel
          variant="settings"
          projectSemanticIdentifier={semanticIdentifier}
        />
      </SettingsCard>
    </>
  );
}

function GitSection({
  semanticIdentifier,
  project,
}: {
  semanticIdentifier: string;
  project: ProjectData;
}) {
  return (
    <SettingsCard
      title="Git"
      description="Switch branches, or open the connected repository on GitHub."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CloudBranchSwitcher
            semanticIdentifier={semanticIdentifier}
            fallbackBranch={project.current_branch}
            defaultBranch={project.repo_default_branch}
          />
          {project.repo_full_name && (
            <a
              href={`https://github.com/${project.repo_full_name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground/85 hover:bg-muted"
            >
              <Github className="h-3.5 w-3.5" />
              Open on GitHub
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Commits, pushes, and pull requests are handled by the agent from the
          Git tab in the workspace.
        </p>
      </div>
    </SettingsCard>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus:border-primary"
      />
    </div>
  );
}
