const DAYTONA_PREVIEW_PORT = 5173;
const DAYTONA_SANDBOX_PREFIX = "daytona:";

export type ProjectPreviewLike = {
  sandbox_id?: string | null;
  preview_url?: string | null;
  pretty_preview_url?: string | null;
  // Freebuff Cloud (connected repo) fields.
  project_type?: "template" | "connected_repo" | null;
  runtime_config?: { preview_port?: number | null } | null;
};

export function getDaytonaPreviewUrl(
  project: ProjectPreviewLike | null | undefined,
  port: number = DAYTONA_PREVIEW_PORT,
) {
  const sandboxId = project?.sandbox_id;
  if (!sandboxId?.startsWith(DAYTONA_SANDBOX_PREFIX)) {
    return null;
  }

  const daytonaSandboxId = sandboxId.slice(DAYTONA_SANDBOX_PREFIX.length);
  if (!daytonaSandboxId) {
    return null;
  }

  return `https://${port}-${daytonaSandboxId}.proxy.daytona.works`;
}

export function getDirectPreviewUrl(
  project: ProjectPreviewLike | null | undefined,
) {
  // Connected repos run the dev server on an agent-detected port. Never fall
  // back to the 5173 default — that would show a wrong Daytona proxy URL in
  // the iframe before the real port is detected from the process logs.
  if (project?.project_type === "connected_repo") {
    const port = project?.runtime_config?.preview_port ?? undefined;
    return (
      project?.preview_url ??
      (port ? getDaytonaPreviewUrl(project, port) : null) ??
      null
    );
  }

  return (
    project?.preview_url ??
    getDaytonaPreviewUrl(project) ??
    project?.pretty_preview_url ??
    null
  );
}

export function getExternalPreviewUrl(
  project: ProjectPreviewLike | null | undefined,
) {
  // For connected repos, the pretty (*.freebuff.dev) proxy isn't wired to the
  // dynamic port, so use the direct preview URL.
  if (project?.project_type === "connected_repo") {
    return getDirectPreviewUrl(project);
  }
  return project?.pretty_preview_url ?? getDirectPreviewUrl(project);
}
