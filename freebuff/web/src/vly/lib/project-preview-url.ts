const DAYTONA_PREVIEW_PORT = 5173;
const DAYTONA_SANDBOX_PREFIX = "daytona:";

export type ProjectPreviewLike = {
  sandbox_id?: string | null;
  preview_url?: string | null;
  pretty_preview_url?: string | null;
};

export function getDaytonaPreviewUrl(
  project: ProjectPreviewLike | null | undefined,
) {
  const sandboxId = project?.sandbox_id;
  if (!sandboxId?.startsWith(DAYTONA_SANDBOX_PREFIX)) {
    return null;
  }

  const daytonaSandboxId = sandboxId.slice(DAYTONA_SANDBOX_PREFIX.length);
  if (!daytonaSandboxId) {
    return null;
  }

  return `https://${DAYTONA_PREVIEW_PORT}-${daytonaSandboxId}.proxy.daytona.works`;
}

export function getDirectPreviewUrl(
  project: ProjectPreviewLike | null | undefined,
) {
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
  return project?.pretty_preview_url ?? getDirectPreviewUrl(project);
}
